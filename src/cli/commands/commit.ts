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
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

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
  .action(async (options: {
    all?: boolean;
    lang?: string;
    convention?: string;
    auto?: boolean;
    dryRun?: boolean;
  }) => {
    const cwd = process.cwd();

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

    const aiProvider = new ClaudeProvider(apiKey);
    const agent = new CommitWriter(aiProvider);
    const agentLogger = {
      info: (msg: string) => logger.debug(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => logger.debug(msg),
    };

    const spinner = ora('AI가 커밋 메시지를 생성 중...').start();

    const result = await agent.execute(
      {
        diff,
        issueAnalysis,
        convention: options.convention as 'conventional' | 'gitmoji' | undefined,
        language: options.lang as 'ko' | 'en' | undefined,
      },
      { workingDir: cwd, config, logger: agentLogger },
    );

    spinner.stop();

    if (!result.success) {
      handleCliError(result.error);
    }

    const { message, alternatives } = result.data;
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
    try {
      const hash = await commit(cwd, selectedMessage);
      commitSpinner.succeed(chalk.green(`커밋 완료: ${chalk.bold(hash || selectedMessage)}`));
    } catch (err) {
      commitSpinner.stop();
      handleCliError(err);
    }
  });
