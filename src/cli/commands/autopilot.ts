import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { createAIProvider } from '../../ai/provider-factory.js';
import { ensureGitRepo } from '../../git/operations.js';
import { autopilotWorkflow } from '../../teams/presets.js';
import { runAutopilot } from '../../modes/autopilot.js';
import type { AgentContext } from '../../agents/types.js';
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { formatWorkflowResult } from '../utils/workflow-renderer.js';
import { sessionManager } from '../../session/index.js';

export const autopilotCommand = new Command('autopilot')
  .description('전체 개발 사이클 자동 실행 (분석→브랜치→커밋→리뷰→검증)')
  .option('--issue <id>', '이슈 ID')
  .option('--dry-run', '실제 실행 없이 계획만 표시')
  .action(async (options: { issue?: string; dryRun?: boolean }) => {
    const cwd = process.cwd();

    try {
      await ensureGitRepo(cwd);
    } catch {
      cliErrors.notGitRepo();
    }

    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      handleCliError(err);
    }

    // 세션 시작
    await sessionManager.start(cwd).catch(() => {});

    // dry-run: 워크플로우 구조만 출력
    if (options.dryRun) {
      console.log(chalk.bold('\n[dry-run] Autopilot 워크플로우 계획:\n'));
      for (const step of autopilotWorkflow.steps) {
        const deps = step.dependsOn?.length ? chalk.dim(` (← ${step.dependsOn.join(', ')})`) : '';
        const opt = step.optional ? chalk.yellow(' [optional]') : '';
        console.log(`  ${chalk.cyan(step.id)} → ${step.agentName}: ${step.description}${deps}${opt}`);
      }
      console.log();
      logger.info('[dry-run] 실제 실행 없이 완료');
      return;
    }

    let aiProvider;
    try {
      aiProvider = await createAIProvider(config);
    } catch (err) {
      handleCliError(err);
    }

    const agentLogger = {
      info: (msg: string) => { if (config.output.verbose) console.log(chalk.gray(msg)); },
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
      debug: (msg: string) => { if (config.output.verbose) console.log(chalk.dim(msg)); },
    };

    const context: AgentContext = { workingDir: cwd, config, logger: agentLogger };

    console.log(chalk.bold(`\n${chalk.cyan('Autopilot')} 모드 시작${options.issue ? ` (이슈: ${chalk.bold(options.issue)})` : ''}\n`));

    const spinner = ora('autopilot 실행 중...').start();

    let result;
    try {
      result = await runAutopilot(aiProvider, context, {
        issueId: options.issue,
        dryRun: false,
      });
    } catch (err) {
      spinner.fail('autopilot 실행 실패');
      handleCliError(err);
    }

    spinner.stop();

    formatWorkflowResult(autopilotWorkflow, result.workflowResult);

    // 세션 기록
    await sessionManager.recordAgentCall({
      agentName: 'Autopilot',
      command: `autopilot${options.issue ? ` --issue ${options.issue}` : ''}`,
      timestamp: new Date().toISOString(),
      durationMs: result.workflowResult.totalDurationMs,
      tokensUsed: result.workflowResult.steps.reduce((sum, s) => sum + (s.tokensUsed ?? 0), 0),
      success: result.workflowResult.success,
    }).catch(() => {});

    console.log(chalk.dim(`\n모드: ${result.state.mode} | 단계: ${result.state.phase} | 시작: ${result.state.startedAt}`));

    if (!result.workflowResult.success) {
      process.exit(1);
    }
  });
