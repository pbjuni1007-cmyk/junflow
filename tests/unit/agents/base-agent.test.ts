import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../../../src/agents/base-agent.js';
import { AgentContext, AgentResult } from '../../../src/agents/types.js';
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

class SuccessAgent extends BaseAgent<string, string> {
  name = 'SuccessAgent';
  description = 'Always succeeds';

  protected async run(input: string): Promise<{ data: string; tokensUsed?: number }> {
    return { data: `processed: ${input}`, tokensUsed: 42 };
  }
}

class FailingAgent extends BaseAgent<string, string> {
  name = 'FailingAgent';
  description = 'Always throws';

  protected async run(): Promise<{ data: string }> {
    throw new Error('run failed');
  }
}

class SlowAgent extends BaseAgent<void, string> {
  name = 'SlowAgent';
  description = 'Takes time';

  protected async run(): Promise<{ data: string }> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { data: 'done' };
  }
}

describe('BaseAgent', () => {
  it('정상 실행 시 succeed 결과를 반환한다', async () => {
    const agent = new SuccessAgent();
    const ctx = makeContext();
    const result = await agent.execute('hello', ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('processed: hello');
      expect(result.metadata.agentName).toBe('SuccessAgent');
      expect(result.metadata.tokensUsed).toBe(42);
    }
  });

  it('durationMs가 메타데이터에 기록된다', async () => {
    const agent = new SlowAgent();
    const ctx = makeContext();
    const result = await agent.execute(undefined, ctx);

    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(50);
  });

  it('run()이 에러를 throw하면 fail 결과를 반환한다', async () => {
    const agent = new FailingAgent();
    const ctx = makeContext();
    const result = await agent.execute('input', ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AI_ERROR');
      expect(result.error.message).toContain('run failed');
    }
  });

  it('실패 시에도 durationMs가 기록된다', async () => {
    const agent = new FailingAgent();
    const ctx = makeContext();
    const result = await agent.execute('x', ctx);

    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('시작 시 logger.info를 호출한다', async () => {
    const agent = new SuccessAgent();
    const ctx = makeContext();
    await agent.execute('test', ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[SuccessAgent] Starting'));
  });

  it('완료 시 logger.info를 호출한다', async () => {
    const agent = new SuccessAgent();
    const ctx = makeContext();
    await agent.execute('test', ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[SuccessAgent] Completed'));
  });

  it('실패 시 logger.error를 호출한다', async () => {
    const agent = new FailingAgent();
    const ctx = makeContext();
    await agent.execute('test', ctx);

    expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('[FailingAgent] Failed'));
  });
});
