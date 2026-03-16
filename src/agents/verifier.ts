import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentResult } from './types.js';
import { AIProvider } from '../ai/types.js';
import { parseAIResponse } from '../ai/response-parser.js';

export interface VerifierInput {
  originalTask: string;
  result: unknown;
  criteria?: string[];
}

export interface VerificationResult {
  approved: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
  reasoning: string;
}

const verificationSchema = z.object({
  approved: z.boolean(),
  score: z.number(),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
  reasoning: z.string(),
});

const VERIFIER_SYSTEM = `You are a strict quality verifier. You evaluate whether an AI-generated result meets the requirements of the original task.

Evaluate based on:
1. Completeness — Does the result cover all aspects of the task?
2. Accuracy — Is the information correct and well-reasoned?
3. Format — Does it follow the expected structure?
4. Quality — Is it production-ready or does it need improvement?

Respond with a JSON object:
{
  "approved": boolean,
  "score": number (1-10),
  "issues": ["string - specific problems found"],
  "suggestions": ["string - actionable improvements"],
  "reasoning": "string - overall assessment"
}

Be strict: only approve (score >= 7) if the result is genuinely good.
Return only the JSON object, no markdown code blocks.`;

export class Verifier extends BaseAgent<VerifierInput, VerificationResult> {
  name = 'Verifier';
  description = '결과 검증 에이전트';

  constructor(private aiProvider: AIProvider) {
    super();
  }

  protected async run(
    input: VerifierInput,
    _context: AgentContext,
  ): Promise<{ data: VerificationResult; tokensUsed?: number }> {
    const lines: string[] = [];
    lines.push('## Original Task');
    lines.push(input.originalTask);
    lines.push('');
    lines.push('## Result to Verify');
    lines.push(typeof input.result === 'string' ? input.result : JSON.stringify(input.result, null, 2));

    if (input.criteria && input.criteria.length > 0) {
      lines.push('');
      lines.push('## Additional Criteria');
      for (const c of input.criteria) {
        lines.push(`- ${c}`);
      }
    }

    const request = {
      systemPrompt: VERIFIER_SYSTEM,
      userPrompt: lines.join('\n'),
      maxTokens: 2048,
      temperature: 0.2,
    };

    const response = await this.aiProvider.complete(request);

    const parsed = await parseAIResponse(response.content, verificationSchema, {
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

// 검증 루프: 에이전트 실행 → 검증 → 실패 시 재실행
export async function verifyLoop<TInput, TOutput>(
  agent: { execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>> },
  verifier: Verifier,
  input: TInput,
  context: AgentContext,
  options: {
    taskDescription: string;
    criteria?: string[];
    maxRetries?: number;
    onRetry?: (attempt: number, issues: string[]) => void;
  },
): Promise<{
  result: AgentResult<TOutput>;
  verification: VerificationResult;
  attempts: number;
}> {
  const maxRetries = options.maxRetries ?? 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await agent.execute(input, context);

    if (!result.success) {
      return {
        result,
        verification: {
          approved: false,
          score: 0,
          issues: [`Agent failed: ${result.error.message}`],
          suggestions: [],
          reasoning: 'Agent execution failed',
        },
        attempts: attempt + 1,
      };
    }

    // 검증
    const verifyResult = await verifier.execute(
      {
        originalTask: options.taskDescription,
        result: result.data,
        criteria: options.criteria,
      },
      context,
    );

    if (!verifyResult.success) {
      // 검증 자체가 실패하면 원본 결과를 그대로 반환
      return {
        result,
        verification: {
          approved: true,
          score: 5,
          issues: ['Verification failed, accepting original result'],
          suggestions: [],
          reasoning: 'Verifier error — accepting result as-is',
        },
        attempts: attempt + 1,
      };
    }

    if (verifyResult.data.approved) {
      return {
        result,
        verification: verifyResult.data,
        attempts: attempt + 1,
      };
    }

    // 마지막 시도였으면 실패해도 반환
    if (attempt === maxRetries) {
      return {
        result,
        verification: verifyResult.data,
        attempts: attempt + 1,
      };
    }

    // 재시도 콜백
    if (options.onRetry) {
      options.onRetry(attempt + 1, verifyResult.data.issues);
    }
  }

  // unreachable, but TypeScript needs it
  throw new Error('Unexpected end of verify loop');
}
