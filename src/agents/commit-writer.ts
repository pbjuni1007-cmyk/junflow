import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext } from './types.js';
import { AIProvider } from '../ai/types.js';
import { parseAIResponse } from '../ai/response-parser.js';
import { truncateDiff } from '../ai/diff-truncator.js';
import { COMMIT_WRITER_SYSTEM } from '../ai/prompts/commit-message.js';

export interface CommitWriterInput {
  diff: string;
  issueAnalysis?: { title: string; summary: string; type: string };
  convention?: 'conventional' | 'gitmoji';
  language?: 'ko' | 'en';
}

export interface CommitMessageResult {
  message: string;
  alternatives: string[];
  scope?: string;
  breakingChange: boolean;
}

export const commitMessageSchema = z.object({
  message: z.string(),
  alternatives: z.array(z.string()),
  scope: z.string().optional().nullable(),
  breakingChange: z.boolean(),
});

function buildSystemPrompt(convention: string, language: string): string {
  const langInstruction =
    language === 'ko'
      ? '커밋 메시지 본문은 한국어로 작성하세요.'
      : 'Write commit message body in English.';

  const conventionInstruction =
    convention === 'gitmoji'
      ? 'Use gitmoji convention (e.g. ✨ feat, 🐛 fix, ♻️ refactor).'
      : 'Use Conventional Commits specification (feat, fix, chore, docs, refactor, test, style, perf).';

  return `${COMMIT_WRITER_SYSTEM}

${conventionInstruction}
${langInstruction}

Respond with a JSON object matching this exact schema:
{
  "message": "string - primary commit message (max 72 chars)",
  "alternatives": ["string - alternative 1", "string - alternative 2"],
  "scope": "string | null - optional scope (e.g. auth, profile)",
  "breakingChange": boolean
}

Return only the JSON object, no markdown code blocks.`;
}

function buildUserPrompt(input: CommitWriterInput, truncatedDiff: string): string {
  const lines: string[] = [];

  if (input.issueAnalysis) {
    lines.push('## Issue Context');
    lines.push(`Title: ${input.issueAnalysis.title}`);
    lines.push(`Type: ${input.issueAnalysis.type}`);
    lines.push(`Summary: ${input.issueAnalysis.summary}`);
    lines.push('');
  }

  lines.push('## Staged Diff');
  lines.push(truncatedDiff);

  return lines.join('\n');
}

export class CommitWriter extends BaseAgent<CommitWriterInput, CommitMessageResult> {
  name = 'CommitWriter';
  description = 'AI 기반 커밋 메시지 생성';

  constructor(private aiProvider: AIProvider) {
    super();
  }

  protected async run(
    input: CommitWriterInput,
    context: AgentContext,
  ): Promise<{ data: CommitMessageResult; tokensUsed?: number }> {
    const { truncatedDiff, wasTruncated } = truncateDiff(input.diff);
    if (wasTruncated) {
      context.logger.warn('Diff가 토큰 제한을 초과하여 일부 파일이 생략되었습니다.');
    }

    const convention = input.convention ?? context.config.git.commitConvention;
    const language = input.language ?? context.config.git.commitLanguage;

    const systemPrompt = buildSystemPrompt(convention, language);
    const userPrompt = buildUserPrompt(input, truncatedDiff);

    const request = {
      systemPrompt,
      userPrompt,
      model: context.config.ai.agentModels?.commitWriter ?? context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.3,
    };

    const response = await this.aiProvider.complete(request);

    const parsed = await parseAIResponse(response.content, commitMessageSchema, {
      maxRetries: 1,
      aiProvider: this.aiProvider,
      originalRequest: request,
    });

    const result: CommitMessageResult = {
      message: parsed.message,
      alternatives: parsed.alternatives,
      scope: parsed.scope ?? undefined,
      breakingChange: parsed.breakingChange,
    };

    return {
      data: result,
      tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
    };
  }
}
