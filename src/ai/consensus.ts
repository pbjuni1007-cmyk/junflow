import { z } from 'zod';
import { AIProvider, AIRequest, AIResponse } from './types.js';
import { parseAIResponse } from './response-parser.js';

export interface ConsensusResult<T> {
  consensus: T;
  individual: Array<{
    provider: string;
    result: T;
    tokensUsed: number;
  }>;
  agreementScore: number;
  totalTokensUsed: number;
  providersUsed: string[];
}

interface IndividualResult<T> {
  provider: string;
  result: T;
  tokensUsed: number;
}

const CONSENSUS_SYSTEM = `You are a synthesis expert. You are given multiple AI responses to the same task from different models.

Your job is to:
1. Identify areas of agreement across all responses
2. Resolve conflicts by choosing the strongest reasoning
3. Combine the best elements into a single superior result
4. Rate the agreement level (0-100) between the responses

Respond with a JSON object:
{
  "synthesized": <the merged result in the SAME schema as the individual results>,
  "agreementScore": number (0-100),
  "reasoning": "string - brief explanation of synthesis decisions"
}

Return only the JSON object, no markdown code blocks.`;

const consensusMetaSchema = z.object({
  synthesized: z.unknown(),
  agreementScore: z.number(),
  reasoning: z.string(),
});

export class ConsensusRunner {
  constructor(private synthesizer: AIProvider) {}

  async run<T>(
    providers: AIProvider[],
    request: AIRequest,
    schema: z.ZodType<T>,
  ): Promise<ConsensusResult<T>> {
    if (providers.length === 0) {
      throw new Error('No providers available for consensus');
    }

    // 단일 프로바이더면 consensus 불필요
    if (providers.length === 1) {
      const response = await providers[0]!.complete(request);
      const parsed = await parseAIResponse(response.content, schema);
      const tokens = response.tokensUsed.input + response.tokensUsed.output;
      return {
        consensus: parsed,
        individual: [{ provider: providers[0]!.name, result: parsed, tokensUsed: tokens }],
        agreementScore: 100,
        totalTokensUsed: tokens,
        providersUsed: [providers[0]!.name],
      };
    }

    // 멀티 프로바이더: 병렬 실행
    const results = await Promise.allSettled(
      providers.map(async (provider) => {
        const response = await provider.complete(request);
        const parsed = await parseAIResponse(response.content, schema);
        return {
          provider: provider.name,
          result: parsed,
          tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
          raw: response.content,
        };
      }),
    );

    // 성공한 결과만 수집
    const successful: Array<IndividualResult<T> & { raw: string }> = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        successful.push(r.value);
      }
    }

    if (successful.length === 0) {
      throw new Error('All providers failed in consensus run');
    }

    if (successful.length === 1) {
      const s = successful[0]!;
      return {
        consensus: s.result,
        individual: [{ provider: s.provider, result: s.result, tokensUsed: s.tokensUsed }],
        agreementScore: 100,
        totalTokensUsed: s.tokensUsed,
        providersUsed: [s.provider],
      };
    }

    // 합성 요청
    const individualSummary = successful
      .map((s, i) => `### Response ${i + 1} (${s.provider}):\n${s.raw}`)
      .join('\n\n');

    const synthesisRequest: AIRequest = {
      systemPrompt: CONSENSUS_SYSTEM,
      userPrompt: `## Original Task\nSystem: ${request.systemPrompt}\nUser: ${request.userPrompt}\n\n## Individual Responses\n${individualSummary}`,
      maxTokens: request.maxTokens ?? 4096,
      temperature: 0.2,
    };

    const synthesisResponse = await this.synthesizer.complete(synthesisRequest);
    const meta = await parseAIResponse(synthesisResponse.content, consensusMetaSchema);

    // synthesized를 원본 스키마로 검증
    const consensus = schema.parse(meta.synthesized);

    const synthTokens = synthesisResponse.tokensUsed.input + synthesisResponse.tokensUsed.output;
    const totalTokens = successful.reduce((sum, s) => sum + s.tokensUsed, 0) + synthTokens;

    return {
      consensus,
      individual: successful.map((s) => ({
        provider: s.provider,
        result: s.result,
        tokensUsed: s.tokensUsed,
      })),
      agreementScore: meta.agreementScore,
      totalTokensUsed: totalTokens,
      providersUsed: successful.map((s) => s.provider),
    };
  }
}
