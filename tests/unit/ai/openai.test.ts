import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock retry to bypass delays
vi.mock('../../../src/ai/retry.js', () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

const mockCreate = vi.fn();

vi.mock('openai', () => {
  class APIError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  return {
    default: class OpenAI {
      static APIError = APIError;
      chat = { completions: { create: mockCreate } };
      constructor(_opts: unknown) {}
    },
  };
});

import OpenAI from 'openai';
import { OpenAIProvider } from '../../../src/ai/openai.js';

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('complete() 성공 - tokensUsed 매핑 확인', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Hello from OpenAI' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      model: 'gpt-4o',
    });

    const provider = new OpenAIProvider('test-key');
    const result = await provider.complete({
      systemPrompt: 'You are helpful',
      userPrompt: 'Say hello',
    });

    expect(result.content).toBe('Hello from OpenAI');
    expect(result.tokensUsed.input).toBe(10);
    expect(result.tokensUsed.output).toBe(20);
    expect(result.model).toBe('gpt-4o');
  });

  it('model 파라미터가 request.model로 전달됨', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
      model: 'gpt-4o-mini',
    });

    const provider = new OpenAIProvider('test-key');
    await provider.complete({
      systemPrompt: 'sys',
      userPrompt: 'user',
      model: 'gpt-4o-mini',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o-mini' }),
    );
  });

  it('응답에 content가 없으면 AI_ERROR throw', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
      usage: { prompt_tokens: 1, completion_tokens: 0 },
      model: 'gpt-4o',
    });

    const provider = new OpenAIProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('APIError 429 → RATE_LIMIT_ERROR로 변환', async () => {
    const apiError = new (OpenAI as any).APIError('rate limit exceeded', 429);
    mockCreate.mockRejectedValueOnce(apiError);

    const provider = new OpenAIProvider('test-key');
    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('RATE_LIMIT_ERROR');
      expect(err.status).toBe(429);
      expect(err.cause).toBe(apiError);
    }
  });

  it('APIError 401 → AUTH_ERROR로 변환', async () => {
    const apiError = new (OpenAI as any).APIError('unauthorized', 401);
    mockCreate.mockRejectedValueOnce(apiError);

    const provider = new OpenAIProvider('test-key');
    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('AUTH_ERROR');
      expect(err.cause).toBe(apiError);
    }
  });

  it('APIError 502/503/504 → AI_ERROR + status로 변환', async () => {
    for (const status of [502, 503, 504]) {
      const apiError = new (OpenAI as any).APIError('server error', status);
      mockCreate.mockRejectedValueOnce(apiError);

      const provider = new OpenAIProvider('test-key');
      try {
        await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('AI_ERROR');
        expect(err.status).toBe(status);
        expect(err.cause).toBe(apiError);
      }
    }
  });

  it('APIError 기타 → AI_ERROR로 변환', async () => {
    const apiError = new (OpenAI as any).APIError('bad request', 400);
    mockCreate.mockRejectedValueOnce(apiError);

    const provider = new OpenAIProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('네트워크 에러 → NETWORK_ERROR로 변환', async () => {
    mockCreate.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

    const provider = new OpenAIProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('ETIMEDOUT → NETWORK_ERROR로 변환', async () => {
    mockCreate.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const provider = new OpenAIProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('알 수 없는 에러는 그대로 throw', async () => {
    const unknownErr = new Error('something unexpected');
    mockCreate.mockRejectedValueOnce(unknownErr);

    const provider = new OpenAIProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toBe(unknownErr);
  });

  it('usage가 undefined이면 tokensUsed는 0', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }],
      usage: undefined,
      model: 'gpt-4o',
    });

    const provider = new OpenAIProvider('test-key');
    const result = await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
    expect(result.tokensUsed).toEqual({ input: 0, output: 0 });
  });

  it('기본 모델/maxTokens/temperature를 사용한다', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
      model: 'gpt-4o',
    });

    const provider = new OpenAIProvider('test-key');
    await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        max_tokens: 2048,
        temperature: 0,
      }),
    );
  });

  it('choices가 빈 배열이면 AI_ERROR throw', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [],
      usage: { prompt_tokens: 1, completion_tokens: 0 },
      model: 'gpt-4o',
    });

    const provider = new OpenAIProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' });
  });
});
