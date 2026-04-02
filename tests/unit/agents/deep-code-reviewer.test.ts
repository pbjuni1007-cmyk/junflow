import { describe, it, expect, vi } from 'vitest';
import { DeepCodeReviewer } from '../../../src/agents/deep-code-reviewer.js';
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

const SAMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,5 @@
+import { db } from './db';
 export function getUser(id: string) {
-  return null;
+  const q = \`SELECT * FROM users WHERE id = '\${id}'\`;
+  return db.query(q);
 }`;

const VALID_REVIEW = {
  summary: 'SQL injection vulnerability detected',
  findings: [
    {
      severity: 'critical',
      file: 'src/app.ts',
      line: 4,
      message: '[Security] SQL injection via string interpolation',
      suggestion: 'Use parameterized queries',
    },
    {
      severity: 'suggestion',
      file: 'src/app.ts',
      line: null,
      message: '[Readability] Variable name q is not descriptive',
      suggestion: 'Rename to userQuery',
    },
  ],
  overallScore: 3,
};

function makeProvider(response: object): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
      tokensUsed: { input: 200, output: 300 },
      model: 'mock-model',
    } as AIResponse),
  };
}

describe('DeepCodeReviewer', () => {
  it('단일 프로바이더로 리뷰를 수행한다', async () => {
    const provider = makeProvider(VALID_REVIEW);
    const reviewer = new DeepCodeReviewer(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toContain('SQL injection');
      expect(result.data.findings).toHaveLength(2);
      expect(result.data.findings[0]!.severity).toBe('critical');
      expect(result.data.overallScore).toBe(3);
    }
  });

  it('postProcess가 nullable 필드를 정리한다', async () => {
    const reviewWithNulls = {
      ...VALID_REVIEW,
      findings: [
        { severity: 'warning', file: 'a.ts', line: null, message: 'test', suggestion: null },
      ],
    };
    const provider = makeProvider(reviewWithNulls);
    const reviewer = new DeepCodeReviewer(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const finding = result.data.findings[0]!;
      expect(finding.line).toBeUndefined();
      expect(finding.suggestion).toBeUndefined();
    }
  });

  it('이슈 컨텍스트를 요청에 포함한다', async () => {
    const provider = makeProvider(VALID_REVIEW);
    const reviewer = new DeepCodeReviewer(provider, { providers: [provider] });
    const ctx = makeContext();

    await reviewer.execute(
      {
        diff: SAMPLE_DIFF,
        issueAnalysis: { title: 'Fix auth', summary: 'Auth is broken', type: 'bug' },
      },
      ctx,
    );

    const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.userPrompt).toContain('Fix auth');
    expect(call.userPrompt).toContain('Auth is broken');
  });

  it('AI 오류 시 실패 결과를 반환한다', async () => {
    const provider: AIProvider = {
      name: 'failing',
      complete: vi.fn().mockRejectedValue(new Error('Rate limit')),
    };
    const reviewer = new DeepCodeReviewer(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(false);
  });
});
