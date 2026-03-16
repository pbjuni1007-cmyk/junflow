import { describe, it, expect, vi } from 'vitest';
import { withFallbackRetry, isRateLimitError } from '../../../src/ai/retry.js';
import { AIProvider, AIRequest, AIResponse } from '../../../src/ai/types.js';

function createMockProvider(name: string, behavior: 'success' | 'rate-limit' | 'error'): AIProvider {
  return {
    name,
    complete: vi.fn(async (): Promise<AIResponse> => {
      if (behavior === 'success') {
        return { content: `response from ${name}`, tokensUsed: { input: 10, output: 20 }, model: `${name}-model` };
      }
      if (behavior === 'rate-limit') {
        throw Object.assign(new Error(`Rate limit exceeded on ${name}`), { code: 'RATE_LIMIT_ERROR', status: 429 });
      }
      throw Object.assign(new Error(`Server error on ${name}`), { code: 'AI_ERROR' });
    }),
  };
}

const dummyRequest: AIRequest = {
  systemPrompt: 'test system',
  userPrompt: 'test user',
};

describe('isRateLimitError()', () => {
  it('code: RATE_LIMIT_ERROR를 감지한다', () => {
    const err = Object.assign(new Error('limit'), { code: 'RATE_LIMIT_ERROR' });
    expect(isRateLimitError(err)).toBe(true);
  });

  it('status: 429를 감지한다', () => {
    const err = Object.assign(new Error('too many'), { status: 429 });
    expect(isRateLimitError(err)).toBe(true);
  });

  it('메시지에 rate limit 포함 시 감지한다', () => {
    expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('메시지에 429 포함 시 감지한다', () => {
    expect(isRateLimitError(new Error('HTTP 429'))).toBe(true);
  });

  it('일반 에러는 rate limit이 아니다', () => {
    expect(isRateLimitError(new Error('something else'))).toBe(false);
  });

  it('null/undefined는 rate limit이 아니다', () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });

  it('NETWORK_ERROR는 rate limit이 아니다', () => {
    const err = Object.assign(new Error('network'), { code: 'NETWORK_ERROR' });
    expect(isRateLimitError(err)).toBe(false);
  });
});

describe('withFallbackRetry()', () => {
  it('primary 성공 시 즉시 반환한다', async () => {
    const primary = createMockProvider('claude', 'success');
    const fallback = createMockProvider('openai', 'success');

    const result = await withFallbackRetry(dummyRequest, primary, [fallback], {
      maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1,
    });

    expect(result.content).toBe('response from claude');
    expect(primary.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('primary rate limit 시 fallback으로 전환한다', async () => {
    const primary = createMockProvider('claude', 'rate-limit');
    const fallback = createMockProvider('openai', 'success');

    const result = await withFallbackRetry(dummyRequest, primary, [fallback], {
      maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1,
    });

    expect(result.content).toBe('response from openai');
    expect(primary.complete).toHaveBeenCalled();
    expect(fallback.complete).toHaveBeenCalledTimes(1);
  });

  it('전환 시 onFallback 콜백이 호출된다', async () => {
    const primary = createMockProvider('claude', 'rate-limit');
    const fallback = createMockProvider('openai', 'success');
    const onFallback = vi.fn();

    await withFallbackRetry(dummyRequest, primary, [fallback], {
      maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1,
    }, onFallback);

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({
      fromProvider: 'claude',
      toProvider: 'openai',
      reason: expect.stringContaining('Rate limit'),
    }));
  });

  it('모든 프로바이더가 rate limit이면 마지막 에러를 throw한다', async () => {
    const primary = createMockProvider('claude', 'rate-limit');
    const fallback1 = createMockProvider('openai', 'rate-limit');
    const fallback2 = createMockProvider('gemini', 'rate-limit');

    await expect(
      withFallbackRetry(dummyRequest, primary, [fallback1, fallback2], {
        maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1,
      }),
    ).rejects.toThrow();
  });

  it('첫 fallback도 실패하면 다음 fallback으로 전환한다', async () => {
    const primary = createMockProvider('claude', 'rate-limit');
    const fallback1 = createMockProvider('openai', 'rate-limit');
    const fallback2 = createMockProvider('gemini', 'success');
    const onFallback = vi.fn();

    const result = await withFallbackRetry(dummyRequest, primary, [fallback1, fallback2], {
      maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1,
    }, onFallback);

    expect(result.content).toBe('response from gemini');
    expect(onFallback).toHaveBeenCalledTimes(2);
  });

  it('재시도 불가능한 에러(AUTH_ERROR)는 fallback 없이 즉시 throw한다', async () => {
    const authErr = Object.assign(new Error('Auth failed'), { code: 'AUTH_ERROR' });
    const primary: AIProvider = {
      name: 'claude',
      complete: vi.fn().mockRejectedValue(authErr),
    };
    const fallback = createMockProvider('openai', 'success');

    await expect(
      withFallbackRetry(dummyRequest, primary, [fallback], {
        maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1,
      }),
    ).rejects.toThrow('Auth failed');
    expect(fallback.complete).not.toHaveBeenCalled();
  });

  it('fallback 없이도 primary만으로 재시도 동작한다', async () => {
    const err = Object.assign(new Error('rate limit'), { code: 'RATE_LIMIT_ERROR', status: 429 });
    const primary: AIProvider = {
      name: 'claude',
      complete: vi.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({ content: 'recovered', tokensUsed: { input: 5, output: 10 }, model: 'claude' }),
    };

    const result = await withFallbackRetry(dummyRequest, primary, [], {
      maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1,
    });

    expect(result.content).toBe('recovered');
    expect(primary.complete).toHaveBeenCalledTimes(2);
  });

  it('FallbackEvent에 timestamp가 포함된다', async () => {
    const primary = createMockProvider('claude', 'rate-limit');
    const fallback = createMockProvider('openai', 'success');
    const onFallback = vi.fn();

    await withFallbackRetry(dummyRequest, primary, [fallback], {
      maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1,
    }, onFallback);

    const event = onFallback.mock.calls[0][0];
    expect(event.timestamp).toBeInstanceOf(Date);
  });
});
