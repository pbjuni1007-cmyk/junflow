import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext } from './types.js';
import { AIProvider, AIRequest } from '../ai/types.js';
import { ConsensusRunner, ConsensusResult } from '../ai/consensus.js';
import { getAvailableProviders } from '../ai/multi-provider.js';

export interface DeepAgentOptions {
  /** 합의에 사용할 프로바이더 목록. 미지정 시 환경변수에서 자동 감지 */
  providers?: AIProvider[];
  /** 합성에 사용할 프로바이더. 미지정 시 첫 번째 프로바이더 사용 */
  synthesizer?: AIProvider;
}

export interface DeepRunResult<T> {
  data: T;
  tokensUsed?: number;
  consensusMetadata?: {
    providersUsed: string[];
    agreementScore: number;
    individualCount: number;
  };
}

/**
 * Deep 에이전트 추상 베이스.
 * 멀티 프로바이더 합의(ConsensusRunner) 기반으로 동작하며,
 * 단일 프로바이더 환경에서는 자동으로 일반 실행으로 폴백한다.
 */
export abstract class DeepAgent<TInput, TOutput> extends BaseAgent<TInput, TOutput> {
  private primaryProvider: AIProvider;
  private deepOptions: DeepAgentOptions;

  constructor(primaryProvider: AIProvider, options?: DeepAgentOptions) {
    super();
    this.primaryProvider = primaryProvider;
    this.deepOptions = options ?? {};
  }

  /** AI 요청을 구성한다 */
  protected abstract buildRequest(input: TInput, context: AgentContext): AIRequest;

  /** 출력 스키마를 반환한다 */
  protected abstract getOutputSchema(): z.ZodType<TOutput>;

  /** 합의 결과를 최종 출력으로 변환한다. 기본: 그대로 반환 */
  protected postProcess(consensus: TOutput, _input: TInput): TOutput {
    return consensus;
  }

  protected async run(
    input: TInput,
    context: AgentContext,
  ): Promise<DeepRunResult<TOutput>> {
    const providers = this.deepOptions.providers ?? await getAvailableProviders();

    // 프로바이더가 없으면 primary로 폴백
    if (providers.length === 0) {
      providers.push(this.primaryProvider);
    }

    const request = this.buildRequest(input, context);
    const schema = this.getOutputSchema();

    const synthesizer = this.deepOptions.synthesizer ?? providers[0] ?? this.primaryProvider;
    const consensusRunner = new ConsensusRunner(synthesizer);

    context.logger.info(`[${this.name}] Running consensus with ${providers.length} provider(s)`);

    const consensusResult: ConsensusResult<TOutput> = await consensusRunner.run(
      providers,
      request,
      schema,
    );

    const processed = this.postProcess(consensusResult.consensus, input);

    return {
      data: processed,
      tokensUsed: consensusResult.totalTokensUsed,
      consensusMetadata: {
        providersUsed: consensusResult.providersUsed,
        agreementScore: consensusResult.agreementScore,
        individualCount: consensusResult.individual.length,
      },
    };
  }
}
