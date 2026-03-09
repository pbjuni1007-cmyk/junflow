import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { OpenAIProvider } from '../../../src/ai/openai.js';

// APIError를 테스트에서 직접 생성하기 위해 openai mock에서 가져옴
async function makeAPIError(msg: string) {
  const mod = await import('openai');
  const Cls = (mod.default as unknown as { APIError: new (msg: string) => Error }).APIError;
  return new Cls(msg);
}

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

  it('APIError → AI_ERROR로 변환', async () => {
    const err = await makeAPIError('rate limit exceeded');
    mockCreate.mockRejectedValueOnce(err);

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
});
