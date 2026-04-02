import { z } from 'zod';
import { DeepAgent, DeepAgentOptions } from './deep-base.js';
import { AgentContext } from './types.js';
import { AIProvider, AIRequest } from '../ai/types.js';
import { truncateDiff } from '../ai/diff-truncator.js';
import { CommitMessageResult, commitMessageSchema, CommitWriterInput } from './commit-writer.js';
import { COMMIT_WRITER_SYSTEM } from '../ai/prompts/commit-message.js';

/**
 * 멀티 프로바이더 합의 기반 커밋 메시지 작성기.
 * 여러 AI 모델이 독립 생성 → ConsensusRunner가 합성하여 최적 커밋 메시지 도출.
 */
export class DeepCommitWriter extends DeepAgent<CommitWriterInput, CommitMessageResult> {
  name = 'DeepCommitWriter';
  description = '멀티모델 합의 기반 커밋 메시지 생성';

  constructor(primaryProvider: AIProvider, options?: DeepAgentOptions) {
    super(primaryProvider, options);
  }

  protected buildRequest(input: CommitWriterInput, context: AgentContext): AIRequest {
    const { truncatedDiff, wasTruncated } = truncateDiff(input.diff);
    if (wasTruncated) {
      context.logger.warn('Diff가 토큰 제한을 초과하여 일부 파일이 생략되었습니다.');
    }

    const convention = input.convention ?? context.config.git.commitConvention;
    const language = input.language ?? context.config.git.commitLanguage;

    const langInstruction =
      language === 'ko'
        ? '커밋 메시지 본문은 한국어로 작성하세요.'
        : 'Write commit message body in English.';

    const conventionInstruction =
      convention === 'gitmoji'
        ? 'Use gitmoji convention (e.g. ✨ feat, 🐛 fix, ♻️ refactor).'
        : 'Use Conventional Commits specification (feat, fix, chore, docs, refactor, test, style, perf).';

    const systemPrompt = `${COMMIT_WRITER_SYSTEM}

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

    return {
      systemPrompt,
      userPrompt: lines.join('\n'),
      model: context.config.ai.agentModels?.commitWriter ?? context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.3,
    };
  }

  protected getOutputSchema(): z.ZodType<CommitMessageResult> {
    // commitMessageSchema는 nullable scope를 허용하지만 postProcess에서 undefined로 변환
    return commitMessageSchema as unknown as z.ZodType<CommitMessageResult>;
  }

  protected postProcess(consensus: CommitMessageResult): CommitMessageResult {
    return {
      message: consensus.message,
      alternatives: consensus.alternatives,
      scope: consensus.scope ?? undefined,
      breakingChange: consensus.breakingChange,
    };
  }
}
