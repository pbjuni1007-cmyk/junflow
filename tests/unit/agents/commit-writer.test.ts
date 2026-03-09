import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommitWriter, CommitWriterInput } from '../../../src/agents/commit-writer.js';
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
    workingDir: '/tmp/repo',
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

function makeAIResponse(content: string): AIResponse {
  return {
    content,
    tokensUsed: { input: 100, output: 50 },
    model: 'claude-sonnet-4-20250514',
  };
}

function makeProvider(responseContent: string): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue(makeAIResponse(responseContent)),
  };
}

const validResponse = JSON.stringify({
  message: 'feat(profile): 사용자 프로필 조회 API 연동',
  alternatives: [
    'feat: 프로필 페이지 컴포넌트 및 API 구현',
    'feat(user): add profile page with API hook',
  ],
  scope: 'profile',
  breakingChange: false,
});

const sampleDiff = `diff --git a/src/profile.ts b/src/profile.ts
index 0000000..1234567 100644
--- /dev/null
+++ b/src/profile.ts
@@ -0,0 +1,10 @@
+export async function getProfile(id: string) {
+  const res = await fetch(\`/api/users/\${id}\`);
+  return res.json();
+}
`;

describe('CommitWriter', () => {
  let provider: AIProvider;
  let agent: CommitWriter;

  beforeEach(() => {
    provider = makeProvider(validResponse);
    agent = new CommitWriter(provider);
  });

  it('정상 응답 시 CommitMessageResult를 반환한다', async () => {
    const input: CommitWriterInput = { diff: sampleDiff };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('feat(profile): 사용자 프로필 조회 API 연동');
      expect(result.data.alternatives).toHaveLength(2);
      expect(result.data.alternatives[0]).toBe('feat: 프로필 페이지 컴포넌트 및 API 구현');
      expect(result.data.breakingChange).toBe(false);
      expect(result.data.scope).toBe('profile');
    }
  });

  it('tokensUsed가 메타데이터에 포함된다', async () => {
    const input: CommitWriterInput = { diff: sampleDiff };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.metadata.tokensUsed).toBe(150); // 100 + 50
  });

  it('이슈 컨텍스트가 포함되면 userPrompt에 반영된다', async () => {
    const input: CommitWriterInput = {
      diff: sampleDiff,
      issueAnalysis: {
        title: '프로필 페이지 구현',
        summary: '사용자 프로필을 조회하는 API 연동',
        type: 'feature',
      },
    };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.success).toBe(true);
    const completeCalls = vi.mocked(provider.complete).mock.calls;
    expect(completeCalls.length).toBeGreaterThan(0);
    const userPrompt = completeCalls[0]![0].userPrompt;
    expect(userPrompt).toContain('프로필 페이지 구현');
    expect(userPrompt).toContain('feature');
  });

  it('이슈 컨텍스트 없으면 Issue Context 섹션이 없다', async () => {
    const input: CommitWriterInput = { diff: sampleDiff };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    const userPrompt = completeCalls[0]![0].userPrompt;
    expect(userPrompt).not.toContain('Issue Context');
  });

  it('convention 옵션이 systemPrompt에 반영된다', async () => {
    const input: CommitWriterInput = { diff: sampleDiff, convention: 'gitmoji' };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    const systemPrompt = completeCalls[0]![0].systemPrompt;
    expect(systemPrompt).toContain('gitmoji');
  });

  it('language 옵션이 systemPrompt에 반영된다', async () => {
    const input: CommitWriterInput = { diff: sampleDiff, language: 'en' };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    const systemPrompt = completeCalls[0]![0].systemPrompt;
    expect(systemPrompt).toContain('English');
  });

  it('큰 diff는 truncation 경고를 출력한다', async () => {
    // 토큰 제한(8000 tokens ≈ 32000 chars)을 초과하는 diff 생성
    const bigDiff =
      `diff --git a/big.ts b/big.ts\nindex 0000000..1234567 100644\n--- /dev/null\n+++ b/big.ts\n` +
      Array.from({ length: 40000 }, (_, i) => `+line ${i}`).join('\n');

    const input: CommitWriterInput = { diff: bigDiff };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('토큰 제한을 초과'),
    );
  });

  it('AI 응답 파싱 실패 시 fail 결과를 반환한다', async () => {
    const badProvider = makeProvider('invalid json response !!!');
    const badAgent = new CommitWriter(badProvider);
    const input: CommitWriterInput = { diff: sampleDiff };
    const ctx = makeContext();

    const result = await badAgent.execute(input, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AI_ERROR');
    }
  });

  it('scope가 null이면 undefined로 변환된다', async () => {
    const responseWithNullScope = JSON.stringify({
      message: 'chore: 의존성 업데이트',
      alternatives: ['chore: update deps', 'chore(deps): bump packages'],
      scope: null,
      breakingChange: false,
    });
    const nullScopeProvider = makeProvider(responseWithNullScope);
    const nullScopeAgent = new CommitWriter(nullScopeProvider);

    const result = await nullScopeAgent.execute({ diff: sampleDiff }, makeContext());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBeUndefined();
    }
  });

  it('config의 commitConvention/commitLanguage를 기본값으로 사용한다', async () => {
    const input: CommitWriterInput = { diff: sampleDiff };
    const ctx = makeContext({
      config: {
        ...mockConfig,
        git: { ...mockConfig.git, commitConvention: 'gitmoji', commitLanguage: 'en' },
      },
    });

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    const systemPrompt = completeCalls[0]![0].systemPrompt;
    expect(systemPrompt).toContain('gitmoji');
    expect(systemPrompt).toContain('English');
  });

  it('agentModels.commitWriter 모델을 우선 사용한다', async () => {
    const input: CommitWriterInput = { diff: sampleDiff };
    const ctx = makeContext({
      config: {
        ...mockConfig,
        ai: {
          ...mockConfig.ai,
          agentModels: { commitWriter: 'claude-haiku-4-20250514' },
        },
      },
    });

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    expect(completeCalls[0]![0].model).toBe('claude-haiku-4-20250514');
  });
});
