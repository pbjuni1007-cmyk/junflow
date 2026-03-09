import { Agent, AgentContext, AgentResult, AgentError, succeed, fail } from './types.js';

export abstract class BaseAgent<TInput, TOutput> implements Agent<TInput, TOutput> {
  abstract name: string;
  abstract description: string;

  async execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    context.logger.info(`[${this.name}] Starting...`);
    try {
      const result = await this.run(input, context);
      const duration = Date.now() - startTime;
      context.logger.info(`[${this.name}] Completed in ${duration}ms`);
      return succeed(this.name, result.data, duration, result.tokensUsed);
    } catch (error) {
      const duration = Date.now() - startTime;
      context.logger.error(`[${this.name}] Failed: ${error}`);
      // AgentError 형태로 throw된 경우 code를 보존
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error &&
        typeof (error as AgentError).code === 'string'
      ) {
        return fail<TOutput>(this.name, error as AgentError, duration);
      }
      const agentError: AgentError = {
        code: 'AI_ERROR',
        message: String(error),
        cause: error,
      };
      return fail<TOutput>(this.name, agentError, duration);
    }
  }

  protected abstract run(
    input: TInput,
    context: AgentContext,
  ): Promise<{ data: TOutput; tokensUsed?: number }>;
}
