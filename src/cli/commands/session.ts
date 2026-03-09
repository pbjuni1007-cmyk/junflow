import { Command } from 'commander';
import chalk from 'chalk';
import { sessionManager } from '../../session/index.js';
import { logger } from '../utils/logger.js';

function formatDuration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffMs = end - start;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours > 0) return `${diffHours}h ${diffMinutes % 60}m`;
  if (diffMinutes > 0) return `${diffMinutes}m ${diffSeconds % 60}s`;
  return `${diffSeconds}s`;
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

function statusColor(status: string): string {
  switch (status) {
    case 'active': return chalk.green(status);
    case 'completed': return chalk.blue(status);
    case 'interrupted': return chalk.yellow(status);
    default: return status;
  }
}

export const sessionCommand = new Command('session')
  .description('세션 관리');

sessionCommand
  .command('list')
  .description('최근 세션 목록')
  .option('-n, --limit <number>', '표시할 세션 수', '10')
  .action(async (options: { limit: string }) => {
    const limit = parseInt(options.limit, 10);
    const sessions = await sessionManager.listSessions(limit);

    if (sessions.length === 0) {
      logger.info('세션 기록이 없습니다.');
      return;
    }

    const idCol = 10;
    const statusCol = 12;
    const branchCol = 22;
    const issueCol = 22;
    const callsCol = 7;
    const tokensCol = 9;
    const timeCol = 12;

    const header =
      chalk.bold('ID'.padEnd(idCol)) +
      chalk.bold('Status'.padEnd(statusCol)) +
      chalk.bold('Branch'.padEnd(branchCol)) +
      chalk.bold('Issue'.padEnd(issueCol)) +
      chalk.bold('Calls'.padStart(callsCol)) +
      chalk.bold('Tokens'.padStart(tokensCol)) +
      chalk.bold('  Started');
    console.log(header);
    console.log('─'.repeat(idCol + statusCol + branchCol + issueCol + callsCol + tokensCol + timeCol));

    for (const s of sessions) {
      const shortId = s.id.slice(0, 8);
      const branch = (s.branch ?? '-').slice(0, branchCol - 1);
      const issue = (s.issueTitle ?? '-').slice(0, issueCol - 1);
      const row =
        shortId.padEnd(idCol) +
        statusColor(s.status).padEnd(statusCol) +
        branch.padEnd(branchCol) +
        issue.padEnd(issueCol) +
        String(s.totalAgentCalls).padStart(callsCol) +
        String(s.totalTokens).padStart(tokensCol) +
        '  ' + formatRelativeTime(s.startedAt);
      console.log(row);
    }
  });

sessionCommand
  .command('show [session-id]')
  .description('세션 상세 정보 (session-id 없으면 현재 세션)')
  .action(async (sessionId?: string) => {
    let session;

    if (sessionId) {
      session = await sessionManager.getSession(sessionId);
      if (!session) {
        // 짧은 ID로 검색
        const all = await sessionManager.listSessions(100);
        const match = all.find((s) => s.id.startsWith(sessionId));
        if (match) {
          session = await sessionManager.getSession(match.id);
        }
      }
    } else {
      session = await sessionManager.getCurrent();
    }

    if (!session) {
      logger.warn(sessionId ? `세션 '${sessionId}'을 찾을 수 없습니다.` : '현재 활성 세션이 없습니다.');
      return;
    }

    console.log(chalk.bold('\n┌─ Session Details ' + '─'.repeat(31) + '┐'));
    console.log(`│ ${chalk.bold('ID:')} ${session.id}`);
    console.log(`│ ${chalk.bold('Status:')} ${statusColor(session.status)}`);
    console.log(`│ ${chalk.bold('Started:')} ${session.startedAt} (${formatRelativeTime(session.startedAt)})`);
    if (session.endedAt) {
      console.log(`│ ${chalk.bold('Ended:')} ${session.endedAt}`);
    }
    console.log(`│ ${chalk.bold('Duration:')} ${formatDuration(session.startedAt, session.endedAt)}`);
    if (session.branch) {
      console.log(`│ ${chalk.bold('Branch:')} ${chalk.cyan(session.branch)}`);
    }

    if (session.issue) {
      console.log('│');
      console.log(`│ ${chalk.bold('Issue:')}`);
      console.log(`│   ID: ${session.issue.id}`);
      console.log(`│   Title: ${session.issue.title}`);
      console.log(`│   Type: ${session.issue.type}`);
      console.log(`│   Branch: ${session.issue.branch}`);
    }

    console.log('│');
    console.log(`│ ${chalk.bold('Token Usage:')}`);
    console.log(`│   Total: ${session.tokenUsage.total.toLocaleString('en-US')}`);
    for (const [agent, data] of Object.entries(session.tokenUsage.byAgent)) {
      console.log(`│   ${agent}: ${data.calls} calls, ${data.tokens.toLocaleString('en-US')} tokens`);
    }

    if (session.agentCalls.length > 0) {
      console.log('│');
      console.log(`│ ${chalk.bold('Agent Calls:')} (${session.agentCalls.length})`);
      for (const call of session.agentCalls) {
        const status = call.success ? chalk.green('OK') : chalk.red('ERR');
        const tokens = call.tokensUsed ? ` ${call.tokensUsed}tok` : '';
        console.log(`│   [${status}] ${call.agentName} (${call.command}) ${call.durationMs}ms${tokens}`);
        if (call.error) {
          console.log(`│       ${chalk.red(call.error)}`);
        }
      }
    }

    console.log(chalk.bold('└' + '─'.repeat(49) + '┘'));
  });

sessionCommand
  .command('end')
  .description('현재 세션 종료')
  .action(async () => {
    const current = await sessionManager.getCurrent();
    if (!current) {
      logger.warn('현재 활성 세션이 없습니다.');
      return;
    }

    await sessionManager.end('completed');
    logger.success(`세션 ${current.id.slice(0, 8)} 종료됨`);
  });

sessionCommand
  .command('resume')
  .description('마지막 세션의 이슈로 작업 재개')
  .action(async () => {
    const lastIssue = await sessionManager.getLastIssue();
    if (!lastIssue) {
      logger.warn('재개할 이슈 정보가 없습니다. 먼저 junflow start <issue-id>를 실행하세요.');
      return;
    }

    const cwd = process.cwd();
    const newSession = await sessionManager.start(cwd);
    await sessionManager.attachIssue(lastIssue);

    console.log(chalk.bold('\n세션 재개'));
    console.log(`  세션 ID: ${newSession.id.slice(0, 8)}`);
    console.log(`  이슈: ${chalk.cyan(lastIssue.id)} - ${lastIssue.title}`);
    console.log(`  브랜치: ${chalk.cyan(lastIssue.branch)}`);
    logger.success('이전 이슈 컨텍스트로 새 세션을 시작했습니다.');
  });
