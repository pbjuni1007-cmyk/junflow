import fs from 'fs/promises';
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { DocumentReviewer, DocumentFinding, documentReviewSchema } from '../../agents/document-reviewer.js';
import { DeepResearcher, ClaimValidation, SimilarProduct } from '../../agents/deep-researcher.js';
import { ClaudeProvider } from '../../ai/claude.js';
import { getAvailableProviders } from '../../ai/multi-provider.js';
import { ConsensusRunner } from '../../ai/consensus.js';
import { Verifier, verifyLoop } from '../../agents/verifier.js';
import { createSearchProvider } from '../../search/factory.js';
import { trackTokenUsage } from '../utils/token-tracker.js';
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../../session/index.js';
import { resolveCiOptions, type CiOptions } from '../options/ci-mode.js';
import { printJson, type JsonDocReviewOutput } from '../formatters/json.js';
import { formatDocReviewAsGitHubPR } from '../formatters/markdown.js';
import { formatDocReviewAsGitLabMR } from '../formatters/gitlab.js';

const SEVERITY_COLORS: Record<DocumentFinding['severity'], (s: string) => string> = {
  critical: chalk.red.bold,
  warning: chalk.yellow,
  suggestion: chalk.cyan,
  praise: chalk.green,
};

const VERDICT_COLORS: Record<ClaimValidation['verdict'], (s: string) => string> = {
  supported: chalk.green,
  partially_supported: chalk.yellow,
  unsupported: chalk.red,
  needs_more_data: chalk.gray,
};

const VERDICT_LABELS: Record<ClaimValidation['verdict'], string> = {
  supported: 'SUPPORTED',
  partially_supported: 'PARTIAL',
  unsupported: 'UNSUPPORTED',
  needs_more_data: 'NEEDS DATA',
};

function printDocumentReview(
  summary: string,
  score: number,
  findings: DocumentFinding[],
  missingTopics: string[],
  keyQuestions: string[],
): void {
  const scoreColor = score >= 8 ? chalk.green : score >= 5 ? chalk.yellow : chalk.red;

  console.log(chalk.bold(`\n┌─ Document Review (Score: ${scoreColor(`${score}/10`)}) ${'─'.repeat(25)}┐`));
  console.log(chalk.gray(`│ ${summary}`));
  console.log('│');

  const grouped: Partial<Record<DocumentFinding['severity'], DocumentFinding[]>> = {};
  for (const f of findings) {
    if (!grouped[f.severity]) grouped[f.severity] = [];
    grouped[f.severity]!.push(f);
  }

  for (const severity of ['critical', 'warning', 'suggestion', 'praise'] as const) {
    const items = grouped[severity];
    if (!items || items.length === 0) continue;

    const colorFn = SEVERITY_COLORS[severity];
    console.log(colorFn(`│ ${severity.toUpperCase()} (${items.length})`));

    for (const f of items) {
      console.log(chalk.gray(`│   [${f.section}]`));
      console.log(`│   ${f.message}`);
      if (f.suggestion) {
        console.log(chalk.gray(`│   → ${f.suggestion}`));
      }
      console.log('│');
    }
  }

  if (missingTopics.length > 0) {
    console.log(chalk.yellow.bold('│ MISSING TOPICS'));
    for (const topic of missingTopics) {
      console.log(`│   - ${topic}`);
    }
    console.log('│');
  }

  if (keyQuestions.length > 0) {
    console.log(chalk.cyan.bold('│ KEY QUESTIONS'));
    for (const q of keyQuestions) {
      console.log(`│   ? ${q}`);
    }
    console.log('│');
  }

  console.log(chalk.bold('└' + '─'.repeat(52) + '┘'));
}

function printDeepResearch(
  summary: string,
  claims: ClaimValidation[],
  similarProducts: SimilarProduct[],
  riskLevel: string,
  recommendations: string[],
  searchUsed: boolean,
): void {
  const riskColor = riskLevel === 'low' ? chalk.green : riskLevel === 'medium' ? chalk.yellow : chalk.red;

  const lines: string[] = [];
  lines.push(chalk.bold(`Deep Research Report`));
  lines.push(`${chalk.dim('Risk Level:')} ${riskColor(riskLevel.toUpperCase())}  ${chalk.dim('Search:')} ${searchUsed ? chalk.green('Web + AI') : chalk.yellow('AI Only')}`);
  lines.push('');
  lines.push(chalk.gray(summary));
  lines.push('');

  // Claims
  lines.push(chalk.bold(`Claims Validation (${claims.length})`));
  for (const claim of claims) {
    const verdictFn = VERDICT_COLORS[claim.verdict];
    const label = VERDICT_LABELS[claim.verdict];
    lines.push(`  ${verdictFn(`[${label}]`)} ${chalk.dim(`(${claim.confidence}%)`)} ${claim.claim}`);

    if (claim.evidence.length > 0) {
      for (const e of claim.evidence.slice(0, 2)) {
        lines.push(chalk.green(`    ✓ ${e}`));
      }
    }
    if (claim.counterpoints.length > 0) {
      for (const c of claim.counterpoints.slice(0, 2)) {
        lines.push(chalk.red(`    ✗ ${c}`));
      }
    }
    if (claim.sources.length > 0) {
      lines.push(chalk.dim(`    Sources: ${claim.sources.slice(0, 2).join(', ')}`));
    }
    lines.push(chalk.gray(`    → ${claim.recommendation}`));
    lines.push('');
  }

  // Similar Products
  if (similarProducts.length > 0) {
    lines.push(chalk.bold('Similar Products / Approaches'));
    for (const p of similarProducts) {
      const urlStr = p.url ? chalk.dim(` (${p.url})`) : '';
      lines.push(`  ${chalk.cyan(p.name)}${urlStr}`);
      lines.push(chalk.gray(`    ${p.relevance}`));
      lines.push(chalk.yellow(`    Lesson: ${p.lesson}`));
      lines.push('');
    }
  }

  // Recommendations
  if (recommendations.length > 0) {
    lines.push(chalk.bold('Recommendations'));
    for (const r of recommendations) {
      lines.push(`  ${chalk.cyan('→')} ${r}`);
    }
  }

  console.log(
    boxen(lines.join('\n'), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'magenta',
      title: ' Deep Research ',
      titleAlignment: 'left',
    }),
  );
}

