import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext } from './types.js';
import { AIProvider } from '../ai/types.js';
import { parseAIResponse } from '../ai/response-parser.js';
import { DOCUMENT_REVIEWER_SYSTEM } from '../ai/prompts/document-review.js';

export interface DocumentReviewerInput {
  content: string;
  filePath: string;
  focusAreas?: string[];
}

export interface DocumentFinding {
  severity: 'critical' | 'warning' | 'suggestion' | 'praise';
  section: string;
  message: string;
  suggestion: string | null;
}

export interface DocumentReviewResult {
  summary: string;
  overallScore: number;
  findings: DocumentFinding[];
  missingTopics: string[];
  keyQuestions: string[];
}

export const documentReviewSchema = z.object({
  summary: z.string(),
  overallScore: z.number(),
  findings: z.array(
    z.object({
      severity: z.enum(['critical', 'warning', 'suggestion', 'praise']),
      section: z.string(),
      message: z.string(),
      suggestion: z.string().nullable(),
    }),
  ),
  missingTopics: z.array(z.string()),
  keyQuestions: z.array(z.string()),
});

export class DocumentReviewer extends BaseAgent<DocumentReviewerInput, DocumentReviewResult> {
  name = 'DocumentReviewer';
  description = '기획/설계 문서 리뷰 에이전트';

  constructor(private aiProvider: AIProvider) {
    super();
  }

  protected async run(
    input: DocumentReviewerInput,
    context: AgentContext,
  ): Promise<{ data: DocumentReviewResult; tokensUsed?: number }> {
    const lines: string[] = [];
    lines.push(`## Document: ${input.filePath}`);
    lines.push('');
    lines.push(input.content);

    if (input.focusAreas && input.focusAreas.length > 0) {
      lines.push('');
      lines.push(`## Focus Areas: ${input.focusAreas.join(', ')}`);
    }

    const request = {
      systemPrompt: DOCUMENT_REVIEWER_SYSTEM,
      userPrompt: lines.join('\n'),
      model: context.config.ai.agentModels?.documentReviewer ?? context.config.ai.model,
      maxTokens: 4096,
      temperature: 0.3,
    };

    const response = await this.aiProvider.complete(request);

    const parsed = await parseAIResponse(response.content, documentReviewSchema, {
      maxRetries: 1,
      aiProvider: this.aiProvider,
      originalRequest: request,
    });

    return {
      data: parsed,
      tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
    };
  }
}
