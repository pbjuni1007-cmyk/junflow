import { spawn } from 'node:child_process';
import type { CliName, SpawnOptions, WorkerResult } from './types.js';

const DEFAULT_TIMEOUT = 120_000; // 2분

/** CLI별 실행 인자 매핑 */
function buildArgs(cli: CliName, prompt: string): string[] {
  switch (cli) {
    case 'codex':
      return ['--prompt', prompt, '--print'];
    case 'gemini':
      return ['--prompt', prompt];
    case 'claude':
      return ['--print', prompt];
  }
}

/**
 * 외부 CLI(codex/gemini/claude)를 child_process로 실행하고 결과를 수집한다.
 */
export class CliRunner {
  async spawn(cli: CliName, prompt: string, options: SpawnOptions = {}): Promise<WorkerResult> {
    const args = buildArgs(cli, prompt);
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const startTime = Date.now();

    return new Promise<WorkerResult>((resolve) => {
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      let timedOut = false;
      let settled = false;

      const child = spawn(cli, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // SIGTERM으로 안 죽으면 SIGKILL
        setTimeout(() => {
          if (!settled) child.kill('SIGKILL');
        }, 5_000);
      }, timeout);

      child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => errChunks.push(chunk));

      child.on('error', (err) => {
        clearTimeout(timer);
        settled = true;
        resolve({
          cli,
          output: err.message,
          exitCode: -1,
          durationMs: Date.now() - startTime,
          timedOut: false,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        settled = true;
        const stdout = Buffer.concat(chunks).toString('utf-8').trim();
        const stderr = Buffer.concat(errChunks).toString('utf-8').trim();
        resolve({
          cli,
          output: stdout || stderr,
          exitCode: code ?? 1,
          durationMs: Date.now() - startTime,
          timedOut,
        });
      });
    });
  }

  /** 여러 CLI를 병렬로 실행하고 결과를 모은다 */
  async spawnAll(
    tasks: Array<{ cli: CliName; prompt: string; options?: SpawnOptions }>,
  ): Promise<WorkerResult[]> {
    return Promise.all(
      tasks.map((t) => this.spawn(t.cli, t.prompt, t.options)),
    );
  }
}
