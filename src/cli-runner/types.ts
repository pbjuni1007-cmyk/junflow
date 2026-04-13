export type CliType = 'codex' | 'gemini';

export interface SpawnOptions {
  cli: CliType;
  prompt: string;
  profile?: string;
  role?: string;
  timeout?: number;
  cwd?: string;
  context?: string;
  env?: Record<string, string>;
  async?: boolean;
}

export interface CliResult {
  cli: CliType;
  status: 'success' | 'timeout' | 'failed';
  output: string;
  truncated: boolean;
  durationMs: number;
  exitCode: number | null;
  error?: string;
}

export interface ConsensusResult {
  results: CliResult[];
  allSucceeded: boolean;
  completedCount: number;
}

export type JobState = 'running' | 'done' | 'timeout' | 'failed';

export interface Job {
  id: string;
  cli: CliType;
  state: JobState;
  startedAt: string;
  result?: CliResult;
}

export interface CliValidation {
  installed: boolean;
  version?: string;
  error?: string;
}
