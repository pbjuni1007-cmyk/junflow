import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, AIRequest, AIResponse } from './types.js';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(request: AIRequest): Promise<AIResponse> {
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
      if (error instanceof Error && !('code' in error)) {
        throw Object.assign(
          new Error(`AI API error: ${error.message}`),
          { code: 'AI_ERROR', cause: error },
        );
      }
      throw error;
    }
  }
}
