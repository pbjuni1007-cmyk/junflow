import { z } from 'zod';
import { AIProvider, AIRequest } from './types.js';

interface ParseError {
  code: 'AI_PARSE_ERROR';
  message: string;
}

function extractJsonFromCodeBlock(text: string): string | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }
  return null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractJsonFromCodeBlock(text);
    if (extracted !== null) {
      return JSON.parse(extracted);
    }
    throw new Error('Failed to parse JSON from response');
  }
}

export async function parseAIResponse<T>(
  response: string,
  schema: z.ZodType<T>,
  options?: {
    maxRetries?: number;
    aiProvider?: AIProvider;
    originalRequest?: AIRequest;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 1;

  async function attemptParse(text: string): Promise<T> {
    let parsed: unknown;
    try {
      parsed = tryParseJson(text);
    } catch (jsonError) {
      throw { code: 'AI_PARSE_ERROR', message: `JSON parse failed: ${String(jsonError)}` } as ParseError;
    }

    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    throw {
      code: 'AI_PARSE_ERROR',
      message: `Schema validation failed: ${result.error.message}`,
    } as ParseError;
  }

  let lastError: ParseError = { code: 'AI_PARSE_ERROR', message: 'Unknown parse error' };

  try {
    return await attemptParse(response);
  } catch (error) {
    lastError = error as ParseError;
  }

  if (options?.aiProvider && options?.originalRequest) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const retryRequest: AIRequest = {
          ...options.originalRequest,
          userPrompt:
            `${options.originalRequest.userPrompt}\n\nPrevious response could not be parsed. Please respond with valid JSON only, no markdown code blocks.`,
        };
        const retryResponse = await options.aiProvider.complete(retryRequest);
        return await attemptParse(retryResponse.content);
      } catch (retryError) {
        lastError = retryError as ParseError;
      }
    }
  }

  throw lastError;
}
