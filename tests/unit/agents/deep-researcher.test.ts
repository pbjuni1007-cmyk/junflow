import { describe, it, expect, vi } from 'vitest';
import { DeepResearcher } from '../../../src/agents/deep-researcher.js';

function makeContext(overrides = {}) {
  return {
    workingDir: '/tmp',
    config: {
      ai: { provider: 'claude' as const, model: 'test-model', maxTokens: 2048 },
      tracker: { type: 'mock' as const },
      git: { branchConvention: '{type}/{issueId}-{desc}', commitConvention: 'conventional' as const, commitLanguage: 'ko' as const },
      output: { color: true, verbose: false },
      ...overrides,
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

describe('DeepResearcher', () => {
  it('검색 없이 AI 자체 지식으로 주장을 검증한다', async () => {
    const mockAI = {
      name: 'mock',
      complete: vi.fn()
        // 1st call: claim extraction
        .mockResolvedValueOnce({
          content: JSON.stringify({
            claims: ['TypeScript is better than JavaScript for large projects'],
            searchQueries: ['typescript vs javascript large projects'],
          }),
          tokensUsed: { input: 200, output: 100 },
          model: 'test-model',
        })
        // 2nd call: claim validation
        .mockResolvedValueOnce({
          content: JSON.stringify({
            summary: 'Claims are generally well-supported.',
            claims: [
              {
                claim: 'TypeScript is better than JavaScript for large projects',
                verdict: 'supported',
                confidence: 85,
                evidence: ['Type safety reduces bugs by 15%'],
                counterpoints: ['Learning curve is steeper'],
                sources: [],
                recommendation: 'Proceed with TypeScript',
              },
            ],
            similarProducts: [
              { name: 'Deno', url: 'https://deno.land', relevance: 'TypeScript-first runtime', lesson: 'TypeScript adoption is growing' },
            ],
            overallRiskLevel: 'low',
            recommendations: ['Add TypeScript strict mode'],
          }),
          tokensUsed: { input: 400, output: 300 },
          model: 'test-model',
        }),
    };

    const researcher = new DeepResearcher(mockAI, null); // no search provider
    const result = await researcher.execute(
      { content: '# Plan\nUse TypeScript for the project.', filePath: 'plan.md' },
      makeContext() as any,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.searchUsed).toBe(false);
    expect(result.data.claims).toHaveLength(1);
    expect(result.data.claims[0]!.verdict).toBe('supported');
    expect(result.data.claims[0]!.confidence).toBe(85);
    expect(result.data.similarProducts).toHaveLength(1);
    expect(result.data.overallRiskLevel).toBe('low');
    expect(result.metadata.tokensUsed).toBe(1000); // 200+100+400+300
  });

  it('검색 프로바이더가 있으면 웹 검색을 실행한다', async () => {
    const mockAI = {
      name: 'mock',
      complete: vi.fn()
        .mockResolvedValueOnce({
          content: JSON.stringify({
            claims: ['React is the most popular frontend framework'],
            searchQueries: ['react popularity 2025'],
          }),
          tokensUsed: { input: 100, output: 50 },
          model: 'test-model',
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            summary: 'Supported by search results.',
            claims: [
              {
                claim: 'React is the most popular frontend framework',
                verdict: 'supported',
                confidence: 90,
                evidence: ['Stack Overflow survey 2025'],
                counterpoints: [],
                sources: ['https://survey.stackoverflow.co/2025'],
                recommendation: 'Solid choice',
              },
            ],
            similarProducts: [],
            overallRiskLevel: 'low',
            recommendations: [],
          }),
          tokensUsed: { input: 300, output: 200 },
          model: 'test-model',
        }),
    };

    const mockSearch = {
      name: 'tavily',
      search: vi.fn().mockResolvedValue({
        results: [{ title: 'React leads', url: 'https://example.com', content: 'React remains #1', score: 0.9 }],
        answer: 'React is still the most popular framework.',
        query: 'react popularity 2025',
      }),
    };

    const researcher = new DeepResearcher(mockAI, mockSearch);
    const result = await researcher.execute(
      { content: 'Use React for frontend.', filePath: 'plan.md' },
      makeContext() as any,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.searchUsed).toBe(true);
    expect(mockSearch.search).toHaveBeenCalledTimes(1);

    // search results should be included in the AI prompt
    const validateCall = mockAI.complete.mock.calls[1]![0];
    expect(validateCall.userPrompt).toContain('React remains #1');
  });
});
