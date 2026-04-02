import type { CodeReviewResult } from '../../agents/code-reviewer.js';

export interface JsonReviewOutput {
  type: 'review';
  success: boolean;
  data: CodeReviewResult;
  metadata: {
    durationMs?: number;
    tokensUsed?: number;
    mode: string;
  };
}

export interface JsonCommitOutput {
  type: 'commit';
  success: boolean;
  data: {
    message: string;
    alternatives: string[];
    hash?: string;
  };
  metadata: {
    durationMs?: number;
    tokensUsed?: number;
    mode: string;
  };
}

export interface JsonDocReviewOutput {
  type: 'review-doc';
  success: boolean;
  data: {
    summary: string;
    overallScore: number;
    findings: unknown[];
    missingTopics: string[];
    keyQuestions: string[];
  };
  metadata: {
    durationMs?: number;
    tokensUsed?: number;
    mode: string;
  };
}

export type JsonOutput = JsonReviewOutput | JsonCommitOutput | JsonDocReviewOutput;

export function formatJson(output: JsonOutput): string {
  return JSON.stringify(output, null, 2);
}

export function printJson(output: JsonOutput): void {
  process.stdout.write(formatJson(output) + '\n');
}
