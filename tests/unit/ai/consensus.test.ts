import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ConsensusRunner } from '../../../src/ai/consensus.js';
import { AIProvider, AIResponse } from '../../../src/ai/types.js';

const testSchema = z.object({
  message: z.string(),
  score: z.number(),
});

type TestData = z.infer<typeof testSchema>;

function makeProvider(name: string, response: TestData): AIProvider {
  return {
    name,
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify(response),
      tokensUsed: { input: 100, output: 50 },
      model: `${name}-model`,
    } as AIResponse),
  };
}

function makeFailingProvider(name: string): AIProvider {
  return {
    name,
    complete: vi.fn().mockRejectedValue(new Error('Provider failed')),
  };
}

describe('ConsensusRunner', () => {
  it('프로바이더 0개면 에러를 throw한다', async () => {
    const synthesizer = makeProvider('synth', { message: '', score: 0 });
    const runner = new ConsensusRunner(synthesizer);

    await expect(runner.run([], { systemPrompt: '', userPrompt: '' }, testSchema))
      .rejects.toThrow('No providers available');
  });

  it('단일 프로바이더: consensus 없이 바로 반환', async () => {
    const provider = makeProvider('claude', { message: 'feat: add login', score: 9 });
    const runner = new ConsensusRunner(provider);

    const result = await runner.run(
      [provider],
      { systemPrompt: 'test', userPrompt: 'test' },
      testSchema,
    );

    expect(result.consensus).toEqual({ message: 'feat: add login', score: 9 });
    expect(result.agreementScore).toBe(100);
    expect(result.providersUsed).toEqual(['claude']);
    expect(result.totalTokensUsed).toBe(150);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('멀티 프로바이더: 합성 결과 반환', async () => {
    const claude = makeProvider('claude', { message: 'feat: add auth', score: 8 });
    const openai = makeProvider('openai', { message: 'feat: implement auth', score: 7 });

    const synthesisResult = {
      synthesized: { message: 'feat: add authentication', score: 8 },
      agreementScore: 85,
      reasoning: 'Both agree on auth feature',
    };
    const synthesizer: AIProvider = {
      name: 'synth',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify(synthesisResult),
        tokensUsed: { input: 200, output: 100 },
        model: 'synth-model',
      } as AIResponse),
    };

    const runner = new ConsensusRunner(synthesizer);
    const result = await runner.run(
      [claude, openai],
      { systemPrompt: 'test', userPrompt: 'test' },
      testSchema,
    );

    expect(result.consensus).toEqual({ message: 'feat: add authentication', score: 8 });
    expect(result.agreementScore).toBe(85);
    expect(result.providersUsed).toEqual(['claude', 'openai']);
    expect(result.totalTokensUsed).toBe(600); // 150 + 150 + 300
  });

  it('일부 프로바이더 실패 시 성공한 것만 사용', async () => {
    const claude = makeProvider('claude', { message: 'fix: bug', score: 9 });
    const failing = makeFailingProvider('openai');

    // 1개만 성공하면 consensus 불필요, 바로 반환
    const synthesizer = makeProvider('synth', { message: '', score: 0 });
    const runner = new ConsensusRunner(synthesizer);

    const result = await runner.run(
      [claude, failing],
      { systemPrompt: 'test', userPrompt: 'test' },
      testSchema,
    );

    expect(result.consensus).toEqual({ message: 'fix: bug', score: 9 });
    expect(result.providersUsed).toEqual(['claude']);
    expect(result.agreementScore).toBe(100);
  });

  it('모든 프로바이더 실패 시 에러', async () => {
    const fail1 = makeFailingProvider('claude');
    const fail2 = makeFailingProvider('openai');

    const synthesizer = makeProvider('synth', { message: '', score: 0 });
    const runner = new ConsensusRunner(synthesizer);

    await expect(
      runner.run([fail1, fail2], { systemPrompt: '', userPrompt: '' }, testSchema),
    ).rejects.toThrow('All providers failed');
  });
});
