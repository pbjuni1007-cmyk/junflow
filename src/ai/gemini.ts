import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, AIRequest, AIResponse } from './types.js';
import { withRetry } from './retry.js';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    return withRetry(
      () => this.doComplete(request),
      { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 },
    );
  }

  private async doComplete(request: AIRequest): Promise<AIResponse> {
    try {
      const genModel = this.client.getGenerativeModel({
        model: request.model ?? 'gemini-2.0-flash',
        systemInstruction: request.systemPrompt,
      });

      const result = await genModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0,
        },
      });

      const response = result.response;
      const content = response.text();
      if (!content) {
        throw Object.assign(new Error('No text content in response'), { code: 'AI_ERROR' });
      }

      return {
        content,
        tokensUsed: {
          input: response.usageMetadata?.promptTokenCount ?? 0,
          output: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
        model: request.model ?? 'gemini-2.0-flash',
      };
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message;

        // 네트워크 에러
        if (
          msg.includes('fetch') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('ENOTFOUND') ||
          msg.includes('network')
        ) {
          throw Object.assign(
            new Error(`Network error: ${msg}`),
            { code: 'NETWORK_ERROR', cause: error },
          );
        }

        // Rate limit
        if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
          throw Object.assign(
            new Error(`Rate limit exceeded: ${msg}`),
            { code: 'RATE_LIMIT_ERROR', cause: error, status: 429 },
          );
        }

        // 인증 에러
        if (msg.includes('401') || msg.includes('API key') || msg.includes('authentication')) {
          throw Object.assign(
            new Error(`Authentication failed: ${msg}`),
            { code: 'AUTH_ERROR', cause: error },
          );
        }

        // 서버 에러 (재시도 가능)
        if (msg.includes('502') || msg.includes('503') || msg.includes('504')) {
          throw Object.assign(
            new Error(`AI API error: ${msg}`),
            { code: 'AI_ERROR', cause: error, status: parseInt(msg.match(/50[234]/)?.[0] ?? '500') },
          );
        }

        if (!('code' in error)) {
          throw Object.assign(
            new Error(`AI API error: ${msg}`),
            { code: 'AI_ERROR', cause: error },
          );
        }
      }
      throw error;
    }
  }
}
