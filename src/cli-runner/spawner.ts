import { spawn } from 'child_process';
import type { JunFlowConfig } from '../config/schema.js';
import type { CliType, CliResult, ConsensusResult, SpawnOptions } from './types.js';
import { parseCliOutput } from './output-parser.js';
import { validateCli, resolveBin } from './validator.js';

/** Environment variables safe to pass to child CLI processes. */
const ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USERPROFILE', 'TERM', 'LANG', 'LC_ALL',
  'TMPDIR', 'TEMP', 'TMP', 'NODE_ENV',
  'CODEX_HOME', 'GEMINI_HOME',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES',
  'SystemRoot', 'COMSPEC', 'SHELL',
];

function buildSafeEnv(extra?: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key]) safe[key] = process.env[key]!;
  }
  return { ...safe, ...extra };
}

/**
 * Resolve profile name to actual model/profile string.
 * Looks up in config: cli.[codex|gemini].profiles[profileName]
 */
function resolveProfile(
  cli: CliType,
  profileName: string | undefined,
  config: JunFlowConfig,
): string | undefined {
  if (!profileName) return undefined;
  const cliConfig = config.cli?.[cli];
  return cliConfig?.profiles?.[profileName] ?? profileName;
}

/**
 * Resolve a role name to CLI type + profile.
 */
function resolveRole(
  roleName: string,
  config: JunFlowConfig,
): { cli: CliType; profile?: string } | undefined {
  const role = config.cli?.roles?.[roleName];
  if (!role) return undefined;
  const profile = resolveProfile(role.cli, role.profile, config);
  return { cli: role.cli, profile };
}

/**
 * Build CLI arguments for Codex.
 */
function buildCodexArgs(profile?: string, sandboxBypass?: boolean): string[] {
  const args = ['exec'];
  if (profile) args.push('--profile', profile);
  if (sandboxBypass) args.push('--dangerously-bypass-approvals-and-sandbox');
  args.push('--skip-git-repo-check');
  return args;
}

/**
 * Build CLI arguments for Gemini.
 */
function buildGeminiArgs(prompt: string, profile?: string): string[] {
  const args: string[] = [];
  if (profile) args.push('--model', profile);
  args.push('--yolo');
  args.push('--output-format', 'stream-json');
  args.push('--prompt', prompt);
  return args;
}

/**
 * Kill a process tree (Windows-aware).
 */
function killProcess(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(-pid, 'SIGTERM');
      setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // already dead
        }
      }, 1000);
    }
  } catch {
    // process already exited
  }
}

/**
 * Spawn a single CLI process and collect its output.
 */
export async function spawnCli(
  options: SpawnOptions,
  config: JunFlowConfig,
): Promise<CliResult> {
  const startTime = Date.now();
  const maxBytes = config.cli?.outputMaxBytes ?? 51200;
  const timeout = (options.timeout ?? config.cli?.defaultTimeout ?? 300) * 1000;

  // Resolve role → cli + profile
  let cli = options.cli;
  let profile = options.profile;

  if (options.role) {
    const resolved = resolveRole(options.role, config);
    if (resolved) {
      cli = resolved.cli;
      profile = resolved.profile ?? profile;
    }
  }

  if (!profile) {
    profile = resolveProfile(cli, config.cli?.[cli]?.defaultProfile, config);
  }

  // Validate CLI installation
  const bin = resolveBin(cli, config.cli?.[cli]?.bin);
  const validation = await validateCli(cli, config.cli?.[cli]?.bin);
  if (!validation.installed) {
    return {
      cli,
      status: 'failed',
      output: '',
      truncated: false,
      durationMs: Date.now() - startTime,
      exitCode: null,
      error: validation.error,
    };
  }

  // Build prompt with context
  const fullPrompt = options.context
    ? `${options.prompt}\n\n---\nContext:\n${options.context}`
    : options.prompt;

  // Build args
  const sandboxBypass = config.cli?.[cli]?.sandboxBypass ?? false;
  const args = cli === 'codex'
    ? buildCodexArgs(profile, sandboxBypass)
    : buildGeminiArgs(fullPrompt, profile);

  return new Promise<CliResult>((resolve) => {
    const child = spawn(bin, args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: buildSafeEnv(options.env),
      detached: process.platform !== 'win32',
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    // Timeout handler
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killProcess(child.pid);
    }, timeout);

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    // For Codex: send prompt via stdin
    if (cli === 'codex') {
      child.stdin?.write(fullPrompt);
      child.stdin?.end();
    }

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const rawStdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const rawStderr = Buffer.concat(stderrChunks).toString('utf-8');

      if (timedOut) {
        resolve({
          cli,
          status: 'timeout',
          output: rawStdout ? parseCliOutput(rawStdout, maxBytes).output : '',
          truncated: false,
          durationMs,
          exitCode,
          error: `Process timed out after ${timeout / 1000}s`,
        });
        return;
      }

      // Use stdout; fall back to stderr if stdout is empty
      const rawOutput = rawStdout.trim() || rawStderr.trim();
      const { output, truncated } = parseCliOutput(rawOutput, maxBytes);

      const failed = exitCode !== null && exitCode !== 0;
      resolve({
        cli,
        status: failed ? 'failed' : 'success',
        output,
        truncated,
        durationMs,
        exitCode,
        error: failed ? `Process exited with code ${exitCode}` : undefined,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        cli,
        status: 'failed',
        output: '',
        truncated: false,
        durationMs: Date.now() - startTime,
        exitCode: null,
        error: err.message,
      });
    });
  });
}

/**
 * Run multiple CLI tasks in parallel and collect all results.
 */
export async function spawnConsensus(
  tasks: SpawnOptions[],
  config: JunFlowConfig,
): Promise<ConsensusResult> {
  const settled = await Promise.allSettled(
    tasks.map((task) => spawnCli(task, config)),
  );

  const results: CliResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      cli: tasks[i].cli,
      status: 'failed' as const,
      output: '',
      truncated: false,
      durationMs: 0,
      exitCode: null,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });

  return {
    results,
    allSucceeded: results.every((r) => r.status === 'success'),
    completedCount: results.filter((r) => r.status === 'success').length,
  };
}
