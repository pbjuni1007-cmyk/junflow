import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { createAIProvider } from '../../ai/provider-factory.js';
import { WorkflowRunner } from '../../teams/runner.js';
import { PRESETS } from '../../teams/presets.js';
import { createAgentFactory } from '../../teams/agent-factory.js';
import type { AgentContext } from '../../agents/types.js';
import { handleCliError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { formatWorkflowResult } from '../utils/workflow-renderer.js';

function makeAgentLogger(verbose: boolean) {
  return {
    info: (msg: string) => { if (verbose) console.log(chalk.gray(msg)); },
    warn: (msg: string) => console.warn(`${chalk.yellow('⚠')} ${msg}`),
    error: (msg: string) => console.error(`${chalk.red('✖')} ${msg}`),
    debug: (msg: string) => { if (verbose) console.log(chalk.dim(msg)); },
  };
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

    const agentFactory = createAgentFactory(aiProvider);
    const runner = new WorkflowRunner(context, agentFactory);

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

    formatWorkflowResult(workflow, result);

    if (!result.success) {
      process.exit(1);
    }
  });
