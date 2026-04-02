import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentBranch, getStatus, getLastCommit } from '../../git/operations.js';
import { getSessionTokenSummary } from '../utils/token-tracker.js';
import { sessionManager } from '../../session/index.js';
import { buildCostReport } from '../../session/cost-calculator.js';

interface CurrentIssue {
  id?: string;
  title?: string;
}

async function loadCurrentIssue(cwd: string): Promise<CurrentIssue | undefined> {
  try {
    const content = await fs.readFile(path.join(cwd, '.junflow/current-issue.json'), 'utf-8');
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

function formatCost(cost: number): string {
  return `$${cost.toFixed(3)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function renderCostTable(report: ReturnType<typeof buildCostReport>): void {
  const agentCol = 16;
  const tokensCol = 10;
  const costCol = 10;
  const modelCol = 14;

  console.log(chalk.bold('┌─ Session Cost Report ' + '─'.repeat(28) + '┐'));

  const header =
    `│ ${'Agent'.padEnd(agentCol)}` +
    `${'Tokens'.padStart(tokensCol)}` +
    `${'Cost'.padStart(costCol)}` +
    `${'Model'.padStart(modelCol)}`;
  console.log(chalk.bold(header));
  console.log('│' + '─'.repeat(agentCol + tokensCol + costCol + modelCol + 1));

  for (const agent of report.agents) {
    const modelStr = agent.model ?? 'default';
    const row =
      `│ ${agent.agentName.slice(0, agentCol - 1).padEnd(agentCol)}` +
      `${formatNumber(agent.tokens).padStart(tokensCol)}` +
      `${formatCost(agent.cost).padStart(costCol)}` +
      `${modelStr.slice(0, modelCol - 1).padStart(modelCol)}`;
    console.log(row);
  }

  console.log('│' + '─'.repeat(agentCol + tokensCol + costCol + modelCol + 1));

  const totalRow =
    `│ ${'Total'.padEnd(agentCol)}` +
    `${formatNumber(report.total.tokens).padStart(tokensCol)}` +
    `${formatCost(report.total.cost).padStart(costCol)}` +
    `${''.padStart(modelCol)}`;
  console.log(chalk.bold(totalRow));
  console.log(chalk.bold('└' + '─'.repeat(agentCol + tokensCol + costCol + modelCol + 1) + '┘'));
}

function renderCostHistory(sessions: Array<{ id: string; startedAt: string; tokens: number; cost: number }>): void {
  if (sessions.length === 0) {
    console.log(chalk.gray('  히스토리 없음'));
    return;
  }

  console.log(chalk.bold('\n┌─ Cost History (Recent Sessions) ' + '─'.repeat(16) + '┐'));

  const maxCost = Math.max(...sessions.map((s) => s.cost), 0.001);
  const barWidth = 20;

  for (const session of sessions) {
    const date = new Date(session.startedAt);
    const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const barLen = Math.max(1, Math.round((session.cost / maxCost) * barWidth));
    const bar = '█'.repeat(barLen) + '░'.repeat(barWidth - barLen);
    const costStr = formatCost(session.cost);
    const costColor = session.cost > 0.1 ? chalk.yellow : chalk.green;

    console.log(`│ ${chalk.dim(dateStr)} ${costColor(bar)} ${costStr} (${formatNumber(session.tokens)} tok)`);
  }

  console.log(chalk.bold('└' + '─'.repeat(49) + '┘'));
}

export const statusCommand = new Command('status')
  .description('현재 작업 상태 표시')
  .option('--cost', '세션 비용 리포트 (모델별 토큰 단가 기반)')
  .option('--history', '최근 세션 비용 추이 (--cost와 함께 사용)')
  .action(async (options: { cost?: boolean; history?: boolean }) => {
    const cwd = process.cwd();

    // --cost 전용 모드
    if (options.cost) {
      const currentSession = await sessionManager.getCurrent();

      if (currentSession && currentSession.agentCalls.length > 0) {
        const report = buildCostReport(
          currentSession.agentCalls.map((c) => ({
            agentName: c.agentName,
            model: c.model,
            tokensUsed: c.tokensUsed,
          })),
        );
        renderCostTable(report);
      } else {
        console.log(chalk.gray('현재 세션에 AI 사용 기록이 없습니다.'));
      }

      // --history: 최근 세션 비용 추이
      if (options.history) {
        const sessionSummaries = await sessionManager.listSessions(10);
        const historyData: Array<{ id: string; startedAt: string; tokens: number; cost: number }> = [];

        for (const summary of sessionSummaries) {
          const session = await sessionManager.getSession(summary.id);
          if (!session || session.agentCalls.length === 0) continue;

          const report = buildCostReport(
            session.agentCalls.map((c) => ({
              agentName: c.agentName,
              model: c.model,
              tokensUsed: c.tokensUsed,
            })),
          );

          historyData.push({
            id: summary.id,
            startedAt: summary.startedAt,
            tokens: report.total.tokens,
            cost: report.total.cost,
          });
        }

        renderCostHistory(historyData);
      }

      return;
    }

    console.log(chalk.bold('\n┌─ JunFlow Status ' + '─'.repeat(32) + '┐'));

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

      // 워크플로우 상태
      if (currentSession.workflowState) {
        const wf = currentSession.workflowState;
        const phaseColor = wf.phase === 'completed' ? chalk.green : wf.phase === 'failed' ? chalk.red : chalk.yellow;
        console.log('│');
        console.log(chalk.bold('├─ Workflow ' + '─'.repeat(38) + '┤'));
        console.log(`│ ${chalk.bold('Name:')} ${chalk.cyan(wf.workflowName)} (${wf.mode})`);
        console.log(`│ ${chalk.bold('Phase:')} ${phaseColor(wf.phase)}`);
        console.log(`│ ${chalk.bold('Steps:')}`);

        for (const step of wf.steps) {
          let icon: string;
          switch (step.status) {
            case 'completed': icon = chalk.green('✔'); break;
            case 'failed': icon = chalk.red('✖'); break;
            case 'running': icon = chalk.yellow('▶'); break;
            case 'skipped': icon = chalk.gray('⊘'); break;
            default: icon = chalk.gray('○'); break;
          }
          console.log(`│   ${icon} ${step.stepId} ${chalk.dim(`[${step.status}]`)}`);
        }
      }
    }

    // 세션 토큰 사용량
    const summary = await getSessionTokenSummary(cwd);

    if (summary.total.calls === 0) {
      console.log(chalk.bold('├─ Session Token Usage ' + '─'.repeat(27) + '┤'));
      console.log(`│ ${chalk.gray('No AI usage in this session')}`);
    } else {
      console.log(chalk.bold('├─ Session Token Usage ' + '─'.repeat(27) + '┤'));

      const agentCol = 14;
      const callsCol = 7;
      const tokensCol = 10;
      const costCol = 12;

      const header =
        `│ ${'Agent'.padEnd(agentCol)}` +
        `${'Calls'.padStart(callsCol)}` +
        `${'Tokens'.padStart(tokensCol)}` +
        `${'Est. Cost'.padStart(costCol)}`;
      console.log(chalk.bold(header));

      for (const [agentName, data] of Object.entries(summary.byAgent)) {
        const row =
          `│ ${agentName.padEnd(agentCol)}` +
          `${String(data.calls).padStart(callsCol)}` +
          `${formatNumber(data.tokens).padStart(tokensCol)}` +
          `${formatCost(data.estimatedCost).padStart(costCol)}`;
        console.log(row);
      }

      const totalRow =
        `│ ${'Total'.padEnd(agentCol)}` +
        `${String(summary.total.calls).padStart(callsCol)}` +
        `${formatNumber(summary.total.tokens).padStart(tokensCol)}` +
        `${formatCost(summary.total.estimatedCost).padStart(costCol)}`;
      console.log(chalk.bold(totalRow));
    }

    console.log(chalk.bold('└' + '─'.repeat(49) + '┘'));
  });
