import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Tier } from '../../../src/orchestrator/types.js';

// vi.hoisted로 mock 함수를 호이스팅 스코프에서 생성
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecFile,
}));

import { detectTier, isCliAvailable } from '../../../src/orchestrator/tier-manager.js';

describe('tier-manager', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: 모든 CLI 미설치
    mockExecFile.mockRejectedValue(new Error('not found'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('detectTier', () => {
    it('CLI가 설치되어 있으면 FULL 티어를 반환한다', async () => {
      mockExecFile.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === 'codex') return Promise.resolve({ stdout: '/usr/bin/codex' });
        return Promise.reject(new Error('not found'));
      });

      const info = await detectTier();

      expect(info.tier).toBe(Tier.FULL);
      expect(info.availableClis).toContain('codex');
    });

    it('CLI 없고 API 키 2개 이상이면 PARTIAL 티어를 반환한다', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test';
      process.env.OPENAI_API_KEY = 'sk-test2';

      const info = await detectTier();

      expect(info.tier).toBe(Tier.PARTIAL);
      expect(info.availableClis).toHaveLength(0);
      expect(info.availableProviders.length).toBeGreaterThanOrEqual(2);
    });

    it('CLI 없고 API 키 1개 이하면 MINIMAL 티어를 반환한다', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const info = await detectTier();

      expect(info.tier).toBe(Tier.MINIMAL);
      expect(info.availableClis).toHaveLength(0);
    });

    it('API 키 1개만 있으면 MINIMAL 티어이다', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-test';

      const info = await detectTier();

      expect(info.tier).toBe(Tier.MINIMAL);
      expect(info.availableProviders).toContain('claude');
    });

    it('여러 CLI가 설치되어 있으면 모두 감지한다', async () => {
      mockExecFile.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === 'codex' || args[0] === 'gemini') {
          return Promise.resolve({ stdout: `/usr/bin/${args[0]}` });
        }
        return Promise.reject(new Error('not found'));
      });

      const info = await detectTier();

      expect(info.tier).toBe(Tier.FULL);
      expect(info.availableClis).toContain('codex');
      expect(info.availableClis).toContain('gemini');
    });
  });

  describe('isCliAvailable', () => {
    it('CLI가 있으면 true를 반환한다', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '/usr/bin/codex' });
      expect(await isCliAvailable('codex')).toBe(true);
    });

    it('CLI가 없으면 false를 반환한다', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('not found'));
      expect(await isCliAvailable('codex')).toBe(false);
    });
  });
});
