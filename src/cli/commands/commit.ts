import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import ora from 'ora';
import simpleGit from 'simple-git';
import { loadConfig } from '../../config/loader.js';
import { ensureGitRepo, getStagedDiff, commit } from '../../git/operations.js';
import { CommitWriter } from '../../agents/commit-writer.js';
import { ClaudeProvider } from '../../ai/claude.js';
import { getAvailableProviders } from '../../ai/multi-provider.js';
import { ConsensusRunner } from '../../ai/consensus.js';
import { Verifier, verifyLoop } from '../../agents/verifier.js';
import { commitMessageSchema } from '../../agents/commit-writer.js';
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../../session/index.js';
import { HookRunner } from '../../hooks/runner.js';

interface IssueContext {
  title: string;
  summary: string;
  type: string;
}

async function loadCurrentIssue(cwd: string): Promise<IssueContext | undefined> {
  try {
    const issuePath = path.join(cwd, '.junflow', 'current-issue.json');
    const content = await fs.readFile(issuePath, 'utf-8');
    return JSON.parse(content) as IssueContext;
  } catch {
    return undefined;
  }
}

function renderSuggestions(candidates: string[]): string {
  const lines = candidates.map((msg, i) => `  ${chalk.bold(i + 1)}. ${msg}`);
  lines.push('');
  lines.push(chalk.dim('  [1-3] 선택 / [e] 직접 수정 / [q] 취소'));
  return lines.join('\n');
}

