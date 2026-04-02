import { describe, it, expect, vi } from 'vitest';
import { DeepCommitWriter } from '../../../src/agents/deep-commit-writer.js';
import { AgentContext } from '../../../src/agents/types.js';
import { AIProvider, AIResponse } from '../../../src/ai/types.js';

const mockConfig = {
  ai: { provider: 'claude', model: 'claude-sonnet-4-20250514', maxTokens: 2048 },
  tracker: { type: 'mock' as const },
  git: { branchConvention: '{type}/{issueId}-{description}', commitConvention: 'conventional' as const, commitLanguage: 'ko' as const },
  output: { color: true, verbose: false },
};

function makeContext(): AgentContext {
  return {
    workingDir: '/tmp',
    config: mockConfig,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
+import jwt from 'jsonwebtoken';
 export function login(user: string, pass: string) {
-  return true;
+  const token = jwt.sign({ sub: user }, 'secret');
+  return { token };
 }`;

const VALID_COMMIT = {
  message: 'feat(auth): JWT 기반 로그인 구현',
  alternatives: ['feat: 인증 토큰 발급 기능 추가', 'feat(auth): add JWT login'],
  scope: 'auth',
  breakingChange: false,
};

function makeProvider(response: object): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
      tokensUsed: { input: 100, output: 150 },
      model: 'mock-model',
    } as AIResponse),
  };
}

describe('DeepCommitWriter', () => {
  it('단일 프로바이더로 커밋 메시지를 생성한다', async () => {
    const provider = makeProvider(VALID_COMMIT);
    const writer = new DeepCommitWriter(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await writer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toContain('JWT');
      expect(result.data.alternatives).toHaveLength(2);
      expect(result.data.scope).toBe('auth');
      expect(result.data.breakingChange).toBe(false);
    }
  });

  it('nullable scope를 undefined로 정리한다', async () => {
    const commitNoScope = { ...VALID_COMMIT, scope: null };
    const provider = makeProvider(commitNoScope);
    const writer = new DeepCommitWriter(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await writer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBeUndefined();
    }
  });

  it('gitmoji 컨벤션을 시스템 프롬프트에 반영한다', async () => {
    const provider = makeProvider(VALID_COMMIT);
    const writer = new DeepCommitWriter(provider, { providers: [provider] });
    const ctx = makeContext();
    ctx.config = { ...ctx.config, git: { ...ctx.config.git, commitConvention: 'gitmoji' } };

    await writer.execute({ diff: SAMPLE_DIFF }, ctx);

    const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.systemPrompt).toContain('gitmoji');
  });

  it('이슈 컨텍스트를 포함한다', async () => {
    const provider = makeProvider(VALID_COMMIT);
    const writer = new DeepCommitWriter(provider, { providers: [provider] });
    const ctx = makeContext();

    await writer.execute(
      {
        diff: SAMPLE_DIFF,
        issueAnalysis: { title: 'Add JWT', summary: 'Implement JWT auth', type: 'feature' },
      },
      ctx,
    );

    const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.userPrompt).toContain('Add JWT');
  });
});
