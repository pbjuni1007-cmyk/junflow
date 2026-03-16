import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../src/ai/retry.js';

describe('withRetry()', () => {
  it('성공하면 결과를 즉시 반환한다', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 불가능 에러는 즉시 throw한다', async () => {
    const err = new Error('something unexpected');
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 }))
      .rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 가능 에러(RATE_LIMIT_ERROR)를 재시도 후 성공한다', async () => {
    const retryableErr = Object.assign(new Error('rate limit'), { code: 'RATE_LIMIT_ERROR' });
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableErr)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('재시도 가능 에러가 maxRetries 초과하면 마지막 에러를 throw한다', async () => {
    const retryableErr = Object.assign(new Error('rate limit'), { code: 'RATE_LIMIT_ERROR' });
    const fn = vi.fn().mockRejectedValue(retryableErr);

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 }))
      .rejects.toBe(retryableErr);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('재시도 가능 에러(NETWORK_ERROR)는 재시도한다', async () => {
    const networkErr = Object.assign(new Error('network'), { code: 'NETWORK_ERROR' });
    const fn = vi.fn()
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('HTTP status 429는 재시도 가능으로 판별한다', async () => {
    const err = Object.assign(new Error('rate limit'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('ok');
  });

  it('HTTP status 502/503/504는 재시도 가능으로 판별한다', async () => {
    for (const status of [502, 503, 504]) {
      const err = Object.assign(new Error('server error'), { status });
      const fn = vi.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce('ok');

      const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 });
      expect(result).toBe('ok');
    }
  });

  it('에러 메시지 기반으로 재시도 가능 여부를 판별한다', async () => {
    const messages = ['rate limit', '429', 'econnrefused', 'etimedout', 'enotfound', 'socket hang up', 'network', '502', '503', '504'];

    for (const msg of messages) {
      const err = new Error(msg);
      const fn = vi.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce('ok');

      const result = await withRetry(fn, { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 });
      expect(result).toBe('ok');
    }
  });

  it('non-object 에러는 재시도하지 않는다', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 }))
      .rejects.toBe('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('null 에러는 재시도하지 않는다', async () => {
    const fn = vi.fn().mockRejectedValue(null);

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 }))
      .rejects.toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('커스텀 retryableCheck를 사용할 수 있다', async () => {
    const customErr = { custom: true };
    const fn = vi.fn()
      .mockRejectedValueOnce(customErr)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, {
      maxRetries: 1,
      baseDelayMs: 1,
      maxDelayMs: 1,
      retryableCheck: (err) => typeof err === 'object' && err !== null && 'custom' in err,
    });
    expect(result).toBe('ok');
  });

  it('기본 옵션으로 동작한다 (옵션 미지정)', async () => {
    const fn = vi.fn().mockResolvedValue('default');
    const result = await withRetry(fn);
    expect(result).toBe('default');
  });

  it('HTTP status 200은 재시도하지 않는다', async () => {
    const err = Object.assign(new Error('unexpected'), { status: 200 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 }))
      .rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
