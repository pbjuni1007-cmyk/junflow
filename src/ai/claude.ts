import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIRequest, AIResponse } from './types.js';
import { withRetry } from './retry.js';

export class ClaudeProvider implements AIProvider {
  name = 'claude';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    return withRetry(
      () => this.doComplete(request),
      { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 },
    );
  }

  private async doComplete(request: AIRequest): Promise<AIResponse> {
    try {
      const response = await this.client.messages.create({
        model: request.model ?? 'claude-sonnet-4-20250514',
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw Object.assign(new Error('No text content in response'), { code: 'AI_ERROR' });
      }

      return {
        content: textBlock.text,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        if (error.status === 429) {
          throw Object.assign(
            new Error(`Rate limit exceeded: ${error.message}`),
            { code: 'RATE_LIMIT_ERROR', cause: error, status: 429 },
          );
        }
        if (error.status === 401) {
          throw Object.assign(
            new Error(`Authentication failed: ${error.message}`),
            { code: 'AUTH_ERROR', cause: error },
          );
        }
        if (error.status === 502 || error.status === 503 || error.status === 504) {
          throw Object.assign(
            new Error(`AI API error: ${error.message}`),
            { code: 'AI_ERROR', cause: error, status: error.status },
          );
        }
        throw Object.assign(
          new Error(`AI API error: ${error.message}`),
          { code: 'AI_ERROR', cause: error },
        );
      }
      if (
        error instanceof Error &&
        (error.message.includes('fetch') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('network'))
      ) {
        throw Object.assign(
          new Error(`Network error: ${error.message}`),
          { code: 'NETWORK_ERROR', cause: error },
        );
      }
      throw error;
    }
  }
}
