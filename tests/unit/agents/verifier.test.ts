import { describe, it, expect, vi } from 'vitest';
import { Verifier, verifyLoop, VerificationResult } from '../../../src/agents/verifier.js';
import { AIProvider, AIResponse } from '../../../src/ai/types.js';
import { AgentContext, AgentResult, succeed, fail } from '../../../src/agents/types.js';

function makeProvider(response: VerificationResult): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
      tokensUsed: { input: 50, output: 30 },
      model: 'mock-model',
    } as AIResponse),
  };
}

const mockContext: AgentContext = {
  workingDir: '/tmp',
  config: {
    ai: { apiKey: 'test', model: 'test', maxTokens: 1024 },
    git: { commitConvention: 'conventional', commitLanguage: 'en', autoStage: false },
    tracker: { type: 'none' },
    output: { verbose: false, color: true, language: 'en' },
  } as AgentContext['config'],
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
};

describe('Verifier', () => {
  it('승인된 결과를 올바르게 반환한다', async () => {
    const verification: VerificationResult = {
      approved: true,
      score: 9,
      issues: [],
      suggestions: [],
      reasoning: 'Looks good',
    };

    const provider = makeProvider(verification);
    const verifier = new Verifier(provider);

    const result = await verifier.execute(
      { originalTask: 'test task', result: { message: 'feat: add login' } },
      mockContext,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approved).toBe(true);
      expect(result.data.score).toBe(9);
    }
  });

  it('거부된 결과도 올바르게 반환한다', async () => {
    const verification: VerificationResult = {
      approved: false,
      score: 3,
      issues: ['Too vague', 'Missing scope'],
      suggestions: ['Add scope', 'Be more specific'],
      reasoning: 'Needs improvement',
    };

    const provider = makeProvider(verification);
    const verifier = new Verifier(provider);

    const result = await verifier.execute(
      { originalTask: 'test task', result: 'bad commit msg' },
      mockContext,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approved).toBe(false);
      expect(result.data.score).toBe(3);
      expect(result.data.issues).toHaveLength(2);
    }
  });
});

describe('verifyLoop', () => {
  it('첫 시도에서 승인되면 1회 시도 반환', async () => {
    const goodVerification: VerificationResult = {
      approved: true,
      score: 8,
      issues: [],
      suggestions: [],
      reasoning: 'Good',
    };

    const verifierProvider = makeProvider(goodVerification);
    const verifier = new Verifier(verifierProvider);

    const mockAgent = {
      execute: vi.fn().mockResolvedValue(
        succeed('TestAgent', { message: 'feat: login', alternatives: [] }, 100, 50),
      ),
    };

    const result = await verifyLoop(
      mockAgent,
      verifier,
      { diff: 'test diff' },
      mockContext,
      { taskDescription: 'Generate commit message' },
    );

    expect(result.attempts).toBe(1);
    expect(result.verification.approved).toBe(true);
    expect(mockAgent.execute).toHaveBeenCalledTimes(1);
  });

  it('검증 실패 시 재시도 후 성공', async () => {
    const rejectedVerification: VerificationResult = {
      approved: false,
      score: 4,
      issues: ['Too vague'],
      suggestions: ['Be specific'],
      reasoning: 'Needs work',
    };
    const approvedVerification: VerificationResult = {
      approved: true,
      score: 8,
      issues: [],
      suggestions: [],
      reasoning: 'Good now',
    };

    let verifyCallCount = 0;
    const verifierProvider: AIProvider = {
      name: 'mock',
      complete: vi.fn().mockImplementation(async () => {
        verifyCallCount++;
        const v = verifyCallCount <= 1 ? rejectedVerification : approvedVerification;
        return {
          content: JSON.stringify(v),
          tokensUsed: { input: 50, output: 30 },
          model: 'mock',
        };
      }),
    };
    const verifier = new Verifier(verifierProvider);

    const mockAgent = {
      execute: vi.fn().mockResolvedValue(
        succeed('TestAgent', { message: 'feat: login', alternatives: [] }, 100, 50),
      ),
    };

    const onRetry = vi.fn();

    const result = await verifyLoop(
      mockAgent,
      verifier,
      { diff: 'test diff' },
      mockContext,
      {
        taskDescription: 'Generate commit message',
        maxRetries: 2,
        onRetry,
      },
    );

    expect(result.attempts).toBe(2);
    expect(result.verification.approved).toBe(true);
    expect(mockAgent.execute).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('에이전트 실행 실패 시 즉시 반환', async () => {
    const verifierProvider = makeProvider({
      approved: true, score: 10, issues: [], suggestions: [], reasoning: '',
    });
    const verifier = new Verifier(verifierProvider);

    const mockAgent = {
      execute: vi.fn().mockResolvedValue(
        fail('TestAgent', { code: 'AI_ERROR', message: 'API error' }, 100),
      ),
    };

    const result = await verifyLoop(
      mockAgent,
      verifier,
      { diff: 'test' },
      mockContext,
      { taskDescription: 'test' },
    );

    expect(result.verification.approved).toBe(false);
    expect(result.verification.score).toBe(0);
    expect(result.attempts).toBe(1);
    expect(mockAgent.execute).toHaveBeenCalledTimes(1);
  });

  it('maxRetries 소진 시 마지막 결과 반환', async () => {
    const rejectedVerification: VerificationResult = {
      approved: false,
      score: 3,
      issues: ['Still bad'],
      suggestions: [],
      reasoning: 'Nope',
    };

    const verifierProvider = makeProvider(rejectedVerification);
    const verifier = new Verifier(verifierProvider);

    const mockAgent = {
      execute: vi.fn().mockResolvedValue(
        succeed('TestAgent', { message: 'bad msg', alternatives: [] }, 100, 50),
      ),
    };

    const result = await verifyLoop(
      mockAgent,
      verifier,
      { diff: 'test' },
      mockContext,
      { taskDescription: 'test', maxRetries: 1 },
    );

    expect(result.verification.approved).toBe(false);
    expect(result.attempts).toBe(2); // initial + 1 retry
    expect(mockAgent.execute).toHaveBeenCalledTimes(2);
  });
});
