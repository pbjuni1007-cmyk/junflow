import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { createAIProvider } from '../../ai/provider-factory.js';
import { WorkflowRunner } from '../../teams/runner.js';
import { PRESETS } from '../../teams/presets.js';
import type { AgentContext, Agent } from '../../agents/types.js';
import type { AgentFactory } from '../../teams/runner.js';
import { handleCliError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

function makeAgentLogger(verbose: boolean) {
  return {
    info: (msg: string) => { if (verbose) console.log(chalk.gray(msg)); },
    warn: (msg: string) => console.warn(`${chalk.yellow('⚠')} ${msg}`),
    error: (msg: string) => console.error(`${chalk.red('✖')} ${msg}`),
    debug: (msg: string) => { if (verbose) console.log(chalk.dim(msg)); },
  };
}

function renderWorkflowResult(
  workflowName: string,
  steps: Array<{ stepId: string; description: string; success: boolean; durationMs: number; tokensUsed?: number; error?: string; optional?: boolean }>,
  totalDurationMs: number,
  success: boolean,
): void {
  const lines: string[] = [];
  const width = 50;
  const topBorder = '─'.repeat(width - workflowName.length - 4);
  lines.push(chalk.cyan(`┌─ Team Workflow: ${workflowName} ${topBorder}┐`));

  for (const step of steps) {
    let icon: string;
    let detail: string;

    if (step.success) {
      icon = chalk.green('✔');
      const dur = `${(step.durationMs / 1000).toFixed(1)}s`;
      const tok = step.tokensUsed ? `, ${step.tokensUsed} tokens` : '';
      detail = chalk.dim(`(${dur}${tok})`);
    } else if (step.error === 'Skipped' || step.error?.startsWith('Skipped:')) {
      icon = chalk.yellow('⚠');
      detail = chalk.dim('(skipped' + (step.optional ? ' - optional' : '') + ')');
    } else {
      icon = chalk.red('✖');
      detail = chalk.dim(`(${step.error ?? 'failed'})`);
    }

    lines.push(chalk.cyan('│') + ` ${icon} ${chalk.bold(`[${step.stepId}]`)} ${step.description} ${detail}`);
  }

  lines.push(chalk.cyan('├' + '─'.repeat(width) + '┤'));

  const totalSec = (totalDurationMs / 1000).toFixed(1);
  const totalTokens = steps.reduce((sum, s) => sum + (s.tokensUsed ?? 0), 0);
  const statusText = success ? chalk.green('success') : chalk.red('failed');
  lines.push(chalk.cyan('│') + ` Total: ${totalSec}s | Tokens: ${totalTokens} | Status: ${statusText}`);
  lines.push(chalk.cyan('└' + '─'.repeat(width) + '┘'));

  console.log(lines.join('\n'));
}

export const teamCommand = new Command('team')
  .description('팀 워크플로우 실행')
  .argument('[preset]', '워크플로우 프리셋 이름')
  .option('--list', '사용 가능한 프리셋 목록')
  .action(async (preset: string | undefined, options: { list?: boolean }) => {
    if (options.list) {
      console.log(chalk.bold('\n사용 가능한 워크플로우 프리셋:\n'));
      for (const [name, workflow] of Object.entries(PRESETS)) {
        console.log(`  ${chalk.cyan(chalk.bold(name))}`);
        console.log(`    ${chalk.dim(workflow.description)}`);
        console.log(`    ${chalk.dim('스텝:')} ${workflow.steps.map((s) => s.id).join(' → ')}`);
        console.log();
      }
      return;
    }

    if (!preset) {
      logger.error('프리셋 이름을 지정하세요. (--list로 목록 확인)');
      process.exit(1);
    }

    const workflow = PRESETS[preset];
    if (!workflow) {
      logger.error(`알 수 없는 프리셋: ${preset}`);
      logger.info('사용 가능한 프리셋: ' + Object.keys(PRESETS).join(', '));
      process.exit(1);
    }

    const cwd = process.cwd();

    // Config 로드
    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      handleCliError(err);
    }

    // AI 프로바이더 생성
    let aiProvider;
    try {
      aiProvider = await createAIProvider(config);
    } catch (err) {
      handleCliError(err);
    }

    const agentLogger = makeAgentLogger(config.output.verbose);
    const context: AgentContext = { workingDir: cwd, config, logger: agentLogger };

    // AgentFactory: 에이전트 이름 → 인스턴스
    const agentFactory: AgentFactory = (agentName: string): Agent<unknown, unknown> | null => {
      switch (agentName) {
        case 'IssueAnalyzer': {
          // IssueAnalyzer는 tracker가 필요하므로 mock으로 대체
          const { IssueAnalyzer } = require('../../agents/issue-analyzer.js') as typeof import('../../agents/issue-analyzer.js');
          const { MockTracker } = require('../../trackers/mock.js') as typeof import('../../trackers/mock.js');
          return new IssueAnalyzer(aiProvider, new MockTracker()) as Agent<unknown, unknown>;
        }
        case 'BranchNamer': {
          const { BranchNamer } = require('../../agents/branch-namer.js') as typeof import('../../agents/branch-namer.js');
          return new BranchNamer(aiProvider) as Agent<unknown, unknown>;
        }
        case 'CommitWriter': {
          const { CommitWriter } = require('../../agents/commit-writer.js') as typeof import('../../agents/commit-writer.js');
          return new CommitWriter(aiProvider) as Agent<unknown, unknown>;
        }
        case 'CodeReviewer': {
          const { CodeReviewer } = require('../../agents/code-reviewer.js') as typeof import('../../agents/code-reviewer.js');
          return new CodeReviewer(aiProvider) as Agent<unknown, unknown>;
        }
        default:
          return null;
      }
    };

    const runner = new WorkflowRunner(context, agentFactory);

    // 각 스텝 진행 상황 출력 (스피너)
    const stepDescriptions = new Map(workflow.steps.map((s) => [s.id, s.description]));
    const stepOptional = new Map(workflow.steps.map((s) => [s.id, s.optional ?? false]));

    console.log(chalk.bold(`\n워크플로우 시작: ${chalk.cyan(workflow.name)}\n`));

    const spinner = ora('워크플로우 실행 중...').start();
    let result;
    try {
      result = await runner.execute(workflow);
    } catch (err) {
      spinner.fail('워크플로우 실행 실패');
      handleCliError(err);
    }
    spinner.stop();

    // 결과 렌더링
    const stepDisplayInfo = result.steps.map((s) => ({
      ...s,
      description: stepDescriptions.get(s.stepId) ?? s.agentName,
      optional: stepOptional.get(s.stepId) ?? false,
    }));

    renderWorkflowResult(workflow.name, stepDisplayInfo, result.totalDurationMs, result.success);

    if (!result.success) {
      process.exit(1);
    }
  });
