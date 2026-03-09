import { describe, it, expect, vi } from 'vitest';
import { CodeReviewer, CodeReviewerInput } from '../../../src/agents/code-reviewer.js';
import { AgentContext } from '../../../src/agents/types.js';
import { AIProvider, AIResponse } from '../../../src/ai/types.js';
import { JunFlowConfig } from '../../../src/config/schema.js';

const mockConfig: JunFlowConfig = {
  ai: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
  },
  tracker: { type: 'mock' },
  git: {
    branchConvention: '{type}/{issueId}-{description}',
    commitConvention: 'conventional',
    commitLanguage: 'ko',
  },
  output: { color: true, verbose: false },
};

function makeContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    workingDir: '/tmp',
    config: mockConfig,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  };
}

function makeProvider(responseJson: object): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(responseJson),
      tokensUsed: { input: 100, output: 200 },
      model: 'mock-model',
    } as AIResponse),
  };
}

const SAMPLE_DIFF = `diff --git a/src/api/profile.ts b/src/api/profile.ts
index 1234567..abcdefg 100644
--- a/src/api/profile.ts
+++ b/src/api/profile.ts
@@ -1,5 +1,10 @@
+import { db } from './db';
+
 export function getProfile(userId: string) {
-  return null;
+  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
+  return db.query(query);
 }`;

const VALID_REVIEW_RESPONSE = {
  summary: '코드에 SQL injection 취약점이 존재합니다.',
  findings: [
    {
      severity: 'critical',
      file: 'src/api/profile.ts',
      line: 5,
      message: 'SQL injection 가능성 - parameterized query 사용 권장',
      suggestion: 'db.query("SELECT * FROM users WHERE id = ?", [userId]) 형식으로 변경',
    },
    {
      severity: 'warning',
      file: 'src/api/profile.ts',
      line: null,
      message: '에러 핸들링 누락',
      suggestion: 'try-catch 블록 추가 권장',
    },
    {
      severity: 'suggestion',
      file: 'src/api/profile.ts',
      line: 3,
      message: '함수 반환 타입 명시 권장',
      suggestion: 'Promise<User | null> 등 반환 타입 추가',
    },
    {
      severity: 'praise',
      file: 'src/api/profile.ts',
      line: null,
      message: '함수가 단일 책임 원칙을 잘 따르고 있습니다.',
      suggestion: null,
    },
  ],
  overallScore: 4,
};

describe('CodeReviewer', () => {
  it('정상 응답을 CodeReviewResult로 반환한다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe('코드에 SQL injection 취약점이 존재합니다.');
      expect(result.data.overallScore).toBe(4);
      expect(result.data.findings).toHaveLength(4);
    }
  });

  it('findings를 severity별로 포함한다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const severities = result.data.findings.map((f) => f.severity);
      expect(severities).toContain('critical');
      expect(severities).toContain('warning');
      expect(severities).toContain('suggestion');
      expect(severities).toContain('praise');
    }
  });

  it('line이 null인 finding은 undefined로 변환된다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const warningFinding = result.data.findings.find((f) => f.severity === 'warning');
      expect(warningFinding?.line).toBeUndefined();
    }
  });

  it('suggestion이 null인 finding은 undefined로 변환된다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const praiseFinding = result.data.findings.find((f) => f.severity === 'praise');
      expect(praiseFinding?.suggestion).toBeUndefined();
    }
  });

  it('tokensUsed가 메타데이터에 기록된다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.metadata.tokensUsed).toBe(300); // input 100 + output 200
  });

  it('focusAreas를 시스템 프롬프트에 반영한다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    const input: CodeReviewerInput = {
      diff: SAMPLE_DIFF,
      focusAreas: ['security', 'performance'],
    };

    await reviewer.execute(input, ctx);

    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('security'),
      }),
    );
  });

  it('issueAnalysis가 있으면 유저 프롬프트에 포함된다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    const input: CodeReviewerInput = {
      diff: SAMPLE_DIFF,
      issueAnalysis: {
        title: '사용자 프로필 API 구현',
        summary: 'GET /profile 엔드포인트 추가',
        type: 'feature',
      },
    };

    await reviewer.execute(input, ctx);

    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining('사용자 프로필 API 구현'),
      }),
    );
  });

  it('큰 diff는 truncation을 적용하고 warn을 호출한다', async () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);
    const ctx = makeContext();

    // 8000 토큰(~32000자)을 초과하는 diff 생성
    const hugeDiff =
      `diff --git a/src/big.ts b/src/big.ts\nindex 0000000..1111111 100644\n--- a/src/big.ts\n+++ b/src/big.ts\n@@ -1 +1 @@\n` +
      '+' + 'x'.repeat(35000);

    await reviewer.execute({ diff: hugeDiff }, ctx);

    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('생략'));
  });

  it('AI 파싱 실패 시 fail 결과를 반환한다', async () => {
    const badProvider: AIProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'not valid json',
        tokensUsed: { input: 10, output: 10 },
        model: 'mock-model',
      } as AIResponse),
    };

    const reviewer = new CodeReviewer(badProvider);
    const ctx = makeContext();

    const result = await reviewer.execute({ diff: SAMPLE_DIFF }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(['AI_ERROR', 'AI_PARSE_ERROR']).toContain(result.error.code);
    }
  });

  it('name과 description이 올바르게 설정된다', () => {
    const provider = makeProvider(VALID_REVIEW_RESPONSE);
    const reviewer = new CodeReviewer(provider);

    expect(reviewer.name).toBe('CodeReviewer');
    expect(reviewer.description).toContain('리뷰');
  });
});