export const commitCommand = new Command('commit')
  .description('AI 기반 커밋 메시지 생성')
  .option('-a, --all', '모든 변경사항 stage 후 커밋')
  .option('-l, --lang <language>', '커밋 언어 (ko/en)')
  .option('--convention <type>', '커밋 컨벤션 (conventional/gitmoji)')
  .option('--auto', '첫 번째 추천 자동 사용')
  .option('--dry-run', '메시지만 출력, 커밋하지 않음')
  .option('--consensus', '멀티모델 합의 (사용 가능한 모든 AI 모델로 생성 후 합성)')
  .option('--verify', '자동 검증 루프 (품질 미달 시 재생성)')
  .action(async (options: {
    all?: boolean;
    lang?: string;
    convention?: string;
    auto?: boolean;
    dryRun?: boolean;
    consensus?: boolean;
    verify?: boolean;
  }) => {
    const cwd = process.cwd();

    // 0. pre-commit 훅 실행
    const hookRunner = await HookRunner.fromConfig(cwd);
    try {
      await hookRunner.run('pre-commit');
    } catch (err) {
      handleCliError(err);
    }

    // 1. Config 로드
    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      handleCliError(err);
    }

    // 2. Git 저장소 확인
    try {
      await ensureGitRepo(cwd);
    } catch {
      cliErrors.notGitRepo();
    }

    // 3. --all 이면 git add -A
    if (options.all) {
      try {
        await simpleGit(cwd).add('-A');
        logger.info('모든 변경사항을 스테이징했습니다.');
      } catch (err) {
        handleCliError(err);
      }
    }

    // 4. staged diff 확인
    let diff: string;
    try {
      diff = await getStagedDiff(cwd);
    } catch (err) {
      handleCliError(err);
    }

    if (!diff || diff.trim() === '') {
      cliErrors.noStagedFiles();
    }

    // 5. 이슈 컨텍스트 로드 (있으면)
    const issueAnalysis = await loadCurrentIssue(cwd);

    // 6. CommitWriter 실행
    const apiKey = config.ai.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      cliErrors.missingApiKey('ANTHROPIC_API_KEY');
    }

    const aiProvider = new ClaudeProvider(apiKey!);
    const agent = new CommitWriter(aiProvider);
    const agentLogger = {
      info: (msg: string) => logger.debug(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => logger.debug(msg),
    };
    const agentContext = { workingDir: cwd, config, logger: agentLogger };
    const agentInput = {
      diff,
      issueAnalysis,
      convention: options.convention as 'conventional' | 'gitmoji' | undefined,
      language: options.lang as 'ko' | 'en' | undefined,
    };

    let message: string;
    let alternatives: string[];

    if (options.consensus) {
      // 멀티모델 합의 모드
      const spinner = ora('멀티모델 합의 생성 중...').start();
      const providers = await getAvailableProviders();
      if (providers.length === 0) {
        spinner.stop();
        logger.error('AI API 키가 설정되지 않았습니다. ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 중 하나를 설정해주세요.');
        process.exit(1);
      }
      spinner.text = `${providers.length}개 모델로 커밋 메시지 생성 중...`;

      const consensusRunner = new ConsensusRunner(aiProvider);
      const { truncateDiff } = await import('../../ai/diff-truncator.js');
      const { COMMIT_WRITER_SYSTEM } = await import('../../ai/prompts/commit-message.js');
      const { truncatedDiff } = truncateDiff(diff);

      const convention = agentInput.convention ?? config.git.commitConvention;
      const language = agentInput.language ?? config.git.commitLanguage;

      try {
        const consensusResult = await consensusRunner.run(
          providers,
          {
            systemPrompt: `${COMMIT_WRITER_SYSTEM}\nUse ${convention} convention. ${language === 'ko' ? '한국어로 작성.' : 'Write in English.'}\nRespond with JSON: {"message":"string","alternatives":["string"],"scope":"string|null","breakingChange":boolean}`,
            userPrompt: `## Staged Diff\n${truncatedDiff}${issueAnalysis ? `\n\n## Issue Context\nTitle: ${issueAnalysis.title}\nType: ${issueAnalysis.type}` : ''}`,
            maxTokens: 2048,
            temperature: 0.3,
          },
          commitMessageSchema,
        );

        spinner.stop();
        logger.info(`합의 완료: ${consensusResult.providersUsed.join(' + ')} (일치도: ${consensusResult.agreementScore}%)`);
        message = consensusResult.consensus.message;
        alternatives = consensusResult.consensus.alternatives;

        await sessionManager.recordAgentCall({
          agentName: 'ConsensusRunner',
          command: 'commit --consensus',
          timestamp: new Date().toISOString(),
          durationMs: 0,
          tokensUsed: consensusResult.totalTokensUsed,
          success: true,
        }).catch(() => {});
      } catch (err) {
        spinner.stop();
        handleCliError(err);
      }
    } else if (options.verify) {
      // 자동 검증 루프 모드
      const spinner = ora('AI 커밋 메시지 생성 + 검증 중...').start();
      const verifier = new Verifier(aiProvider);

      try {
        const verified = await verifyLoop(agent, verifier, agentInput, agentContext, {
          taskDescription: `Generate a high-quality commit message for the following diff:\n${diff.slice(0, 500)}...`,
          criteria: [
            'Message follows conventional commit format',
            'Message is concise (under 72 characters)',
            'Message accurately describes the changes',
            'Alternatives are meaningfully different from main message',
          ],
          maxRetries: 2,
          onRetry: (attempt, issues) => {
            spinner.text = `검증 실패, 재생성 중 (${attempt}/2)... ${issues[0] ?? ''}`;
          },
        });

        spinner.stop();

        const vr = verified.verification;
        const statusIcon = vr.approved ? chalk.green('✓') : chalk.yellow('△');
        logger.info(`검증 ${statusIcon} (${vr.score}/10, ${verified.attempts}회 시도)`);
        if (vr.issues.length > 0) {
          for (const issue of vr.issues) {
            logger.warn(`  ${issue}`);
          }
        }

        if (!verified.result.success) {
          handleCliError(verified.result.error);
        }

        message = verified.result.data.message;
        alternatives = verified.result.data.alternatives;

        await sessionManager.recordAgentCall({
          agentName: 'CommitWriter+Verifier',
          command: 'commit --verify',
          timestamp: new Date().toISOString(),
          durationMs: verified.result.metadata.durationMs,
          tokensUsed: verified.result.metadata.tokensUsed,
          success: verified.result.success,
        }).catch(() => {});
      } catch (err) {
        spinner.stop();
        handleCliError(err);
      }
    } else {
      // 기본 모드
      const spinner = ora('AI가 커밋 메시지를 생성 중...').start();
      const result = await agent.execute(agentInput, agentContext);
      spinner.stop();

      await sessionManager.recordAgentCall({
        agentName: 'CommitWriter',
        command: 'commit',
        timestamp: new Date().toISOString(),
        durationMs: result.metadata.durationMs,
        tokensUsed: result.metadata.tokensUsed,
        success: result.success,
        error: result.success ? undefined : result.error.message,
      }).catch(() => {});

      if (!result.success) {
        handleCliError(result.error);
      }

      message = result.data.message;
      alternatives = result.data.alternatives;
    }
    const candidates = [message, ...alternatives].slice(0, 3);

    // 7. 결과 출력
    const suggestionsText = renderSuggestions(candidates);
    console.log(
      boxen(suggestionsText, {
        title: chalk.bold.cyan('Commit Message Suggestions'),
        titleAlignment: 'left',
        padding: { top: 0, bottom: 0, left: 0, right: 1 },
        borderStyle: 'round',
        borderColor: 'cyan',
      }),
    );

    // 8. 메시지 선택
    let selectedMessage: string;

    if (options.auto) {
      selectedMessage = candidates[0]!;
      logger.success(`자동 선택: ${selectedMessage}`);
    } else {
      const { choice } = await inquirer.prompt<{ choice: string }>([
        {
          type: 'input',
          name: 'choice',
          message: '선택 [1-3/e/q]:',
          default: '1',
        },
      ]);

      const trimmed = choice.trim().toLowerCase();

      if (trimmed === 'q') {
        logger.info('취소되었습니다.');
        process.exit(0);
      }

      if (trimmed === 'e') {
        const { customMessage } = await inquirer.prompt<{ customMessage: string }>([
          {
            type: 'input',
            name: 'customMessage',
            message: '커밋 메시지를 입력하세요:',
            default: candidates[0],
            validate: (input: string) =>
              input.trim().length > 0 || '메시지를 입력해야 합니다',
          },
        ]);
        selectedMessage = customMessage.trim();
      } else {
        const idx = parseInt(trimmed, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
          selectedMessage = candidates[0]!;
        } else {
          selectedMessage = candidates[idx]!;
        }
      }
    }

    // 9. --dry-run 이면 출력만
    if (options.dryRun) {
      console.log('\n' + chalk.bold('커밋 메시지 (dry-run):'));
      console.log(chalk.green(selectedMessage));
      return;
    }

    // 10. git commit 실행
    const commitSpinner = ora('커밋 중...').start();
    let commitHash: string | undefined;
    try {
      commitHash = await commit(cwd, selectedMessage);
      commitSpinner.succeed(chalk.green(`커밋 완료: ${chalk.bold(commitHash || selectedMessage)}`));
    } catch (err) {
      commitSpinner.stop();
      handleCliError(err);
    }

    // 11. post-commit 훅 실행
    try {
      await hookRunner.run('post-commit', {
        JUNFLOW_COMMIT_HASH: commitHash ?? '',
      });
    } catch (err) {
      handleCliError(err);
    }
  });
