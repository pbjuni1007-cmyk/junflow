import { exec } from 'child_process';
import { promisify } from 'util';
import type { HookDefinition, HookEvent, HookResult } from './types.js';
import { loadConfig } from '../config/loader.js';

const execAsync = promisify(exec);

export class HookRunner {
  private hooks: HookDefinition[];

  constructor(hooks: HookDefinition[] = []) {
    this.hooks = hooks;
  }

  static async fromConfig(workingDir: string): Promise<HookRunner> {
    try {
      const config = await loadConfig();
      const hooks = (config.hooks ?? []) as HookDefinition[];
      return new HookRunner(hooks);
    } catch {
      return new HookRunner([]);
    }
  }

  async run(event: HookEvent, env?: Record<string, string>): Promise<HookResult[]> {
    const eventHooks = this.hooks.filter((h) => h.event === event);
    const results: HookResult[] = [];

    for (const hook of eventHooks) {
      const startTime = Date.now();
      try {
        const { stdout } = await execAsync(hook.command, {
          cwd: process.cwd(),
          timeout: 30000,
          env: { ...process.env, ...env },
        });
        results.push({
          event,
          command: hook.command,
          success: true,
          output: stdout.trim(),
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        const result: HookResult = {
          event,
          command: hook.command,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
        };
        results.push(result);

        if (!hook.continueOnError) {
          throw new Error(`Hook failed: ${hook.command}\n${result.error}`);
        }
      }
    }

    return results;
  }

  listHooks(event?: HookEvent): HookDefinition[] {
    return event ? this.hooks.filter((h) => h.event === event) : this.hooks;
  }
}
