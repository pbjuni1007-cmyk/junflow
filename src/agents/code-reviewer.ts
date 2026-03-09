import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext } from './types.js';
import { AIProvider } from '../ai/types.js';
import { parseAIResponse } from '../ai/response-parser.js';
import { truncateDiff } from '../ai/diff-truncator.js';

export interface CodeReviewerInput {
  diff: string;
  issueAnalysis?: { title: string; summary: string; type: string };
  focusAreas?: ('security' | 'performance' | 'readability' | 'testing')[];
}

export interface ReviewFinding {
  severity: 'critical' | 'warning' | 'suggestion' | 'praise';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface CodeReviewResult {
  summary: string;
  findings: ReviewFinding[];
  overallScore: number;
}

const reviewFindingSchema = z.object({
  severity: z.enum(['critical', 'warning', 'suggestion', 'praise']),
  file: z.string(),
  line: z.number().optional().nullable(),
  message: z.string(),
  suggestion: z.string().optional().nullable(),
});

const codeReviewResultSchema = z.object({
  summary: z.string(),
  findings: z.array(reviewFindingSchema),
  overallScore: z.number().min(1).max(10),
});

const FOCUS_AREA_DESCRIPTIONS: Record<string, string> = {
  security: 'SQL injection, XSS, authentication/authorization flaws, sensitive data exposure',
  performance: 'N+1 queries, unnecessary re-renders, memory leaks, inefficient algorithms',
  readability: 'naming conventions, code clarity, complexity, documentation',
  testing: 'test coverage, edge cases, test quality',
};

function buildSystemPrompt(focusAreas?: string[]): string {
  const focusSection =
    focusAreas && focusAreas.length > 0
      ? `\n\nFocus especially on these areas:\n${focusAreas.map((a) => `- ${a}: ${FOCUS_AREA_DESCRIPTIONS[a] ?? a}`).join('\n')}`
      : '';

  return `You are an expert code reviewer. Given a git diff, provide a thorough structured code review.${focusSection}

Respond with a JSON object matching this exact schema:
{
  "summary": "string - overall assessment of the changes",
  "findings": [
    {
      "severity": "critical | warning | suggestion | praise",
      "file": "string - filename where the issue was found",
      "line": "number | null - line number if applicable",
      "message": "string - clear description of the finding",
      "suggestion": "string | null - how to fix or improve"
    }
  ],
  "overallScore": "number - integer from 1 to 10 rating overall code quality"
}

Severity levels:
- critical: Security vulnerabilities, bugs that will cause failures, data loss risks
- warning: Potential bugs, bad practices, performance issues
- suggestion: Minor improvements, style, readability
- praise: Well-written code worth highlighting

Return only the JSON object, no markdown code blocks.`;
}

function buildUserPrompt(input: CodeReviewerInput, truncatedDiff: string): string {
  const lines: string[] = [];

  if (input.issueAnalysis) {
    lines.push('## Issue Context');
    lines.push(`Title: ${input.issueAnalysis.title}`);
    lines.push(`Type: ${input.issueAnalysis.type}`);
    lines.push(`Summary: ${input.issueAnalysis.summary}`);
    lines.push('');
  }

  lines.push('## Diff to Review');
  lines.push(truncatedDiff);

  return lines.join('\n');
}

export class CodeReviewer extends BaseAgent<CodeReviewerInput, CodeReviewResult> {
  name = 'CodeReviewer';
  description = 'AI 기반 코드 리뷰';

  constructor(private aiProvider: AIProvider) {
    super();
  }

  protected async run(
    input: CodeReviewerInput,
    context: AgentContext,
  ): Promise<{ data: CodeReviewResult; tokensUsed?: number }> {
    const { truncatedDiff, wasTruncated } = truncateDiff(input.diff);
    if (wasTruncated) {
      context.logger.warn('Diff가 토큰 제한을 초과하여 일부 파일이 생략되었습니다.');
    }

    const systemPrompt = buildSystemPrompt(input.focusAreas);
    const userPrompt = buildUserPrompt(input, truncatedDiff);

    const request = {
      systemPrompt,
      userPrompt,
      model: context.config.ai.agentModels?.codeReviewer ?? context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.2,
    };

    const response = await this.aiProvider.complete(request);

    const parsed = await parseAIResponse(response.content, codeReviewResultSchema, {
      maxRetries: 1,
      aiProvider: this.aiProvider,
      originalRequest: request,
    });

    const result: CodeReviewResult = {
      summary: parsed.summary,
      findings: parsed.findings.map((f) => ({
        severity: f.severity,
        file: f.file,
        line: f.line ?? undefined,
        message: f.message,
        suggestion: f.suggestion ?? undefined,
      })),
      overallScore: parsed.overallScore,
    };

    return {
      data: result,
      tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
    };
  }
}
