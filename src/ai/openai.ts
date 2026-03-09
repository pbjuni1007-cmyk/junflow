import OpenAI from 'openai';
import { AIProvider, AIRequest, AIResponse } from './types.js';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model ?? 'gpt-4o',
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
      });

      const choice = response.choices[0];
      const content = choice?.message?.content;
      if (!content) {
        throw Object.assign(new Error('No text content in response'), { code: 'AI_ERROR' });
      }

      return {
        content,
        tokensUsed: {
          input: response.usage?.prompt_tokens ?? 0,
          output: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
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
