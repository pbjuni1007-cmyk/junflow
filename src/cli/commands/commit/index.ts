import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import simpleGit from 'simple-git';
import { loadConfig } from '../../../config/loader.js';
import { ensureGitRepo, getStagedDiff, commit } from '../../../git/operations.js';
import { CommitWriter } from '../../../agents/commit-writer.js';
import { ClaudeProvider } from '../../../ai/claude.js';
import { handleCliError, cliErrors } from '../../utils/error-handler.js';
import { logger } from '../../utils/logger.js';
import { makeCommitAgentLogger } from '../../utils/agent-logger.js';
import { HookRunner } from '../../../hooks/runner.js';
import { loadCurrentIssue, renderSuggestions } from './rendering.js';
import { selectMessage } from './interaction.js';
import { generateConsensus, generateWithVerify, generateDefault } from './generators.js';

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

    // 5. 이슈 컨텍스트 로드
    const issueAnalysis = await loadCurrentIssue(cwd);

    // 6. AI 프로바이더 + 에이전트 생성
    const apiKey = config.ai.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      cliErrors.missingApiKey('ANTHROPIC_API_KEY');
    }

    const aiProvider = new ClaudeProvider(apiKey!);
    const agent = new CommitWriter(aiProvider);
    const agentContext = { workingDir: cwd, config, logger: makeCommitAgentLogger() };
    const agentInput = {
      diff,
      issueAnalysis,
      convention: options.convention as 'conventional' | 'gitmoji' | undefined,
      language: options.lang as 'ko' | 'en' | undefined,
    };

    // 7. 커밋 메시지 생성 (모드별 분기)
    let result;
    if (options.consensus) {
      result = await generateConsensus(aiProvider, agentInput, config, diff, issueAnalysis);
    } else if (options.verify) {
      result = await generateWithVerify(agent, aiProvider, agentInput, agentContext, diff);
    } else {
      result = await generateDefault(agent, agentInput, agentContext);
    }

    const candidates = [result.message, ...result.alternatives].slice(0, 3);

    // 8. 결과 출력
    console.log(
      boxen(renderSuggestions(candidates), {
        title: chalk.bold.cyan('Commit Message Suggestions'),
        titleAlignment: 'left',
        padding: { top: 0, bottom: 0, left: 0, right: 1 },
        borderStyle: 'round',
        borderColor: 'cyan',
      }),
    );

    // 9. 메시지 선택
    const selectedMessage = await selectMessage(candidates, !!options.auto);

    // 10. --dry-run 이면 출력만
    if (options.dryRun) {
      console.log('\n' + chalk.bold('커밋 메시지 (dry-run):'));
      console.log(chalk.green(selectedMessage));
      return;
    }

    // 11. git commit 실행
    const commitSpinner = (await import('ora')).default('커밋 중...').start();
    let commitHash: string | undefined;
    try {
      commitHash = await commit(cwd, selectedMessage);
      commitSpinner.succeed(chalk.green(`커밋 완료: ${chalk.bold(commitHash || selectedMessage)}`));
    } catch (err) {
      commitSpinner.stop();
      handleCliError(err);
    }

    // 12. post-commit 훅 실행
    try {
      await hookRunner.run('post-commit', {
        JUNFLOW_COMMIT_HASH: commitHash ?? '',
      });
    } catch (err) {
      handleCliError(err);
    }
  });
