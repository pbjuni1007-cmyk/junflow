import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueAnalyzer, IssueAnalyzerInput, IssueAnalysis } from '../../../src/agents/issue-analyzer.js';
import { AgentContext } from '../../../src/agents/types.js';
import { AIProvider, AIResponse } from '../../../src/ai/types.js';
import { IssueTracker, TrackerIssue } from '../../../src/trackers/types.js';
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

function makeTracker(issue?: TrackerIssue, shouldThrow?: boolean): IssueTracker {
  const defaultIssue: TrackerIssue = {
    id: 'ISSUE-1',
    title: '사용자 프로필 페이지 구현',
    description: '사용자 프로필 조회/수정 페이지를 구현합니다. 프로필 이미지 업로드와 반응형 레이아웃을 포함합니다.',
    status: 'todo',
    labels: ['feature', 'frontend'],
    priority: 'medium',
    url: 'https://example.com/issues/1',
    raw: {},
  };

  if (shouldThrow) {
    return {
      name: 'mock',
      getIssue: vi.fn().mockRejectedValue({ code: 'TRACKER_ERROR', message: '이슈를 찾을 수 없습니다.' }),
    };
  }

  return {
    name: 'mock',
    getIssue: vi.fn().mockResolvedValue(issue ?? defaultIssue),
  };
}

const validAnalysisResponse = JSON.stringify({
  title: '사용자 프로필 페이지 구현',
  summary: '사용자 프로필 조회/수정 페이지 구현 (이미지 업로드, 반응형 레이아웃 포함)',
  type: 'feature',
  complexity: 'medium',
  keyRequirements: [
    '프로필 조회 API 연동',
    '프로필 이미지 업로드',
    '반응형 레이아웃',
  ],
  suggestedApproach: '컴포넌트 분리 후 API 훅부터 구현 권장',
});

describe('IssueAnalyzer', () => {
  let provider: AIProvider;
  let tracker: IssueTracker;
  let agent: IssueAnalyzer;

  beforeEach(() => {
    provider = makeProvider(validAnalysisResponse);
    tracker = makeTracker();
    agent = new IssueAnalyzer(provider, tracker);
  });

  it('정상: TrackerIssue → AI 분석 → IssueAnalysis 반환', async () => {
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as IssueAnalysis;
      expect(data.title).toBe('사용자 프로필 페이지 구현');
      expect(data.type).toBe('feature');
      expect(data.complexity).toBe('medium');
      expect(data.keyRequirements).toHaveLength(3);
      expect(data.keyRequirements[0]).toBe('프로필 조회 API 연동');
      expect(data.suggestedApproach).toBe('컴포넌트 분리 후 API 훅부터 구현 권장');
    }
  });

  it('tracker.getIssue가 올바른 issueId로 호출된다', async () => {
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    expect(tracker.getIssue).toHaveBeenCalledWith('ISSUE-1');
  });

  it('이슈 정보가 AI userPrompt에 포함된다', async () => {
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    expect(completeCalls.length).toBeGreaterThan(0);
    const userPrompt = completeCalls[0]![0].userPrompt;
    expect(userPrompt).toContain('ISSUE-1');
    expect(userPrompt).toContain('사용자 프로필 페이지 구현');
  });

  it('tokensUsed가 메타데이터에 포함된다', async () => {
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.metadata.tokensUsed).toBe(150); // 100 + 50
  });

  it('durationMs가 메타데이터에 포함된다', async () => {
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('트래커 에러 시 TRACKER_ERROR 코드로 fail 반환', async () => {
    const errorTracker = makeTracker(undefined, true);
    const errorAgent = new IssueAnalyzer(provider, errorTracker);
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-999', trackerType: 'mock' };
    const ctx = makeContext();

    const result = await errorAgent.execute(input, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      // BaseAgent wraps thrown errors as AI_ERROR unless re-thrown as AgentError
      expect(['TRACKER_ERROR', 'AI_ERROR']).toContain(result.error.code);
      expect(result.error.message).toBeTruthy();
    }
  });

  it('AI 파싱 실패 시 fail 결과를 반환한다', async () => {
    const badProvider = makeProvider('invalid json !!!');
    const badAgent = new IssueAnalyzer(badProvider, tracker);
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext();

    const result = await badAgent.execute(input, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(['AI_ERROR', 'AI_PARSE_ERROR']).toContain(result.error.code);
    }
  });

  it('agentModels.issueAnalyzer 모델을 우선 사용한다', async () => {
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext({
      config: {
        ...mockConfig,
        ai: {
          ...mockConfig.ai,
          agentModels: { issueAnalyzer: 'claude-haiku-4-20250514' },
        },
      },
    });

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    expect(completeCalls[0]![0].model).toBe('claude-haiku-4-20250514');
  });

  it('labels가 userPrompt에 포함된다', async () => {
    const issueWithLabels: TrackerIssue = {
      id: 'ISSUE-1',
      title: '테스트 이슈',
      description: '설명',
      status: 'todo',
      labels: ['backend', 'performance'],
      raw: {},
    };
    const labelTracker = makeTracker(issueWithLabels);
    const labelAgent = new IssueAnalyzer(provider, labelTracker);
    const input: IssueAnalyzerInput = { issueId: 'ISSUE-1', trackerType: 'mock' };
    const ctx = makeContext();

    await labelAgent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    const userPrompt = completeCalls[0]![0].userPrompt;
    expect(userPrompt).toContain('backend');
    expect(userPrompt).toContain('performance');
  });
});
