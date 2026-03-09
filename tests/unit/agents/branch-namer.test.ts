import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BranchNamer, BranchNamerInput, sanitizeBranchName } from '../../../src/agents/branch-namer.js';
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
    tokensUsed: { input: 80, output: 40 },
    model: 'claude-sonnet-4-20250514',
  };
}

function makeProvider(responseContent: string): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue(makeAIResponse(responseContent)),
  };
}

const sampleAnalysis: IssueAnalysis = {
  title: '사용자 프로필 페이지 구현',
  summary: '사용자 프로필 조회/수정 페이지 구현',
  type: 'feature',
  complexity: 'medium',
  keyRequirements: ['프로필 조회 API 연동', '프로필 이미지 업로드', '반응형 레이아웃'],
  suggestedApproach: '컴포넌트 분리 후 API 훅부터 구현 권장',
};

const validBranchResponse = JSON.stringify({
  branchName: 'feature/ISSUE-1-user-profile-page',
  alternatives: [
    'feature/ISSUE-1-implement-profile',
    'feat/ISSUE-1-profile',
  ],
});

describe('BranchNamer', () => {
  let provider: AIProvider;
  let agent: BranchNamer;

  beforeEach(() => {
    provider = makeProvider(validBranchResponse);
    agent = new BranchNamer(provider);
  });

  it('정상: IssueAnalysis → BranchNameResult 반환', async () => {
    const input: BranchNamerInput = { analysis: sampleAnalysis, issueId: 'ISSUE-1' };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branchName).toBe('feature/issue-1-user-profile-page');
      expect(result.data.alternatives).toHaveLength(2);
    }
  });

  it('tokensUsed가 메타데이터에 포함된다', async () => {
    const input: BranchNamerInput = { analysis: sampleAnalysis, issueId: 'ISSUE-1' };
    const ctx = makeContext();

    const result = await agent.execute(input, ctx);

    expect(result.metadata.tokensUsed).toBe(120); // 80 + 40
  });

  it('convention 옵션이 userPrompt에 반영된다', async () => {
    const input: BranchNamerInput = {
      analysis: sampleAnalysis,
      issueId: 'ISSUE-1',
      convention: '{type}/{issueId}/{description}',
    };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    const userPrompt = completeCalls[0]![0].userPrompt;
    expect(userPrompt).toContain('{type}/{issueId}/{description}');
  });

  it('config.git.branchConvention을 기본값으로 사용한다', async () => {
    const input: BranchNamerInput = { analysis: sampleAnalysis, issueId: 'ISSUE-1' };
    const ctx = makeContext();

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    const userPrompt = completeCalls[0]![0].userPrompt;
    expect(userPrompt).toContain('{type}/{issueId}-{description}');
  });

  it('AI 응답 파싱 실패 시 fail 결과를 반환한다', async () => {
    const badProvider = makeProvider('not valid json');
    const badAgent = new BranchNamer(badProvider);
    const input: BranchNamerInput = { analysis: sampleAnalysis, issueId: 'ISSUE-1' };
    const ctx = makeContext();

    const result = await badAgent.execute(input, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(['AI_ERROR', 'AI_PARSE_ERROR']).toContain(result.error.code);
    }
  });

  it('agentModels.branchNamer 모델을 우선 사용한다', async () => {
    const input: BranchNamerInput = { analysis: sampleAnalysis, issueId: 'ISSUE-1' };
    const ctx = makeContext({
      config: {
        ...mockConfig,
        ai: {
          ...mockConfig.ai,
          agentModels: { branchNamer: 'claude-haiku-4-20250514' },
        },
      },
    });

    await agent.execute(input, ctx);

    const completeCalls = vi.mocked(provider.complete).mock.calls;
    expect(completeCalls[0]![0].model).toBe('claude-haiku-4-20250514');
  });

  it('branchName과 alternatives 모두 sanitize된다', async () => {
    const dirtyResponse = JSON.stringify({
      branchName: 'Feature/ISSUE 1: User Profile!!',
      alternatives: ['feat/ISSUE-1 profile@page', 'FEAT/issue_1-profile'],
    });
    const dirtyProvider = makeProvider(dirtyResponse);
    const dirtyAgent = new BranchNamer(dirtyProvider);
    const input: BranchNamerInput = { analysis: sampleAnalysis, issueId: 'ISSUE-1' };
    const ctx = makeContext();

    const result = await dirtyAgent.execute(input, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branchName).toMatch(/^[a-z0-9\-/_]+$/);
      for (const alt of result.data.alternatives) {
        expect(alt).toMatch(/^[a-z0-9\-/_]+$/);
      }
    }
  });
});

describe('sanitizeBranchName', () => {
  it('대문자를 소문자로 변환한다', () => {
    expect(sanitizeBranchName('Feature/ISSUE-1')).toBe('feature/issue-1');
  });

  it('공백을 하이픈으로 변환한다', () => {
    expect(sanitizeBranchName('feature/user profile page')).toBe('feature/user-profile-page');
  });

  it('특수문자를 하이픈으로 변환한다', () => {
    expect(sanitizeBranchName('feature/ISSUE-1: user@profile!')).toBe('feature/issue-1-user-profile');
  });

  it('연속 하이픈을 단일 하이픈으로 줄인다', () => {
    expect(sanitizeBranchName('feature/issue--1---profile')).toBe('feature/issue-1-profile');
  });

  it('연속 슬래시를 단일 슬래시로 줄인다', () => {
    expect(sanitizeBranchName('feature//issue/1')).toBe('feature/issue/1');
  });

  it('앞뒤 하이픈/슬래시를 제거한다', () => {
    expect(sanitizeBranchName('-/feature/profile/-')).toBe('feature/profile');
  });

  it('60자를 초과하면 잘라낸다', () => {
    const long = 'feature/' + 'a'.repeat(100);
    expect(sanitizeBranchName(long).length).toBeLessThanOrEqual(60);
  });

  it('허용 문자(영문, 숫자, -, /, _)는 유지된다', () => {
    expect(sanitizeBranchName('feature/issue_1-profile')).toBe('feature/issue_1-profile');
  });

  it('빈 문자열을 처리한다', () => {
    expect(sanitizeBranchName('')).toBe('');
  });

  it('한글을 하이픈으로 변환한다', () => {
    const result = sanitizeBranchName('feature/사용자-프로필');
    expect(result).toMatch(/^[a-z0-9\-/_]*$/);
  });
});
