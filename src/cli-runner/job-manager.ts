import type { CliType, CliResult, Job, JobState } from './types.js';

/**
 * Manages async CLI jobs — tracks running processes and their results.
 */
export class JobManager {
  private jobs = new Map<string, Job>();

  /**
   * Generate a unique job ID.
   */
  private generateId(): string {
    const ts = Date.now();
    const pid = process.pid;
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${ts}-${pid}-${rand}`;
  }

  /**
   * Register a new job and start tracking its completion.
   */
  startJob(cli: CliType, resultPromise: Promise<CliResult>): string {
    const id = this.generateId();
    const job: Job = {
      id,
      cli,
      state: 'running',
      startedAt: new Date().toISOString(),
    };

    this.jobs.set(id, job);

    resultPromise
      .then((result) => {
        const j = this.jobs.get(id);
        if (j) {
          j.state = result.status === 'timeout' ? 'timeout' : (result.status === 'failed' ? 'failed' : 'done');
          j.result = result;
        }
      })
      .catch((err) => {
        const j = this.jobs.get(id);
        if (j) {
          j.state = 'failed';
          j.result = {
            cli,
            status: 'failed',
            output: '',
            truncated: false,
            durationMs: 0,
            exitCode: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });

    return id;
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get job state, or undefined if not found.
   */
  getState(jobId: string): JobState | undefined {
    return this.jobs.get(jobId)?.state;
  }

  /**
   * List all tracked jobs.
   */
  listJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Remove completed jobs older than maxAgeMs (default: 1 hour).
   */
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, job] of this.jobs) {
      if (job.state === 'running') continue;
      const age = now - new Date(job.startedAt).getTime();
      if (age > maxAgeMs) {
        this.jobs.delete(id);
        removed++;
      }
    }

    return removed;
  }
}

// Singleton instance for the MCP server process
export const jobManager = new JobManager();
