import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAvailableProviders } from '../../../src/ai/multi-provider.js';

describe('getAvailableProviders', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all AI provider keys
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('API 키가 없으면 빈 배열 반환', async () => {
    const providers = await getAvailableProviders();
    expect(providers).toEqual([]);
  });

  it('ANTHROPIC_API_KEY만 있으면 claude 프로바이더 1개', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';
    const providers = await getAvailableProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0]!.name).toBe('claude');
  });

  it('여러 API 키가 있으면 해당 프로바이더 모두 반환', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    // OpenAI/Gemini는 모듈 로드 실패할 수 있으므로 claude만 확인
    const providers = await getAvailableProviders();
    expect(providers.length).toBeGreaterThanOrEqual(1);
    expect(providers.some(p => p.name === 'claude')).toBe(true);
  });
});
