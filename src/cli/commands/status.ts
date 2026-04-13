import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentBranch, getStatus, getLastCommit } from '../../git/operations.js';
import { sessionManager } from '../../session/index.js';

interface CurrentIssue {
  id?: string;
  title?: string;
}

async function loadCurrentIssue(cwd: string): Promise<CurrentIssue | undefined> {
  try {
    const content = await fs.readFile(path.join(cwd, '.git-pilot/current-issue.json'), 'utf-8');
    return JSON.parse(content) as CurrentIssue;
  } catch {
    return undefined;
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return `${diffSeconds}초 전`;
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${diffDays}일 전`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export const statusCommand = new Command('status')
  .description('현재 작업 상태 표시')
  .action(async () => {
    const cwd = process.cwd();

    console.log(chalk.bold('\n┌─ Git Pilot Status ' + '─'.repeat(32) + '┐'));

    // 브랜치 정보
    try {
      const branch = await getCurrentBranch(cwd);
      console.log(`│ ${chalk.bold('Branch:')} ${chalk.cyan(branch)}`);
    } catch {
      console.log(`│ ${chalk.bold('Branch:')} ${chalk.gray('(git 저장소가 아님)')}`);
    }

    // 활성 이슈
    const issue = await loadCurrentIssue(cwd);
    if (issue) {
      const issueStr = [issue.id, issue.title].filter(Boolean).join(' - ');
      console.log(`│ ${chalk.bold('Issue:')} ${issueStr}`);
    } else {
      console.log(`│ ${chalk.bold('Issue:')} ${chalk.gray('(없음)')}`);
    }

    console.log('│');

    // git status
    try {
      const status = await getStatus(cwd);
      console.log(`│ ${chalk.bold('Changes:')}`);
      console.log(`│   ${chalk.green('Staged:')} ${status.staged.length} file${status.staged.length !== 1 ? 's' : ''}`);
      console.log(`│   ${chalk.yellow('Modified:')} ${status.modified.length} file${status.modified.length !== 1 ? 's' : ''}`);
      console.log(`│   ${chalk.gray('Untracked:')} ${status.untracked.length} file${status.untracked.length !== 1 ? 's' : ''}`);
    } catch {
      console.log(`│ ${chalk.gray('Changes: (조회 실패)')}`);
    }

    console.log('│');

    // 마지막 커밋
    try {
      const lastCommit = await getLastCommit(cwd);
      const shortHash = lastCommit.hash.slice(0, 7);
      const relativeTime = formatRelativeTime(lastCommit.date);
      console.log(`│ ${chalk.bold('Last Commit:')} ${chalk.yellow(shortHash)}`);
      console.log(`│   ${lastCommit.message}`);
      console.log(`│   ${chalk.gray(relativeTime)}`);
    } catch {
      console.log(`│ ${chalk.bold('Last Commit:')} ${chalk.gray('(없음)')}`);
    }

    // 세션 정보
    const currentSession = await sessionManager.getCurrent();
    if (currentSession) {
      console.log('│');
      console.log(chalk.bold('├─ Current Session ' + '─'.repeat(31) + '┤'));
      console.log(`│ ${chalk.bold('Session ID:')} ${currentSession.id.slice(0, 8)}`);
      console.log(`│ ${chalk.bold('Started:')} ${formatRelativeTime(currentSession.startedAt)}`);
      console.log(`│ ${chalk.bold('Agent Calls:')} ${currentSession.agentCalls.length}`);
      console.log(`│ ${chalk.bold('Tokens:')} ${formatNumber(currentSession.tokenUsage.total)}`);
    }

    console.log(chalk.bold('└' + '─'.repeat(49) + '┘'));
  });
