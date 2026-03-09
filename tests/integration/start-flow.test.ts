import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueAnalyzer } from '../../src/agents/issue-analyzer.js';
import { BranchNamer } from '../../src/agents/branch-namer.js';
import { AgentContext } from '../../src/agents/types.js';
import { AIProvider, AIResponse } from '../../src/ai/types.js';
import { IssueTracker, TrackerIssue } from '../../src/trackers/types.js';
import { JunFlowConfig } from '../../src/config/schema.js';

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

function makeContext(): AgentContext {
  return {
    workingDir: '/tmp/repo',
    config: mockConfig,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
}

const sampleIssue: TrackerIssue = {
  id: 'ISSUE-1',
  title: '사용자 프로필 페이지 구현',
  description: '사용자 프로필 조회/수정 페이지를 구현합니다. 프로필 이미지 업로드와 반응형 레이아웃을 포함합니다.',
  status: 'todo',
  labels: ['feature', 'frontend'],
  priority: 'medium',
  url: 'https://example.com/issues/1',
  raw: {},
};

const analysisResponseJson = JSON.stringify({
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

const branchResponseJson = JSON.stringify({
  branchName: 'feature/ISSUE-1-user-profile-page',
  alternatives: [
    'feature/ISSUE-1-implement-profile',
    'feat/ISSUE-1-profile',
  ],
});

function makeAIResponse(content: string): AIResponse {
  return {
    content,
    tokensUsed: { input: 100, output: 50 },
    model: 'claude-sonnet-4-20250514',
  };
}

describe('Start Flow Integration', () => {
  let analysisCallCount: number;
  let branchCallCount: number;
  let aiProvider: AIProvider;
  let tracker: IssueTracker;

  beforeEach(() => {
    analysisCallCount = 0;
    branchCallCount = 0;

    // 첫 번째 호출은 이슈 분석, 두 번째는 브랜치 네이밍
    aiProvider = {
      name: 'mock',
      complete: vi.fn().mockImplementation(() => {
        analysisCallCount++;
        if (analysisCallCount === 1) {
          return Promise.resolve(makeAIResponse(analysisResponseJson));
        }
        return Promise.resolve(makeAIResponse(branchResponseJson));
      }),
    };

    tracker = {
      name: 'mock',
      getIssue: vi.fn().mockResolvedValue(sampleIssue),
    };
  });

  it('IssueAnalyzer → BranchNamer 순차 호출 후 결과가 연결된다', async () => {
    const ctx = makeContext();

    // Step 1: 이슈 분석
    const issueAnalyzer = new IssueAnalyzer(aiProvider, tracker);
    const analysisResult = await issueAnalyzer.execute(
      { issueId: 'ISSUE-1', trackerType: 'mock' },
      ctx,
    );

    expect(analysisResult.success).toBe(true);
    if (!analysisResult.success) return;

    const analysis = analysisResult.data;
    expect(analysis.title).toBe('사용자 프로필 페이지 구현');
    expect(analysis.type).toBe('feature');

    // Step 2: 브랜치 네이밍 (분석 결과 사용)
    // 두 번째 AI 호출을 위해 provider mock 재설정
    vi.mocked(aiProvider.complete).mockResolvedValueOnce(makeAIResponse(branchResponseJson));

    const branchNamer = new BranchNamer(aiProvider);
    const branchResult = await branchNamer.execute(
      {
        analysis,
        issueId: 'ISSUE-1',
        convention: mockConfig.git.branchConvention,
      },
      ctx,
    );

    expect(branchResult.success).toBe(true);
    if (!branchResult.success) return;

    const { branchName, alternatives } = branchResult.data;
    expect(branchName).toBe('feature/issue-1-user-profile-page');
    expect(alternatives).toHaveLength(2);
  });

  it('분석 결과의 type이 브랜치 네이밍 userPrompt에 전달된다', async () => {
    const ctx = makeContext();

    const issueAnalyzer = new IssueAnalyzer(aiProvider, tracker);
    const analysisResult = await issueAnalyzer.execute(
      { issueId: 'ISSUE-1', trackerType: 'mock' },
      ctx,
    );

    expect(analysisResult.success).toBe(true);
    if (!analysisResult.success) return;

    vi.mocked(aiProvider.complete).mockResolvedValueOnce(makeAIResponse(branchResponseJson));

    const branchNamer = new BranchNamer(aiProvider);
    await branchNamer.execute(
      { analysis: analysisResult.data, issueId: 'ISSUE-1' },
      ctx,
    );

    const allCalls = vi.mocked(aiProvider.complete).mock.calls;
    // 브랜치 네이밍 호출 (두 번째 이후)
    const branchCall = allCalls[allCalls.length - 1];
    expect(branchCall).toBeDefined();
    const branchUserPrompt = branchCall![0].userPrompt;
    expect(branchUserPrompt).toContain('feature');
    expect(branchUserPrompt).toContain('ISSUE-1');
  });

  it('IssueAnalyzer 실패 시 전체 플로우가 중단된다', async () => {
    const failTracker: IssueTracker = {
      name: 'mock',
      getIssue: vi.fn().mockRejectedValue({ code: 'TRACKER_ERROR', message: '이슈 없음' }),
    };

    const ctx = makeContext();
    const issueAnalyzer = new IssueAnalyzer(aiProvider, failTracker);
    const analysisResult = await issueAnalyzer.execute(
      { issueId: 'ISSUE-999', trackerType: 'mock' },
      ctx,
    );

    expect(analysisResult.success).toBe(false);

    // BranchNamer는 호출되지 않아야 함
    // (실제 CLI에서는 early return하므로 테스트에서도 early return)
    const branchNamer = new BranchNamer(aiProvider);
    // AI provider가 분석 단계에서 호출되지 않았으므로 브랜치 단계에서만 호출 확인
    const callCountBeforeBranch = vi.mocked(aiProvider.complete).mock.calls.length;
    expect(callCountBeforeBranch).toBe(0); // 트래커 에러로 AI 호출 없음
  });

  it('BranchNamer 실패 시 분석 결과는 유효하지만 브랜치는 없다', async () => {
    const ctx = makeContext();

    // 분석은 성공
    vi.mocked(aiProvider.complete).mockResolvedValueOnce(makeAIResponse(analysisResponseJson));

    const issueAnalyzer = new IssueAnalyzer(aiProvider, tracker);
    const analysisResult = await issueAnalyzer.execute(
      { issueId: 'ISSUE-1', trackerType: 'mock' },
      ctx,
    );

    expect(analysisResult.success).toBe(true);

    // 브랜치 네이밍은 실패
    vi.mocked(aiProvider.complete).mockResolvedValueOnce(makeAIResponse('invalid json!'));

    const branchNamer = new BranchNamer(aiProvider);
    const branchResult = await branchNamer.execute(
      { analysis: analysisResult.success ? analysisResult.data : sampleIssue as never, issueId: 'ISSUE-1' },
      ctx,
    );

    expect(branchResult.success).toBe(false);
    if (!branchResult.success) {
      expect(['AI_ERROR', 'AI_PARSE_ERROR']).toContain(branchResult.error.code);
    }
  });

  it('두 에이전트 모두 tokensUsed 메타데이터를 반환한다', async () => {
    const ctx = makeContext();

    vi.mocked(aiProvider.complete).mockResolvedValueOnce(makeAIResponse(analysisResponseJson));

    const issueAnalyzer = new IssueAnalyzer(aiProvider, tracker);
    const analysisResult = await issueAnalyzer.execute(
      { issueId: 'ISSUE-1', trackerType: 'mock' },
      ctx,
    );

    vi.mocked(aiProvider.complete).mockResolvedValueOnce(makeAIResponse(branchResponseJson));

    const branchNamer = new BranchNamer(aiProvider);
    const branchResult = await branchNamer.execute(
      { analysis: analysisResult.success ? analysisResult.data : sampleIssue as never, issueId: 'ISSUE-1' },
      ctx,
    );

    expect(analysisResult.metadata.tokensUsed).toBeGreaterThan(0);
    expect(branchResult.metadata.tokensUsed).toBeGreaterThan(0);
  });
});
