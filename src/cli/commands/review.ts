import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import { loadConfig } from '../../config/loader.js';
import { ensureGitRepo, getStagedDiff } from '../../git/operations.js';
import { CodeReviewer, CodeReviewResult, ReviewFinding } from '../../agents/code-reviewer.js';
import { ClaudeProvider } from '../../ai/claude.js';
import { trackTokenUsage } from '../utils/token-tracker.js';
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../../session/index.js';
import { HookRunner } from '../../hooks/runner.js';

const SEVERITY_ORDER: ReviewFinding['severity'][] = ['critical', 'warning', 'suggestion', 'praise'];

const SEVERITY_LABELS: Record<ReviewFinding['severity'], string> = {
  critical: 'CRITICAL',
  warning: 'WARNING',
  suggestion: 'SUGGESTION',
  praise: 'PRAISE',
};

function severityColor(severity: ReviewFinding['severity']): (s: string) => string {
  switch (severity) {
    case 'critical': return chalk.red.bold;
    case 'warning': return chalk.yellow;
    case 'suggestion': return chalk.cyan;
    case 'praise': return chalk.green;
  }
}

function printReviewResult(result: CodeReviewResult): void {
  const scoreColor = result.overallScore >= 8 ? chalk.green : result.overallScore >= 5 ? chalk.yellow : chalk.red;
  const scoreStr = scoreColor(`${result.overallScore}/10`);

  console.log(chalk.bold(`\n┌─ Code Review (Score: ${scoreStr}) ${'─'.repeat(30)}┐`));
  console.log(chalk.gray(`│ ${result.summary}`));
  console.log(chalk.bold('│'));

  const grouped: Partial<Record<ReviewFinding['severity'], ReviewFinding[]>> = {};
  for (const finding of result.findings) {
    if (!grouped[finding.severity]) grouped[finding.severity] = [];
    grouped[finding.severity]!.push(finding);
  }

  for (const severity of SEVERITY_ORDER) {
    const items = grouped[severity];
    if (!items || items.length === 0) continue;

    const colorFn = severityColor(severity);
    console.log(colorFn(`│ ${SEVERITY_LABELS[severity]} (${items.length})`));

    for (const finding of items) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      console.log(chalk.gray(`│   ${location}`));
      console.log(`│   ${finding.message}`);
      if (finding.suggestion) {
        console.log(chalk.gray(`│   -> ${finding.suggestion}`));
      }
      console.log('│');
    }
  }

  console.log(chalk.bold('└' + '─'.repeat(48) + '┘'));
}

async function loadCurrentIssue(
  cwd: string,
): Promise<{ title: string; summary: string; type: string } | undefined> {
  try {
    const content = await fs.readFile(path.join(cwd, '.junflow/current-issue.json'), 'utf-8');
    return JSON.parse(content) as { title: string; summary: string; type: string };
  } catch {
    return undefined;
  }
}

export const reviewCommand = new Command('review')
  .description('AI 코드 리뷰')
  .option('--staged', 'staged 변경만 리뷰')
  .option('-f, --focus <areas...>', '집중 영역 (security, performance, readability, testing)')
  .option('-b, --base <branch>', '비교 대상 브랜치', 'main')
  .action(async (options: { staged?: boolean; focus?: string[]; base: string }) => {
    const cwd = process.cwd();

    try {
      await ensureGitRepo(cwd);
    } catch {
      cliErrors.notGitRepo();
    }

    // pre-review 훅 실행
    const hookRunner = await HookRunner.fromConfig(cwd);
    try {
      await hookRunner.run('pre-review');
    } catch (err) {
      handleCliError(err);
    }

    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      handleCliError(err);
    }

    const spinner = ora('diff 수집 중...').start();
    let diff: string;

    try {
      if (options.staged) {
        diff = await getStagedDiff(cwd);
      } else {
        const git = simpleGit(cwd);
        diff = await git.diff([`${options.base}..HEAD`]);
      }
    } catch (err) {
      spinner.stop();
      handleCliError(err);
    }

    if (!diff.trim()) {
      spinner.stop();
      logger.info(
        options.staged
          ? 'staged된 변경사항이 없습니다.'
          : `${options.base} 대비 변경사항이 없습니다.`,
      );
      process.exit(0);
    }

    spinner.text = 'AI 코드 리뷰 중...';

    const issueAnalysis = await loadCurrentIssue(cwd);

    const focusAreas = options.focus as ('security' | 'performance' | 'readability' | 'testing')[] | undefined;

    const apiKey = config.ai.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      spinner.stop();
      cliErrors.missingApiKey('ANTHROPIC_API_KEY');
    }

    const aiProvider = new ClaudeProvider(apiKey);
    const reviewer = new CodeReviewer(aiProvider);

    const agentLogger = {
      info: (msg: string) => { if (config.output.verbose) console.log(chalk.gray(msg)); },
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => { if (config.output.verbose) console.log(chalk.dim(msg)); },
    };

    const result = await reviewer.execute(
      { diff, issueAnalysis, focusAreas },
      { workingDir: cwd, config, logger: agentLogger },
    );

    spinner.stop();

    if (!result.success) {
      handleCliError(result.error);
    }

    if (result.metadata.tokensUsed) {
      await trackTokenUsage(
        {
          agentName: 'CodeReviewer',
          tokensUsed: result.metadata.tokensUsed,
          timestamp: new Date().toISOString(),
        },
        cwd,
      ).catch(() => {});
    }

    await sessionManager.recordAgentCall({
      agentName: 'CodeReviewer',
      command: 'review',
      timestamp: new Date().toISOString(),
      durationMs: result.metadata.durationMs,
      tokensUsed: result.metadata.tokensUsed,
      success: result.success,
      error: result.success ? undefined : result.error.message,
    }).catch(() => {});

    printReviewResult(result.data);

    // post-review 훅 실행
    try {
      await hookRunner.run('post-review');
    } catch (err) {
      handleCliError(err);
    }
  });
