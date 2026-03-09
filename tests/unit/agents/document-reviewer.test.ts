import { describe, it, expect, vi } from 'vitest';
import { DocumentReviewer } from '../../../src/agents/document-reviewer.js';

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

describe('DocumentReviewer', () => {
  it('문서를 분석하여 findings, missingTopics, keyQuestions을 반환한다', async () => {
    const mockAI = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          summary: 'Well-structured but missing error handling section.',
          overallScore: 7,
          findings: [
            { severity: 'warning', section: 'Architecture', message: 'No error handling strategy', suggestion: 'Add error boundary section' },
            { severity: 'praise', section: 'Overview', message: 'Clear project scope', suggestion: null },
          ],
          missingTopics: ['Error handling', 'Testing strategy'],
          keyQuestions: ['How will you handle API rate limits?'],
        }),
        tokensUsed: { input: 500, output: 200 },
        model: 'test-model',
      }),
    };

    const reviewer = new DocumentReviewer(mockAI);
    const result = await reviewer.execute(
      { content: '# My Plan\nBuild a REST API...', filePath: 'plan.md' },
      makeContext() as any,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.overallScore).toBe(7);
    expect(result.data.findings).toHaveLength(2);
    expect(result.data.findings[0]!.severity).toBe('warning');
    expect(result.data.findings[1]!.severity).toBe('praise');
    expect(result.data.missingTopics).toContain('Error handling');
    expect(result.data.keyQuestions).toHaveLength(1);
    expect(result.metadata.tokensUsed).toBe(700);
  });

  it('focusAreas를 프롬프트에 포함한다', async () => {
    const mockAI = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          summary: 'ok',
          overallScore: 8,
          findings: [],
          missingTopics: [],
          keyQuestions: [],
        }),
        tokensUsed: { input: 100, output: 50 },
        model: 'test-model',
      }),
    };

    const reviewer = new DocumentReviewer(mockAI);
    await reviewer.execute(
      { content: 'test', filePath: 'test.md', focusAreas: ['feasibility', 'market'] },
      makeContext() as any,
    );

    const callArgs = mockAI.complete.mock.calls[0]![0];
    expect(callArgs.userPrompt).toContain('feasibility');
    expect(callArgs.userPrompt).toContain('market');
  });
});