export const reviewDocCommand = new Command('review-doc')
  .description('기획/설계 문서 리뷰 + Deep Research')
  .argument('<file>', '리뷰할 문서 파일 경로')
  .option('--deep', 'Deep Research 모드 (웹 검색 + 주장 검증)')
  .option('-f, --focus <areas...>', '집중 영역 (feasibility, completeness, technical, market)')
  .option('--consensus', '멀티모델 합의 (사용 가능한 모든 AI 모델로 리뷰 후 합성)')
  .option('--verify', '자동 검증 루프 (품질 미달 시 재생성)')
  .option('--ci', 'CI 모드 (interactive 프롬프트 비활성화)')
  .option('--output <format>', '출력 포맷 (text, json)', 'text')
  .option('--format <type>', '코멘트 포맷 (github-pr, gitlab-mr, plain)', 'plain')
  .action(async (filePath: string, options: { deep?: boolean; focus?: string[]; consensus?: boolean; verify?: boolean } & Partial<CiOptions>) => {
    const ciOpts = resolveCiOptions(options);
    // 1. 파일 읽기
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      logger.error(`파일을 읽을 수 없습니다: ${filePath}`);
      process.exit(1);
    }

    if (!content.trim()) {
      logger.error('파일이 비어있습니다.');
      process.exit(1);
    }

    // 2. Config 로드
    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      handleCliError(err);
    }

    const apiKey = config.ai.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      cliErrors.missingApiKey('ANTHROPIC_API_KEY');
    }

    const aiProvider = new ClaudeProvider(apiKey!);
    const agentLogger = {
      info: (msg: string) => { if (config.output.verbose) console.log(chalk.gray(msg)); },
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => { if (config.output.verbose) console.log(chalk.dim(msg)); },
    };
    const context = { workingDir: process.cwd(), config, logger: agentLogger };
    const agentInput = { content, filePath, focusAreas: options.focus };

    // 3. DocumentReviewer 실행
    const reviewSpinner = ora('문서 리뷰 중...').start();
    const reviewer = new DocumentReviewer(aiProvider);
    let review: import('../../agents/document-reviewer.js').DocumentReviewResult;

    if (options.consensus) {
      // 멀티모델 합의 모드
      reviewSpinner.text = '멀티모델 합의 문서 리뷰 중...';
      const providers = await getAvailableProviders();
      if (providers.length === 0) {
        reviewSpinner.stop();
        logger.error('AI API 키가 설정되지 않았습니다. ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 중 하나를 설정해주세요.');
        process.exit(1);
      }
      reviewSpinner.text = `${providers.length}개 모델로 문서 리뷰 중...`;

      const consensusRunner = new ConsensusRunner(aiProvider);
      const { DOCUMENT_REVIEWER_SYSTEM } = await import('../../ai/prompts/document-review.js');

      try {
        const consensusResult = await consensusRunner.run(
          providers,
          {
            systemPrompt: DOCUMENT_REVIEWER_SYSTEM,
            userPrompt: `## Document: ${filePath}\n\n${content}${options.focus ? `\n\n## Focus Areas: ${options.focus.join(', ')}` : ''}`,
            maxTokens: 4096,
            temperature: 0.3,
          },
          documentReviewSchema,
        );

        reviewSpinner.stop();
        logger.info(`합의 완료: ${consensusResult.providersUsed.join(' + ')} (일치도: ${consensusResult.agreementScore}%)`);
        review = consensusResult.consensus;

        await sessionManager.recordAgentCall({
          agentName: 'ConsensusRunner',
          command: 'review-doc --consensus',
          timestamp: new Date().toISOString(),
          durationMs: 0,
          tokensUsed: consensusResult.totalTokensUsed,
          success: true,
        }).catch(() => {});
      } catch (err) {
        reviewSpinner.stop();
        handleCliError(err);
      }
    } else if (options.verify) {
      // 자동 검증 루프 모드
      reviewSpinner.text = '문서 리뷰 + 검증 중...';
      const verifier = new Verifier(aiProvider);

      try {
        const verified = await verifyLoop(reviewer, verifier, agentInput, context, {
          taskDescription: `Review the document "${filePath}" for completeness, logical gaps, and quality.`,
          criteria: [
            'Review identifies logical gaps and missing sections',
            'Findings have clear severity ratings',
            'Missing topics are relevant',
            'Key questions are actionable',
          ],
          maxRetries: 2,
          onRetry: (attempt, issues) => {
            reviewSpinner.text = `검증 실패, 재리뷰 중 (${attempt}/2)... ${issues[0] ?? ''}`;
          },
        });

        reviewSpinner.stop();

        const vr = verified.verification;
        const statusIcon = vr.approved ? chalk.green('✓') : chalk.yellow('△');
        logger.info(`검증 ${statusIcon} (${vr.score}/10, ${verified.attempts}회 시도)`);

        if (!verified.result.success) {
          handleCliError(verified.result.error);
        }

        review = verified.result.data;

        await sessionManager.recordAgentCall({
          agentName: 'DocumentReviewer+Verifier',
          command: 'review-doc --verify',
          timestamp: new Date().toISOString(),
          durationMs: verified.result.metadata.durationMs,
          tokensUsed: verified.result.metadata.tokensUsed,
          success: verified.result.success,
        }).catch(() => {});
      } catch (err) {
        reviewSpinner.stop();
        handleCliError(err);
      }
    } else {
      // 기본 모드
      const reviewResult = await reviewer.execute(agentInput, context);
      reviewSpinner.stop();

      if (!reviewResult.success) {
        handleCliError(reviewResult.error);
      }

      review = reviewResult.data;

      if (reviewResult.metadata.tokensUsed) {
        await trackTokenUsage({
          agentName: 'DocumentReviewer',
          tokensUsed: reviewResult.metadata.tokensUsed,
          timestamp: new Date().toISOString(),
        }, process.cwd()).catch(() => {});
      }

      await sessionManager.recordAgentCall({
        agentName: 'DocumentReviewer',
        command: 'review-doc',
        timestamp: new Date().toISOString(),
        durationMs: reviewResult.metadata.durationMs,
        tokensUsed: reviewResult.metadata.tokensUsed,
        success: reviewResult.success,
      }).catch(() => {});
    }
    // CI 출력 모드 분기
    if (ciOpts.output === 'json') {
      const jsonOut: JsonDocReviewOutput = {
        type: 'review-doc',
        success: true,
        data: {
          summary: review.summary,
          overallScore: review.overallScore,
          findings: review.findings,
          missingTopics: review.missingTopics,
          keyQuestions: review.keyQuestions,
        },
        metadata: { mode: options.consensus ? 'consensus' : options.verify ? 'verify' : 'default' },
      };
      printJson(jsonOut);
    } else if (ciOpts.format === 'github-pr') {
      console.log(formatDocReviewAsGitHubPR(review.summary, review.overallScore, review.findings, review.missingTopics, review.keyQuestions));
    } else if (ciOpts.format === 'gitlab-mr') {
      console.log(formatDocReviewAsGitLabMR(review.summary, review.overallScore, review.findings, review.missingTopics, review.keyQuestions));
    } else {
      printDocumentReview(
        review.summary,
        review.overallScore,
        review.findings,
        review.missingTopics,
        review.keyQuestions,
      );
    }

    // 4. Deep Research (--deep 옵션)
    if (options.deep) {
      console.log('');
      const searchProvider = createSearchProvider();
      if (!searchProvider) {
        logger.warn('TAVILY_API_KEY 환경변수 미설정 — AI 자체 지식으로 분석합니다.');
      }

      const deepSpinner = ora('Deep Research 실행 중...').start();
      const researcher = new DeepResearcher(aiProvider, searchProvider);
      const deepResult = await researcher.execute(
        {
          content,
          filePath,
          documentReviewSummary: review.summary,
        },
        context,
      );
      deepSpinner.stop();

      if (!deepResult.success) {
        handleCliError(deepResult.error);
      }

      if (deepResult.metadata.tokensUsed) {
        await trackTokenUsage({
          agentName: 'DeepResearcher',
          tokensUsed: deepResult.metadata.tokensUsed,
          timestamp: new Date().toISOString(),
        }, process.cwd()).catch(() => {});
      }

      await sessionManager.recordAgentCall({
        agentName: 'DeepResearcher',
        command: 'review-doc --deep',
        timestamp: new Date().toISOString(),
        durationMs: deepResult.metadata.durationMs,
        tokensUsed: deepResult.metadata.tokensUsed,
        success: deepResult.success,
      }).catch(() => {});

      const deep = deepResult.data;
      printDeepResearch(
        deep.summary,
        deep.claims,
        deep.similarProducts,
        deep.overallRiskLevel,
        deep.recommendations,
        deep.searchUsed,
      );
    }

    logger.success('문서 리뷰 완료!');
  });
