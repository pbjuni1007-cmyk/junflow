import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export interface IssueContext {
  title: string;
  summary: string;
  type: string;
}

export async function loadCurrentIssue(cwd: string): Promise<IssueContext | undefined> {
  try {
    const issuePath = path.join(cwd, '.junflow', 'current-issue.json');
    const content = await fs.readFile(issuePath, 'utf-8');
    return JSON.parse(content) as IssueContext;
  } catch {
    return undefined;
  }
}

export function renderSuggestions(candidates: string[]): string {
  const lines = candidates.map((msg, i) => `  ${chalk.bold(i + 1)}. ${msg}`);
  lines.push('');
  lines.push(chalk.dim('  [1-3] 선택 / [e] 직접 수정 / [q] 취소'));
  return lines.join('\n');
}
