import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIRequest, AIResponse } from './types.js';

export class ClaudeProvider implements AIProvider {
  name = 'claude';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: AIRequest): Promise<AIResponse> {
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
        throw Object.assign(
          new Error(`AI API error: ${error.message}`),
          { code: 'AI_ERROR', cause: error },
        );
      }
      if (
        error instanceof Error &&
        (error.message.includes('fetch') ||
          error.message.includes('ECONNREFUSED') ||
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
