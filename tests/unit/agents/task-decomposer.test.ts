import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskDecomposer, TaskDecompositionResult } from '../../../src/agents/task-decomposer.js';
import { AgentContext } from '../../../src/agents/types.js';
import { AIProvider, AIResponse } from '../../../src/ai/types.js';
import { IssueAnalysis } from '../../../src/agents/issue-analyzer.js';
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
    tokensUsed: { input: 100, output: 80 },
    model: 'claude-sonnet-4-20250514',
  };
}

function makeProvider(responseContent: string): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue(makeAIResponse(responseContent)),
  };
}

const highComplexityAnalysis: IssueAnalysis = {
  title: 'REST API 엔드포인트 구현',
  summary: 'REST API 스키마, DB 마이그레이션, 엔드포인트 구현, 통합 테스트',
  type: 'feature',
  complexity: 'high',
  keyRequirements: ['API 스키마 정의', 'DB 마이그레이션', '엔드포인트 구현', '통합 테스트'],
  suggestedApproach: '스키마와 DB를 먼저, 이후 구현, 마지막에 테스트',
};

const lowComplexityAnalysis: IssueAnalysis = {
  title: '버튼 색상 변경',
  summary: '버튼 색상을 파란색으로 변경',
  type: 'chore',
  complexity: 'low',
  keyRequirements: ['버튼 스타일 수정'],
  suggestedApproach: 'CSS 변수 수정',
};

const validDecompositionResponse = JSON.stringify({
  graphType: 'dag',
  subtasks: [
    {
      id: 't1',
      title: 'API 스키마 정의',
      description: 'OpenAPI 스펙 작성',
      type: 'docs',
      dependsOn: [],
      estimatedComplexity: 'low',
      suggestedFiles: ['docs/api.yaml'],
    },
    {
      id: 't2',
      title: 'DB 마이그레이션',
      description: '마이그레이션 파일 작성',
      type: 'chore',
      dependsOn: [],
      estimatedComplexity: 'medium',
      suggestedFiles: ['migrations/001_add_table.sql'],
    },
    {
      id: 't3',
      title: 'API 엔드포인트 구현',
      description: '라우터 및 핸들러 구현',
      type: 'feature',
      dependsOn: ['t1', 't2'],
      estimatedComplexity: 'high',
      suggestedFiles: ['src/routes/api.ts'],
    },
    {
      id: 't4',
      title: '통합 테스트 작성',
      description: 'API 통합 테스트',
      type: 'test',
      dependsOn: ['t3'],
      estimatedComplexity: 'medium',
      suggestedFiles: ['tests/integration/api.test.ts'],
    },
  ],
  totalEstimate: '3-4시간',
});

const cyclicDecompositionResponse = JSON.stringify({
  graphType: 'dag',
  subtasks: [
    { id: 't1', title: 'A', description: 'A', type: 'feature', dependsOn: ['t2'], estimatedComplexity: 'low' },
    { id: 't2', title: 'B', description: 'B', type: 'feature', dependsOn: ['t1'], estimatedComplexity: 'low' },
  ],
  totalEstimate: '1시간',
});

const simpleDecompositionResponse = JSON.stringify({
  graphType: 'independent',
  subtasks: [
    {
      id: 't1',
      title: '버튼 스타일 수정',
      description: 'CSS 변수 변경',
      type: 'chore',
      dependsOn: [],
      estimatedComplexity: 'low',
    },
  ],
  totalEstimate: '30분',
});

describe('TaskDecomposer', () => {
  let provider: AIProvider;
  let agent: TaskDecomposer;

  beforeEach(() => {
    provider = makeProvider(validDecompositionResponse);
    agent = new TaskDecomposer(provider);
  });

  it('정상: AI 응답 파싱 → TaskDecompositionResult 반환', async () => {
    const ctx = makeContext();
    const result = await agent.execute({ analysis: highComplexityAnalysis, issueId: 'ISSUE-1' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as TaskDecompositionResult;
      expect(data.graphType).toBe('dag');
      expect(data.subtasks).toHaveLength(4);
      expect(data.totalEstimate).toBe('3-4시간');
    }
  });

  it('executionLevels 자동 계산: [[t1,t2], [t3], [t4]]', async () => {
    const ctx = makeContext();
    const result = await agent.execute({ analysis: highComplexityAnalysis, issueId: 'ISSUE-1' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as TaskDecompositionResult;
      expect(data.executionLevels).toHaveLength(3);
      expect(data.executionLevels[0]).toContain('t1');
      expect(data.executionLevels[0]).toContain('t2');
      expect(data.executionLevels[1]).toEqual(['t3']);
      expect(data.executionLevels[2]).toEqual(['t4']);
    }
  });

  it('순환 참조 감지 → VALIDATION_ERROR로 실패', async () => {
    const cyclicProvider = makeProvider(cyclicDecompositionResponse);
    const cyclicAgent = new TaskDecomposer(cyclicProvider);
    const ctx = makeContext();

    const result = await cyclicAgent.execute({ analysis: highComplexityAnalysis, issueId: 'ISSUE-1' }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message.toLowerCase()).toContain('cycle');
    }
  });

  it('complexity low 이슈도 분해 결과 반환 (단일 subtask)', async () => {
    const simpleProvider = makeProvider(simpleDecompositionResponse);
    const simpleAgent = new TaskDecomposer(simpleProvider);
    const ctx = makeContext();

    const result = await simpleAgent.execute({ analysis: lowComplexityAnalysis, issueId: 'ISSUE-2' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as TaskDecompositionResult;
      expect(data.graphType).toBe('independent');
      expect(data.subtasks).toHaveLength(1);
      expect(data.executionLevels).toHaveLength(1);
      expect(data.executionLevels[0]).toEqual(['t1']);
    }
  });

  it('AI 파싱 실패 시 AI_PARSE_ERROR로 실패', async () => {
    const badProvider = makeProvider('not valid json at all!!!');
    const badAgent = new TaskDecomposer(badProvider);
    const ctx = makeContext();

    const result = await badAgent.execute({ analysis: highComplexityAnalysis, issueId: 'ISSUE-1' }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(['AI_ERROR', 'AI_PARSE_ERROR']).toContain(result.error.code);
    }
  });

  it('tokensUsed가 메타데이터에 포함된다', async () => {
    const ctx = makeContext();
    const result = await agent.execute({ analysis: highComplexityAnalysis, issueId: 'ISSUE-1' }, ctx);

    expect(result.metadata.tokensUsed).toBe(180); // 100 + 80
  });

  it('issueId와 analysis 정보가 AI userPrompt에 포함된다', async () => {
    const ctx = makeContext();
    await agent.execute({ analysis: highComplexityAnalysis, issueId: 'ISSUE-1' }, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    expect(completeCalls.length).toBeGreaterThan(0);
    const userPrompt = completeCalls[0]![0].userPrompt;
    expect(userPrompt).toContain('ISSUE-1');
    expect(userPrompt).toContain('REST API 엔드포인트 구현');
  });
});
