import { describe, it, expect } from 'vitest';
import { formatJson } from '../../../../src/cli/formatters/json.js';
import type { JsonReviewOutput, JsonCommitOutput, JsonDocReviewOutput } from '../../../../src/cli/formatters/json.js';

describe('formatJson()', () => {
  it('review 결과를 JSON으로 포맷한다', () => {
    const output: JsonReviewOutput = {
      type: 'review',
      success: true,
      data: {
        summary: 'Clean code with minor issues',
        findings: [
          { severity: 'warning', file: 'src/app.ts', line: 10, message: 'Unused variable', suggestion: 'Remove it' },
          { severity: 'praise', file: 'src/utils.ts', line: null, message: 'Good abstraction', suggestion: null },
        ],
        overallScore: 8,
      },
      metadata: { mode: 'default' },
    };

    const result = formatJson(output);
    const parsed = JSON.parse(result);

    expect(parsed.type).toBe('review');
    expect(parsed.success).toBe(true);
    expect(parsed.data.overallScore).toBe(8);
    expect(parsed.data.findings).toHaveLength(2);
    expect(parsed.metadata.mode).toBe('default');
  });

  it('commit 결과를 JSON으로 포맷한다', () => {
    const output: JsonCommitOutput = {
      type: 'commit',
      success: true,
      data: {
        message: 'feat: add CI mode',
        alternatives: ['feat: introduce CI support', 'feat: add --ci flag'],
        hash: 'abc1234',
      },
      metadata: { mode: 'default' },
    };

    const result = formatJson(output);
    const parsed = JSON.parse(result);

    expect(parsed.type).toBe('commit');
    expect(parsed.data.message).toBe('feat: add CI mode');
    expect(parsed.data.hash).toBe('abc1234');
    expect(parsed.data.alternatives).toHaveLength(2);
  });

  it('review-doc 결과를 JSON으로 포맷한다', () => {
    const output: JsonDocReviewOutput = {
      type: 'review-doc',
      success: true,
      data: {
        summary: 'Well-structured document',
        overallScore: 7,
        findings: [{ severity: 'suggestion', section: 'Architecture', message: 'Add diagram' }],
        missingTopics: ['Error handling'],
        keyQuestions: ['What about rate limiting?'],
      },
      metadata: { mode: 'consensus' },
    };

    const result = formatJson(output);
    const parsed = JSON.parse(result);

    expect(parsed.type).toBe('review-doc');
    expect(parsed.data.overallScore).toBe(7);
    expect(parsed.data.missingTopics).toEqual(['Error handling']);
  });

  it('출력이 유효한 JSON 문자열이다', () => {
    const output: JsonReviewOutput = {
      type: 'review',
      success: true,
      data: { summary: 'test', findings: [], overallScore: 10 },
      metadata: { mode: 'default' },
    };

    const result = formatJson(output);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('pretty-print (2-space indent)', () => {
    const output: JsonReviewOutput = {
      type: 'review',
      success: true,
      data: { summary: 'test', findings: [], overallScore: 10 },
      metadata: { mode: 'default' },
    };

    const result = formatJson(output);
    expect(result).toContain('\n  ');
  });
});
