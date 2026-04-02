import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAutopilot } from '../../../src/modes/autopilot.js';
import { ExecutionMode } from '../../../src/modes/types.js';
import type { AIProvider } from '../../../src/ai/types.js';
import type { AgentContext } from '../../../src/agents/types.js';

// Mock all agents that createAgentFactory imports
vi.mock('../../../src/agents/issue-analyzer.js', () => ({
  IssueAnalyzer: vi.fn().mockImplementation(function () {
    return {
      name: 'IssueAnalyzer',
      description: '',
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { title: 'Test', summary: 'test', type: 'feature' },
        metadata: { agentName: 'IssueAnalyzer', durationMs: 10, tokensUsed: 100 },
      }),
    };
  }),
}));

vi.mock('../../../src/agents/branch-namer.js', () => ({
  BranchNamer: vi.fn().mockImplementation(function () {
    return {
      name: 'BranchNamer',
      description: '',
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { branchName: 'feature/test', alternatives: [] },
        metadata: { agentName: 'BranchNamer', durationMs: 10, tokensUsed: 50 },
      }),
    };
  }),
}));

vi.mock('../../../src/agents/commit-writer.js', () => ({
  CommitWriter: vi.fn().mockImplementation(function () {
    return {
      name: 'CommitWriter',
      description: '',
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { message: 'feat: test', alternatives: [] },
        metadata: { agentName: 'CommitWriter', durationMs: 10, tokensUsed: 50 },
      }),
    };
  }),
}));

vi.mock('../../../src/agents/code-reviewer.js', () => ({
  CodeReviewer: vi.fn().mockImplementation(function () {
    return {
      name: 'CodeReviewer',
      description: '',
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { summary: 'ok', findings: [], overallScore: 8 },
        metadata: { agentName: 'CodeReviewer', durationMs: 10, tokensUsed: 50 },
      }),
    };
  }),
  codeReviewResultSchema: {},
}));

vi.mock('../../../src/agents/verifier.js', () => ({
  Verifier: vi.fn().mockImplementation(function () {
    return {
      name: 'Verifier',
      description: '',
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { approved: true, score: 9, issues: [] },
        metadata: { agentName: 'Verifier', durationMs: 10, tokensUsed: 50 },
      }),
    };
  }),
}));

vi.mock('../../../src/trackers/mock.js', () => ({
  MockTracker: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

const mockProvider: AIProvider = {
  name: 'mock',
  chat: vi.fn().mockResolvedValue({ content: '{}', tokensUsed: 0 }),
} as unknown as AIProvider;

function makeContext(): AgentContext {
  return {
    workingDir: '/tmp',
    config: {} as AgentContext['config'],
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

describe('runAutopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('autopilot 모드로 전체 워크플로우를 실행하고 결과를 반환한다', async () => {
    const result = await runAutopilot(mockProvider, makeContext());

    expect(result.workflowResult).toBeDefined();
    expect(result.workflowResult.workflow).toBe('autopilot');
    expect(result.workflowResult.success).toBe(true);
    expect(result.workflowResult.steps).toHaveLength(5);
    expect(result.state.mode).toBe(ExecutionMode.AUTOPILOT);
    expect(result.state.phase).toBe('completed');
  });

  it('issueId 옵션이 state.results에 저장된다', async () => {
    const result = await runAutopilot(mockProvider, makeContext(), { issueId: 'TEST-123' });

    expect(result.state.results['issueId']).toBe('TEST-123');
  });

  it('state에 워크플로우 요약 정보가 포함된다', async () => {
    const result = await runAutopilot(mockProvider, makeContext());

    const wfResult = result.state.results['workflow'] as Record<string, unknown>;
    expect(wfResult).toBeDefined();
    expect(wfResult['name']).toBe('autopilot');
    expect(wfResult['success']).toBe(true);
    expect(wfResult['stepsCompleted']).toBe(5);
    expect(wfResult['stepsTotal']).toBe(5);
  });

  it('startedAt이 ISO 날짜 형식이다', async () => {
    const result = await runAutopilot(mockProvider, makeContext());

    expect(result.state.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
