import fs from 'fs/promises';
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { DocumentReviewer, DocumentFinding } from '../../agents/document-reviewer.js';
import { DeepResearcher, ClaimValidation, SimilarProduct } from '../../agents/deep-researcher.js';
import { ClaudeProvider } from '../../ai/claude.js';
import { createSearchProvider } from '../../search/factory.js';
import { trackTokenUsage } from '../utils/token-tracker.js';
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../../session/index.js';

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
  .action(async (filePath: string, options: { deep?: boolean; focus?: string[] }) => {
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

    const aiProvider = new ClaudeProvider(apiKey);
    const agentLogger = {
      info: (msg: string) => { if (config.output.verbose) console.log(chalk.gray(msg)); },
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => { if (config.output.verbose) console.log(chalk.dim(msg)); },
    };
    const context = { workingDir: process.cwd(), config, logger: agentLogger };

    // 3. DocumentReviewer 실행
    const reviewSpinner = ora('문서 리뷰 중...').start();
    const reviewer = new DocumentReviewer(aiProvider);
    const reviewResult = await reviewer.execute(
      { content, filePath, focusAreas: options.focus },
      context,
    );
    reviewSpinner.stop();

    if (!reviewResult.success) {
      handleCliError(reviewResult.error);
    }

    // 토큰 추적
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

    const review = reviewResult.data;
    printDocumentReview(
      review.summary,
      review.overallScore,
      review.findings,
      review.missingTopics,
      review.keyQuestions,
    );

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
