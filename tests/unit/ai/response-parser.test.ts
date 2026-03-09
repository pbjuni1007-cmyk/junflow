import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { parseAIResponse } from '../../../src/ai/response-parser.js';
import { AIProvider, AIRequest, AIResponse } from '../../../src/ai/types.js';

const testSchema = z.object({
  name: z.string(),
  value: z.number(),
});

type TestData = z.infer<typeof testSchema>;

function makeProvider(response: string): AIProvider {
  return {
    name: 'mock',
    complete: vi.fn().mockResolvedValue({
      content: response,
      tokensUsed: { input: 10, output: 20 },
      model: 'mock-model',
    } as AIResponse),
  };
}

const baseRequest: AIRequest = {
  systemPrompt: 'system',
  userPrompt: 'user',
};

describe('parseAIResponse()', () => {
  it('유효한 JSON + zod 스키마 통과', async () => {
    const json = JSON.stringify({ name: 'test', value: 42 });
    const result = await parseAIResponse(json, testSchema);
    expect(result).toEqual({ name: 'test', value: 42 });
  });

  it('잘못된 JSON → 코드블록 추출 시도', async () => {
    const text = 'some text\n```json\n{"name":"foo","value":1}\n```\nmore text';
    const result = await parseAIResponse(text, testSchema);
    expect(result).toEqual({ name: 'foo', value: 1 });
  });

  it('```json ... ``` 코드블록 내 JSON 파싱 성공', async () => {
    const text = '```json\n{"name":"bar","value":99}\n```';
    const result = await parseAIResponse(text, testSchema);
    expect(result).toEqual({ name: 'bar', value: 99 });
  });

  it('``` (언어 없는) 코드블록 내 JSON 파싱 성공', async () => {
    const text = '```\n{"name":"baz","value":7}\n```';
    const result = await parseAIResponse(text, testSchema);
    expect(result).toEqual({ name: 'baz', value: 7 });
  });

  it('zod 검증 실패 시 AI_PARSE_ERROR를 throw한다', async () => {
    const json = JSON.stringify({ name: 123, value: 'wrong' });
    await expect(parseAIResponse(json, testSchema)).rejects.toMatchObject({
      code: 'AI_PARSE_ERROR',
    });
  });

  it('완전히 잘못된 텍스트는 AI_PARSE_ERROR를 throw한다', async () => {
    await expect(parseAIResponse('not json at all!!!', testSchema)).rejects.toMatchObject({
      code: 'AI_PARSE_ERROR',
    });
  });

  it('재시도 성공 케이스 (mock AIProvider)', async () => {
    const validJson = JSON.stringify({ name: 'retry', value: 5 });
    const provider = makeProvider(validJson);

    await expect(
      parseAIResponse('bad json', testSchema, {
        maxRetries: 1,
        aiProvider: provider,
        originalRequest: baseRequest,
      }),
    ).resolves.toEqual({ name: 'retry', value: 5 });

    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('재시도 실패 시 AI_PARSE_ERROR를 throw한다', async () => {
    const provider = makeProvider('still bad json');

    await expect(
      parseAIResponse('bad json', testSchema, {
        maxRetries: 1,
        aiProvider: provider,
        originalRequest: baseRequest,
      }),
    ).rejects.toMatchObject({ code: 'AI_PARSE_ERROR' });
  });

  it('aiProvider 없으면 재시도 없이 바로 실패한다', async () => {
    await expect(
      parseAIResponse('invalid', testSchema, { maxRetries: 3 }),
    ).rejects.toMatchObject({ code: 'AI_PARSE_ERROR' });
  });
});
