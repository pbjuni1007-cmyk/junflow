import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { DeepAgent } from '../../../src/agents/deep-base.js';
import { AgentContext } from '../../../src/agents/types.js';
import { AIProvider, AIRequest, AIResponse } from '../../../src/ai/types.js';

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

const testSchema = z.object({ message: z.string(), score: z.number() });
type TestOutput = z.infer<typeof testSchema>;

function makeProvider(name: string, response: TestOutput): AIProvider {
  return {
    name,
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
      tokensUsed: { input: 100, output: 50 },
      model: `${name}-model`,
    } as AIResponse),
  };
}

class TestDeepAgent extends DeepAgent<{ input: string }, TestOutput> {
  name = 'TestDeepAgent';
  description = 'test';

  protected buildRequest(input: { input: string }): AIRequest {
    return { systemPrompt: 'test system', userPrompt: input.input, maxTokens: 1024 };
  }

  protected getOutputSchema(): z.ZodType<TestOutput> {
    return testSchema;
  }
}

describe('DeepAgent', () => {
  it('단일 프로바이더로 정상 동작한다', async () => {
    const provider = makeProvider('claude', { message: 'hello', score: 9 });
    const agent = new TestDeepAgent(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await agent.execute({ input: 'test' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('hello');
      expect(result.data.score).toBe(9);
      expect(result.metadata.tokensUsed).toBe(150);
    }
  });

  it('프로바이더가 없으면 primaryProvider로 폴백한다', async () => {
    const provider = makeProvider('claude', { message: 'fallback', score: 7 });
    // providers를 빈 배열로 주면 primary로 폴백
    const agent = new TestDeepAgent(provider, { providers: [] });
    const ctx = makeContext();

    const result = await agent.execute({ input: 'test' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('fallback');
    }
  });

  it('멀티 프로바이더: 합의 결과를 반환한다', async () => {
    const claude = makeProvider('claude', { message: 'hello from claude', score: 8 });
    const openai = makeProvider('openai', { message: 'hello from openai', score: 7 });
    // synthesizer가 합성 결과를 반환
    const synthesizer = makeProvider('synth', { message: '', score: 0 });
    synthesizer.complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        synthesized: { message: 'synthesized hello', score: 8 },
        agreementScore: 85,
        reasoning: 'merged',
      }),
      tokensUsed: { input: 200, output: 100 },
      model: 'synth-model',
    } as AIResponse);

    const agent = new TestDeepAgent(claude, {
      providers: [claude, openai],
      synthesizer,
    });
    const ctx = makeContext();

    const result = await agent.execute({ input: 'test' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('synthesized hello');
      expect(result.data.score).toBe(8);
    }
    // claude + openai + synthesizer = 3 calls
    expect(claude.complete).toHaveBeenCalledTimes(1);
    expect(openai.complete).toHaveBeenCalledTimes(1);
    expect(synthesizer.complete).toHaveBeenCalledTimes(1);
  });

  it('AI 에러 시 fail 결과를 반환한다', async () => {
    const provider: AIProvider = {
      name: 'failing',
      complete: vi.fn().mockRejectedValue(new Error('API error')),
    };
    const agent = new TestDeepAgent(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await agent.execute({ input: 'test' }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('API error');
    }
  });

  it('postProcess로 결과를 변환할 수 있다', async () => {
    class TransformAgent extends DeepAgent<{ input: string }, TestOutput> {
      name = 'TransformAgent';
      description = 'test';

      protected buildRequest(): AIRequest {
        return { systemPrompt: 's', userPrompt: 'u' };
      }

      protected getOutputSchema(): z.ZodType<TestOutput> {
        return testSchema;
      }

      protected postProcess(consensus: TestOutput): TestOutput {
        return { ...consensus, message: consensus.message.toUpperCase() };
      }
    }

    const provider = makeProvider('claude', { message: 'hello', score: 5 });
    const agent = new TransformAgent(provider, { providers: [provider] });
    const ctx = makeContext();

    const result = await agent.execute({ input: 'test' }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('HELLO');
    }
  });
});
