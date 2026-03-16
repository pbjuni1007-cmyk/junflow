import { AIProvider, AIRequest, AIResponse } from './types.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCheck?: (error: unknown) => boolean;
  fallbackProviders?: AIProvider[];
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

export function isRateLimitError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  if ('code' in error) {
    const code = (error as { code: string }).code;
    if (code === 'RATE_LIMIT_ERROR') return true;
  }

  if ('status' in error) {
    const status = (error as { status: number }).status;
    if (status === 429) return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('429')) return true;
  }

  return false;
}

function isRetryableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  // AgentError code 기반 판별
  if ('code' in error) {
    const code = (error as { code: string }).code;
    if (code === 'RATE_LIMIT_ERROR' || code === 'NETWORK_ERROR') return true;
  }

  // HTTP status 기반 판별
  if ('status' in error) {
    const status = (error as { status: number }).status;
    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  }

  // Error message 기반 판별
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('enotfound') ||
      msg.includes('socket hang up') ||
      msg.includes('network') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504')
    ) {
      return true;
    }
  }

  return false;
}

function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.min(jitter, maxDelayMs);
}

export interface FallbackEvent {
  fromProvider: string;
  toProvider: string;
  reason: string;
  timestamp: Date;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const check = opts.retryableCheck ?? isRetryableError;
  const fallbacks = opts.fallbackProviders ?? [];

  let lastError: unknown;

  // 1차: 원래 함수로 재시도
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!check(error)) {
        throw error;
      }

      // rate limit 에러이고 fallback 프로바이더가 있으면 즉시 전환
      if (isRateLimitError(error) && fallbacks.length > 0) {
        break;
      }

      if (attempt >= opts.maxRetries) {
        // 마지막 재시도 실패 - fallback 있으면 전환, 없으면 throw
        if (fallbacks.length > 0) break;
        throw error;
      }

      const delay = computeDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 2차: fallback 프로바이더 순회 (rate limit 또는 재시도 소진 시)
  for (const fallback of fallbacks) {
    try {
      return await fn();
    } catch {
      // fallback도 실패하면 다음으로
    }
  }

  throw lastError;
}

/**
 * rate limit 감지 시 fallback 프로바이더로 자동 전환하는 retry wrapper.
 * withRetry의 상위 래퍼로, AIProvider.complete() 호출에 특화.
 */
export async function withFallbackRetry(
  request: AIRequest,
  primary: AIProvider,
  fallbacks: AIProvider[],
  options?: Partial<Omit<RetryOptions, 'fallbackProviders'>>,
  onFallback?: (event: FallbackEvent) => void,
): Promise<AIResponse> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const check = opts.retryableCheck ?? isRetryableError;
  const providers = [primary, ...fallbacks];
  const fallbackLog: FallbackEvent[] = [];

  let lastError: unknown;

  for (let pi = 0; pi < providers.length; pi++) {
    const provider = providers[pi];

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await provider.complete(request);
      } catch (error) {
        lastError = error;

        if (!check(error)) {
          throw error;
        }

        // rate limit 에러 → 즉시 다음 프로바이더로 전환
        if (isRateLimitError(error) && pi < providers.length - 1) {
          const event: FallbackEvent = {
            fromProvider: provider.name,
            toProvider: providers[pi + 1].name,
            reason: error instanceof Error ? error.message : 'Rate limit exceeded',
            timestamp: new Date(),
          };
          fallbackLog.push(event);
          onFallback?.(event);
          break; // inner retry loop 탈출 → 다음 프로바이더
        }

        if (attempt >= opts.maxRetries) {
          // 재시도 소진 → 다음 프로바이더로 전환
          if (pi < providers.length - 1) {
            const event: FallbackEvent = {
              fromProvider: provider.name,
              toProvider: providers[pi + 1].name,
              reason: `Retries exhausted: ${error instanceof Error ? error.message : 'Unknown error'}`,
              timestamp: new Date(),
            };
            fallbackLog.push(event);
            onFallback?.(event);
            break;
          }
          throw error;
        }

        const delay = computeDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
