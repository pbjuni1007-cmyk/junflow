import { describe, it, expect, vi } from 'vitest';
import { PlanAgent, PlanInput } from '../../../src/agents/plan-agent.js';
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

const VALID_PLAN = {
  summary: 'JWT 기반 인증 시스템 구현 계획',
  approach: 'passport-jwt 미들웨어 + Redis 세션 저장',
  tasks: [
    {
      id: 'T1',
      title: 'JWT 모듈 설치 및 설정',
      description: 'jsonwebtoken, passport-jwt 설치',
      type: 'feature',
      priority: 'high',
      estimatedComplexity: 'simple',
      files: ['package.json', 'src/config/jwt.ts'],
    },
    {
      id: 'T2',
      title: '인증 미들웨어 구현',
      description: 'passport strategy + middleware',
      type: 'feature',
      priority: 'high',
      estimatedComplexity: 'moderate',
      dependsOn: ['T1'],
      files: ['src/middleware/auth.ts'],
    },
    {
      id: 'T3',
      title: '인증 테스트 작성',
      description: 'unit + integration tests',
      type: 'test',
      priority: 'medium',
      estimatedComplexity: 'moderate',
      dependsOn: ['T2'],
    },
  ],
  risks: ['JWT secret 관리 필요', 'Token 만료 정책 결정 필요'],
  estimatedScope: 'medium',
};

function makeProvider(response: object): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
      tokensUsed: { input: 150, output: 250 },
      model: 'mock-model',
    } as AIResponse),
  };
}

describe('PlanAgent', () => {
  it('이슈를 분석하여 구현 계획을 반환한다', async () => {
    const provider = makeProvider(VALID_PLAN);
    const agent = new PlanAgent(provider);
    const ctx = makeContext();

    const result = await agent.execute(
      { title: '인증 시스템 구현', description: 'JWT 기반 인증' },
      ctx,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toContain('JWT');
      expect(result.data.tasks).toHaveLength(3);
      expect(result.data.tasks[0]!.id).toBe('T1');
      expect(result.data.tasks[1]!.dependsOn).toEqual(['T1']);
      expect(result.data.risks).toHaveLength(2);
      expect(result.data.estimatedScope).toBe('medium');
    }
  });

  it('관련 파일 목록을 프롬프트에 포함한다', async () => {
    const provider = makeProvider(VALID_PLAN);
    const agent = new PlanAgent(provider);
    const ctx = makeContext();

    await agent.execute(
      {
        title: 'Refactor auth',
        relatedFiles: ['src/auth.ts', 'src/middleware.ts'],
      },
      ctx,
    );

    const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.userPrompt).toContain('src/auth.ts');
    expect(call.userPrompt).toContain('src/middleware.ts');
  });

  it('diff 컨텍스트를 포함한다', async () => {
    const provider = makeProvider(VALID_PLAN);
    const agent = new PlanAgent(provider);
    const ctx = makeContext();

    await agent.execute(
      { title: 'Fix bug', diff: 'diff --git a/src/app.ts ...' },
      ctx,
    );

    const call = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.userPrompt).toContain('Current Diff Context');
  });

  it('AI 오류 시 실패 결과를 반환한다', async () => {
    const provider: AIProvider = {
      name: 'failing',
      complete: vi.fn().mockRejectedValue(new Error('Timeout')),
    };
    const agent = new PlanAgent(provider);
    const ctx = makeContext();

    const result = await agent.execute({ title: 'test' }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Timeout');
    }
  });

  it('필수 필드만으로 동작한다', async () => {
    const provider = makeProvider(VALID_PLAN);
    const agent = new PlanAgent(provider);
    const ctx = makeContext();

    const result = await agent.execute({ title: 'Simple task' }, ctx);

    expect(result.success).toBe(true);
  });
});
