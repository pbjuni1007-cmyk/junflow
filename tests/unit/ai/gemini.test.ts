import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock retry to bypass delays
vi.mock('../../../src/ai/retry.js', () => ({
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    constructor(_apiKey: string) {}
    getGenerativeModel(opts: unknown) {
      return mockGetGenerativeModel(opts);
    }
  },
}));

import { GeminiProvider } from '../../../src/ai/gemini.js';

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent });
  });

  it('complete() 성공 - tokensUsed 매핑 확인', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'Hello from Gemini',
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 25,
        },
      },
    });

    const provider = new GeminiProvider('test-key');
    const result = await provider.complete({
      systemPrompt: 'You are helpful',
      userPrompt: 'Say hello',
    });

    expect(result.content).toBe('Hello from Gemini');
    expect(result.tokensUsed.input).toBe(15);
    expect(result.tokensUsed.output).toBe(25);
    expect(result.model).toBe('gemini-2.0-flash');
  });

  it('request.model이 지정되면 해당 모델 사용', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'ok',
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
      },
    });

    const provider = new GeminiProvider('test-key');
    const result = await provider.complete({
      systemPrompt: 'sys',
      userPrompt: 'user',
      model: 'gemini-1.5-pro',
    });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-1.5-pro' }),
    );
    expect(result.model).toBe('gemini-1.5-pro');
  });

  it('content가 빈 문자열이면 AI_ERROR throw', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '',
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0 },
      },
    });

    const provider = new GeminiProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('네트워크 에러 → NETWORK_ERROR로 변환', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

    const provider = new GeminiProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('API 키 에러 → AUTH_ERROR로 변환', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API key not valid'));

    const provider = new GeminiProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'AUTH_ERROR' });
  });

  it('일반 API 에러 → AI_ERROR로 변환', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Internal server error'));

    const provider = new GeminiProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'AI_ERROR' });
  });

  it('Rate limit 에러 → RATE_LIMIT_ERROR로 변환', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('429 quota exceeded'));

    const provider = new GeminiProvider('test-key');
    await expect(
      provider.complete({ systemPrompt: 'sys', userPrompt: 'user' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT_ERROR' });
  });

  it('usageMetadata가 없으면 tokensUsed는 0', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'ok',
        usageMetadata: undefined,
      },
    });

    const provider = new GeminiProvider('test-key');
    const result = await provider.complete({ systemPrompt: 'sys', userPrompt: 'user' });
    expect(result.tokensUsed).toEqual({ input: 0, output: 0 });
  });
});
