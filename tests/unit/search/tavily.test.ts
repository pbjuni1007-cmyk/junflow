import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TavilyProvider } from '../../../src/search/tavily.js';

describe('TavilyProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('검색 결과를 정규화하여 반환한다', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Test Result', url: 'https://example.com', content: 'Test content', score: 0.95 },
        ],
        answer: 'Test answer',
        query: 'test query',
      }),
    });

    const provider = new TavilyProvider('test-api-key');
    const result = await provider.search('test query');

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.title).toBe('Test Result');
    expect(result.results[0]!.score).toBe(0.95);
    expect(result.answer).toBe('Test answer');

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(fetchCall[1].body);
    expect(body.api_key).toBe('test-api-key');
    expect(body.query).toBe('test query');
  });

  it('API 에러 시 에러를 던진다', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const provider = new TavilyProvider('bad-key');
    await expect(provider.search('test')).rejects.toThrow('Tavily API error: 401');
  });

  it('searchDepth와 maxResults 옵션을 전달한다', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], query: 'q' }),
    });

    const provider = new TavilyProvider('key');
    await provider.search('query', { searchDepth: 'advanced', maxResults: 10 });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body);
    expect(body.search_depth).toBe('advanced');
    expect(body.max_results).toBe(10);
  });
});
