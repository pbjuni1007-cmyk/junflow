import { describe, it, expect, vi } from 'vitest';
import type { AIProvider } from '../../../src/ai/types.js';

// Mock all agent modules that agent-factory.ts require()s at call time.
// Paths are resolved from the source file location (src/teams/agent-factory.ts).
vi.mock('../../../src/agents/issue-analyzer.js', () => ({
  IssueAnalyzer: class IssueAnalyzer {
    name = 'IssueAnalyzer';
    execute = vi.fn();
  },
}));

vi.mock('../../../src/agents/branch-namer.js', () => ({
  BranchNamer: class BranchNamer {
    name = 'BranchNamer';
    execute = vi.fn();
  },
}));

vi.mock('../../../src/agents/commit-writer.js', () => ({
  CommitWriter: class CommitWriter {
    name = 'CommitWriter';
    execute = vi.fn();
  },
}));

vi.mock('../../../src/agents/code-reviewer.js', () => ({
  CodeReviewer: class CodeReviewer {
    name = 'CodeReviewer';
    execute = vi.fn();
  },
}));

vi.mock('../../../src/agents/verifier.js', () => ({
  Verifier: class Verifier {
    name = 'Verifier';
    execute = vi.fn();
  },
}));

vi.mock('../../../src/trackers/mock.js', () => ({
  MockTracker: class MockTracker {},
}));

import { createAgentFactory } from '../../../src/teams/agent-factory.js';

const mockProvider = {
  name: 'mock',
  chat: vi.fn().mockResolvedValue({ content: '{}', tokensUsed: 0 }),
} as unknown as AIProvider;

describe('createAgentFactory', () => {
  it('createAgentFactory가 함수를 반환한다', () => {
    const factory = createAgentFactory(mockProvider);
    expect(typeof factory).toBe('function');
  });

  describe('알려진 에이전트 이름으로 호출하면 에이전트 인스턴스를 반환한다', () => {
    const factory = createAgentFactory(mockProvider);

    it.each([
      'IssueAnalyzer',
      'BranchNamer',
      'CommitWriter',
      'CodeReviewer',
      'Verifier',
    ])('%s → 에이전트 인스턴스를 반환한다', (agentName) => {
      const agent = factory(agentName);
      expect(agent).not.toBeNull();
    });
  });

  it('알 수 없는 에이전트 이름으로 호출하면 null을 반환한다', () => {
    const factory = createAgentFactory(mockProvider);
    expect(factory('UnknownAgent')).toBeNull();
    expect(factory('')).toBeNull();
    expect(factory('nonexistent')).toBeNull();
  });

  describe('CLI 워커 지원', () => {
    it('CliWorker:codex:prompt 형태에서 CliWorkerConfig를 반환한다', () => {
      const factory = createAgentFactory(mockProvider);
      const result = factory('CliWorker:codex:review this code') as any;
      expect(result).not.toBeNull();
      expect(result.type).toBe('cli-worker');
      expect(result.cli).toBe('codex');
      expect(result.prompt).toBe('review this code');
    });

    it('CliWorker:gemini:prompt 형태도 동작한다', () => {
      const factory = createAgentFactory(mockProvider);
      const result = factory('CliWorker:gemini:analyze') as any;
      expect(result).not.toBeNull();
      expect(result.type).toBe('cli-worker');
      expect(result.cli).toBe('gemini');
    });

    it('CliWorker:invalid 형태는 null을 반환한다', () => {
      const factory = createAgentFactory(mockProvider);
      expect(factory('CliWorker:unknown:prompt')).toBeNull();
    });

    it('CliWorker: 접두사 없으면 일반 에이전트 매칭 시도', () => {
      const factory = createAgentFactory(mockProvider);
      expect(factory('NotCliWorker')).toBeNull();
    });
  });

  describe('반환된 에이전트는 name과 execute 메서드를 갖는다', () => {
    const factory = createAgentFactory(mockProvider);

    it.each([
      'IssueAnalyzer',
      'BranchNamer',
      'CommitWriter',
      'CodeReviewer',
      'Verifier',
    ])('%s 에이전트가 name과 execute를 갖는다', (agentName) => {
      const agent = factory(agentName);
      expect(agent).not.toBeNull();
      expect(typeof agent!.name).toBe('string');
      expect(typeof agent!.execute).toBe('function');
    });
  });
});
