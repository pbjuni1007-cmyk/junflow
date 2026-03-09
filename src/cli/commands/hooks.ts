import { Command } from 'commander';
import chalk from 'chalk';
import { HookRunner } from '../../hooks/runner.js';
import type { HookEvent } from '../../hooks/types.js';

const HOOK_EVENTS: HookEvent[] = [
  'pre-start',
  'post-start',
  'pre-commit',
  'post-commit',
  'pre-review',
  'post-review',
];

export const hooksCommand = new Command('hooks')
  .description('등록된 훅 목록 표시')
  .action(async () => {
    const cwd = process.cwd();
    const runner = await HookRunner.fromConfig(cwd);
    const allHooks = runner.listHooks();

    if (allHooks.length === 0) {
      console.log(chalk.dim('등록된 훅이 없습니다.'));
      console.log(chalk.dim('config.yaml의 hooks 섹션에서 훅을 정의하세요.'));
      return;
    }

    for (const event of HOOK_EVENTS) {
      const eventHooks = runner.listHooks(event);
      if (eventHooks.length === 0) continue;

      console.log(chalk.bold.cyan(`\n[${event}]`));
      for (const hook of eventHooks) {
        const continueFlag = hook.continueOnError ? chalk.dim(' (continueOnError)') : '';
        const desc = hook.description ? chalk.dim(` # ${hook.description}`) : '';
        console.log(`  ${chalk.green('$')} ${hook.command}${continueFlag}${desc}`);
      }
    }
    console.log('');
  });
