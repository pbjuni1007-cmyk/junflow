import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock retry to bypass delays
vi.mock('../../../src/ai/retry.js', () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

// Mock the Anthropic SDK
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  class MockAnthropic {
    messages = { create: mockCreate };
    static APIError = APIError;
  }

  return { default: MockAnthropic };
});

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeProvider } from '../../../src/ai/claude.js';

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    mockCreate.mockReset();
    provider = new ClaudeProvider('sk-ant-test-key');
  });

  it('name 속성이 claude이다', () => {
    expect(provider.name).toBe('claude');
  });

  it('성공적인 응답을 파싱하여 반환한다', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"message": "test commit"}' }],
      usage: { input_tokens: 100, output_tokens: 50 },
      model: 'claude-sonnet-4-20250514',
    });

    const result = await provider.complete({
      systemPrompt: 'You are a commit writer.',
      userPrompt: 'Write a commit message.',
    });

    expect(result.content).toBe('{"message": "test commit"}');
    expect(result.tokensUsed).toEqual({ input: 100, output: 50 });
    expect(result.model).toBe('claude-sonnet-4-20250514');
  });

  it('기본 모델/maxTokens/temperature를 사용한다', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-sonnet-4-20250514',
    });

    await provider.complete({
      systemPrompt: 'sys',
      userPrompt: 'user',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0,
      }),
    );
  });

  it('커스텀 model/maxTokens/temperature를 전달한다', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-opus-4-20250514',
    });

    await provider.complete({
      systemPrompt: 'sys',
      userPrompt: 'user',
      model: 'claude-opus-4-20250514',
      maxTokens: 4096,
      temperature: 0.7,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-20250514',
        max_tokens: 4096,
        temperature: 0.7,
      }),
    );
  });

  it('텍스트 블록이 없으면 AI_ERROR를 던진다', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'image', source: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-sonnet-4-20250514',
    });

    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('Anthropic APIError 429 → RATE_LIMIT_ERROR로 래핑한다', async () => {
    const apiError = new (Anthropic as any).APIError('Rate limit exceeded', 429);
    mockCreate.mockRejectedValue(apiError);

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('RATE_LIMIT_ERROR');
      expect(err.message).toContain('Rate limit exceeded');
      expect(err.cause).toBe(apiError);
      expect(err.status).toBe(429);
    }
  });

  it('Anthropic APIError 401 → AUTH_ERROR로 래핑한다', async () => {
    const apiError = new (Anthropic as any).APIError('Unauthorized', 401);
    mockCreate.mockRejectedValue(apiError);

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('AUTH_ERROR');
      expect(err.cause).toBe(apiError);
    }
  });

  it('Anthropic APIError 502/503/504 → AI_ERROR + status로 래핑한다', async () => {
    for (const status of [502, 503, 504]) {
      const apiError = new (Anthropic as any).APIError('Server error', status);
      mockCreate.mockRejectedValue(apiError);

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

  it('Anthropic APIError 기타 → AI_ERROR로 래핑한다', async () => {
    const apiError = new (Anthropic as any).APIError('Bad request', 400);
    mockCreate.mockRejectedValue(apiError);

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('AI_ERROR');
      expect(err.message).toContain('AI API error');
      expect(err.cause).toBe(apiError);
    }
  });

  it('네트워크 에러(ECONNREFUSED) → NETWORK_ERROR로 래핑한다', async () => {
    mockCreate.mockRejectedValue(new Error('ECONNREFUSED connect failed'));

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('NETWORK_ERROR');
      expect(err.message).toContain('Network error');
    }
  });

  it('네트워크 에러(fetch) → NETWORK_ERROR로 래핑한다', async () => {
    mockCreate.mockRejectedValue(new Error('fetch failed'));

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('NETWORK_ERROR');
    }
  });

  it('네트워크 에러(network) → NETWORK_ERROR로 래핑한다', async () => {
    mockCreate.mockRejectedValue(new Error('network timeout'));

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('NETWORK_ERROR');
    }
  });

  it('네트워크 에러(ETIMEDOUT) → NETWORK_ERROR로 래핑한다', async () => {
    mockCreate.mockRejectedValue(new Error('ETIMEDOUT'));

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('NETWORK_ERROR');
    }
  });

  it('네트워크 에러(ENOTFOUND) → NETWORK_ERROR로 래핑한다', async () => {
    mockCreate.mockRejectedValue(new Error('ENOTFOUND'));

    try {
      await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('NETWORK_ERROR');
    }
  });

  it('알 수 없는 에러는 그대로 throw한다', async () => {
    const unknownErr = new Error('something unexpected');
    mockCreate.mockRejectedValue(unknownErr);

    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toBe(unknownErr);
  });

  it('non-Error 객체도 그대로 throw한다', async () => {
    mockCreate.mockRejectedValue('string error');

    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toBe('string error');
  });
});
