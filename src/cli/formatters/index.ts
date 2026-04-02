export { formatJson, printJson } from './json.js';
export type { JsonOutput, JsonReviewOutput, JsonCommitOutput, JsonDocReviewOutput } from './json.js';
export { formatReviewAsGitHubPR, formatDocReviewAsGitHubPR } from './markdown.js';
export { formatReviewAsGitLabMR, formatDocReviewAsGitLabMR } from './gitlab.js';

import type { CodeReviewResult } from '../../agents/code-reviewer.js';
import type { CommentFormat } from '../options/ci-mode.js';
import { formatReviewAsGitHubPR } from './markdown.js';
import { formatReviewAsGitLabMR } from './gitlab.js';

export function formatReviewComment(result: CodeReviewResult, format: CommentFormat): string {
  switch (format) {
    case 'github-pr': return formatReviewAsGitHubPR(result);
    case 'gitlab-mr': return formatReviewAsGitLabMR(result);
    case 'plain': return plainReviewSummary(result);
  }
}

function plainReviewSummary(result: CodeReviewResult): string {
  const lines: string[] = [];
  lines.push(`Code Review — Score: ${result.overallScore}/10`);
  lines.push(result.summary);
  for (const f of result.findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    lines.push(`  [${f.severity.toUpperCase()}] ${loc}: ${f.message}`);
  }
  return lines.join('\n');
}
