import { z } from 'zod';
import { DeepAgent, DeepAgentOptions } from './deep-base.js';
import { AgentContext } from './types.js';
import { AIProvider, AIRequest } from '../ai/types.js';
import { truncateDiff } from '../ai/diff-truncator.js';
import { CodeReviewResult, codeReviewResultSchema, CodeReviewerInput } from './code-reviewer.js';

const DEEP_REVIEW_SYSTEM = `You are an expert code reviewer performing a thorough multi-perspective review.

Analyze the diff from THREE perspectives simultaneously:
1. **Security**: SQL injection, XSS, authentication/authorization flaws, sensitive data exposure, dependency vulnerabilities
2. **Performance**: N+1 queries, unnecessary re-renders, memory leaks, inefficient algorithms, missing indexes
3. **Readability**: naming conventions, code clarity, complexity, documentation, SOLID principles

For each finding, clearly tag which perspective it comes from.

Respond with a JSON object:
{
  "summary": "string - comprehensive assessment covering all three perspectives",
  "findings": [
    {
      "severity": "critical | warning | suggestion | praise",
      "file": "string - filename",
      "line": number | null,
      "message": "string - [Security|Performance|Readability] clear description",
      "suggestion": "string | null - actionable fix"
    }
  ],
  "overallScore": number (1-10)
}

Be thorough but fair. Praise good patterns. Return only the JSON object.`;

/**
 * 멀티 프로바이더 합의 기반 심층 코드 리뷰어.
 * 여러 AI 모델이 독립 리뷰 → ConsensusRunner가 합성하여 편향 없는 리뷰를 생성.
 */
export class DeepCodeReviewer extends DeepAgent<CodeReviewerInput, CodeReviewResult> {
  name = 'DeepCodeReviewer';
  description = '멀티모델 합의 기반 심층 코드 리뷰';

  constructor(primaryProvider: AIProvider, options?: DeepAgentOptions) {
    super(primaryProvider, options);
  }

  protected buildRequest(input: CodeReviewerInput, context: AgentContext): AIRequest {
    const { truncatedDiff, wasTruncated } = truncateDiff(input.diff);
    if (wasTruncated) {
      context.logger.warn('Diff가 토큰 제한을 초과하여 일부 파일이 생략되었습니다.');
    }

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

    return {
      systemPrompt: DEEP_REVIEW_SYSTEM,
      userPrompt: lines.join('\n'),
      model: context.config.ai.agentModels?.codeReviewer ?? context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.2,
    };
  }

  protected getOutputSchema(): z.ZodType<CodeReviewResult> {
    // codeReviewResultSchema는 nullable 필드를 허용하지만 postProcess에서 undefined로 변환
    return codeReviewResultSchema as unknown as z.ZodType<CodeReviewResult>;
  }

  protected postProcess(consensus: CodeReviewResult): CodeReviewResult {
    return {
      summary: consensus.summary,
      findings: consensus.findings.map((f) => ({
        severity: f.severity,
        file: f.file,
        line: f.line ?? undefined,
        message: f.message,
        suggestion: f.suggestion ?? undefined,
      })),
      overallScore: consensus.overallScore,
    };
  }
}
