import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import { loadConfig } from '../../config/loader.js';
import { ensureGitRepo, getStagedDiff } from '../../git/operations.js';
import { CodeReviewer, CodeReviewResult, ReviewFinding, codeReviewResultSchema } from '../../agents/code-reviewer.js';
import { DeepCodeReviewer } from '../../agents/deep-code-reviewer.js';
import { ClaudeProvider } from '../../ai/claude.js';
import { getAvailableProviders } from '../../ai/multi-provider.js';
import { ConsensusRunner } from '../../ai/consensus.js';
import { Verifier, verifyLoop } from '../../agents/verifier.js';
import { trackTokenUsage } from '../utils/token-tracker.js';
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../../session/index.js';
import { HookRunner } from '../../hooks/runner.js';
import { WorkflowRunner } from '../../teams/runner.js';
import { deepReviewWorkflow } from '../../teams/presets.js';
import { createAgentFactory } from '../../teams/agent-factory.js';
import { formatWorkflowResult } from '../utils/workflow-renderer.js';
import { resolveCiOptions, type CiOptions } from '../options/ci-mode.js';
import { printJson, type JsonReviewOutput } from '../formatters/json.js';
import { formatReviewComment } from '../formatters/index.js';

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
  .option('--consensus', '멀티모델 합의 (사용 가능한 모든 AI 모델로 리뷰 후 합성)')
  .option('--verify', '자동 검증 루프 (품질 미달 시 재생성)')
  .option('--workflow', 'DAG 워크플로우 모드 (보안/성능/가독성 병렬 리뷰)')
  .option('--deep', '멀티모델 합의 기반 심층 리뷰 (DeepCodeReviewer)')
  .option('--ci', 'CI 모드 (interactive 프롬프트 비활성화)')
  .option('--output <format>', '출력 포맷 (text, json)', 'text')
  .option('--format <type>', '코멘트 포맷 (github-pr, gitlab-mr, plain)', 'plain')
  .action(async (options: { staged?: boolean; focus?: string[]; base: string; consensus?: boolean; verify?: boolean; workflow?: boolean; deep?: boolean } & Partial<CiOptions>) => {
    const ciOpts = resolveCiOptions(options);
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

    const aiProvider = new ClaudeProvider(apiKey!);
    const reviewer = new CodeReviewer(aiProvider);

    const agentLogger = {
      info: (msg: string) => { if (config.output.verbose) console.log(chalk.gray(msg)); },
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => { if (config.output.verbose) console.log(chalk.dim(msg)); },
    };

    const agentContext = { workingDir: cwd, config, logger: agentLogger };
    const agentInput = { diff, issueAnalysis, focusAreas };

    if (options.workflow) {
      // 워크플로우 모드: deepReviewWorkflow 프리셋으로 3관점 병렬 리뷰
      spinner.text = '워크플로우 리뷰 중 (보안/성능/가독성 병렬)...';
      const agentFactory = createAgentFactory(aiProvider);
      const runner = new WorkflowRunner(agentContext, agentFactory);

      let workflowResult;
      try {
        workflowResult = await runner.execute(deepReviewWorkflow);
      } catch (err) {
        spinner.stop();
        handleCliError(err);
      }
      spinner.stop();

      formatWorkflowResult(deepReviewWorkflow, workflowResult);

      await sessionManager.recordAgentCall({
        agentName: 'WorkflowRunner:deep-review',
        command: 'review --workflow',
        timestamp: new Date().toISOString(),
        durationMs: workflowResult.totalDurationMs,
        tokensUsed: workflowResult.steps.reduce((sum, s) => sum + (s.tokensUsed ?? 0), 0),
        success: workflowResult.success,
      }).catch(() => {});

      // post-review 훅 실행
      try {
        await hookRunner.run('post-review');
      } catch (err) {
        handleCliError(err);
      }

      if (!workflowResult.success) {
        process.exit(1);
      }
      return;
    }

    let reviewData: CodeReviewResult;

    if (options.deep) {
      // Deep 모드: DeepCodeReviewer로 멀티프로바이더 합의 리뷰
      spinner.text = '멀티모델 합의 심층 리뷰 중...';
      const deepReviewer = new DeepCodeReviewer(aiProvider);

      const result = await deepReviewer.execute(agentInput, agentContext);
      spinner.stop();

      if (!result.success) {
        handleCliError(result.error);
      }

      reviewData = result.data;

      const meta = (result as { data: CodeReviewResult; metadata: { durationMs: number; tokensUsed?: number }; success: true }).metadata;
      await sessionManager.recordAgentCall({
        agentName: 'DeepCodeReviewer',
        command: 'review --deep',
        timestamp: new Date().toISOString(),
        durationMs: meta.durationMs,
        tokensUsed: meta.tokensUsed,
        success: result.success,
      }).catch(() => {});

      printReviewResult(reviewData);

      try {
        await hookRunner.run('post-review');
      } catch (err) {
        handleCliError(err);
      }
      return;
    }

    if (options.consensus) {
      // 멀티모델 합의 모드
      spinner.text = '멀티모델 합의 리뷰 중...';
      const providers = await getAvailableProviders();
      if (providers.length === 0) {
        spinner.stop();
        logger.error('AI API 키가 설정되지 않았습니다. ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 중 하나를 설정해주세요.');
        process.exit(1);
      }
      spinner.text = `${providers.length}개 모델로 코드 리뷰 중...`;

      const consensusRunner = new ConsensusRunner(aiProvider);
      const { truncateDiff } = await import('../../ai/diff-truncator.js');
      const { truncatedDiff } = truncateDiff(diff);

      try {
        const consensusResult = await consensusRunner.run(
          providers,
          {
            systemPrompt: `You are an expert code reviewer. Respond with JSON: {"summary":"string","findings":[{"severity":"critical|warning|suggestion|praise","file":"string","line":null,"message":"string","suggestion":null}],"overallScore":number}`,
            userPrompt: `## Diff to Review\n${truncatedDiff}${issueAnalysis ? `\n\n## Issue Context\nTitle: ${issueAnalysis.title}\nType: ${issueAnalysis.type}` : ''}`,
            maxTokens: 4096,
            temperature: 0.2,
          },
          codeReviewResultSchema,
        );

        spinner.stop();
        logger.info(`합의 완료: ${consensusResult.providersUsed.join(' + ')} (일치도: ${consensusResult.agreementScore}%)`);
        reviewData = consensusResult.consensus;

        await sessionManager.recordAgentCall({
          agentName: 'ConsensusRunner',
          command: 'review --consensus',
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
      spinner.text = 'AI 코드 리뷰 + 검증 중...';
      const verifier = new Verifier(aiProvider);

      try {
        const verified = await verifyLoop(reviewer, verifier, agentInput, agentContext, {
          taskDescription: `Review the following code diff thoroughly:\n${diff.slice(0, 500)}...`,
          criteria: [
            'Review covers security, performance, and readability',
            'Each finding has a clear file and message',
            'Overall score is justified by findings',
            'Suggestions are actionable',
          ],
          maxRetries: 2,
          onRetry: (attempt, issues) => {
            spinner.text = `검증 실패, 재리뷰 중 (${attempt}/2)... ${issues[0] ?? ''}`;
          },
        });

        spinner.stop();

        const vr = verified.verification;
        const statusIcon = vr.approved ? chalk.green('✓') : chalk.yellow('△');
        logger.info(`검증 ${statusIcon} (${vr.score}/10, ${verified.attempts}회 시도)`);

        if (!verified.result.success) {
          handleCliError(verified.result.error);
        }

        reviewData = verified.result.data;

        await sessionManager.recordAgentCall({
          agentName: 'CodeReviewer+Verifier',
          command: 'review --verify',
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
      const result = await reviewer.execute(agentInput, agentContext);
      spinner.stop();

      if (!result.success) {
        handleCliError(result.error);
      }

      reviewData = result.data;

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
      }).catch(() => {});
    }

    // CI 출력 모드 분기
    if (ciOpts.output === 'json') {
      const jsonOut: JsonReviewOutput = {
        type: 'review',
        success: true,
        data: reviewData,
        metadata: { mode: options.deep ? 'deep' : options.consensus ? 'consensus' : options.verify ? 'verify' : 'default' },
      };
      printJson(jsonOut);
    } else if (ciOpts.format !== 'plain') {
      console.log(formatReviewComment(reviewData, ciOpts.format));
    } else {
      printReviewResult(reviewData);
    }

    // post-review 훅 실행
    try {
      await hookRunner.run('post-review');
    } catch (err) {
      handleCliError(err);
    }
  });
