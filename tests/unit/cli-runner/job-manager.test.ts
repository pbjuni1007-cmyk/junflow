import { describe, it, expect, beforeEach } from 'vitest';
import { JobManager } from '../../../src/cli-runner/job-manager.js';
import type { CliResult } from '../../../src/cli-runner/types.js';

describe('JobManager', () => {
  let manager: JobManager;

  beforeEach(() => {
    manager = new JobManager();
  });

  it('should create a job and return an ID', () => {
    const promise = new Promise<CliResult>(() => {}); // never resolves
    const id = manager.startJob('codex', promise);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('should track job as running initially', () => {
    const promise = new Promise<CliResult>(() => {});
    const id = manager.startJob('codex', promise);
    const job = manager.getJob(id);
    expect(job?.state).toBe('running');
    expect(job?.cli).toBe('codex');
  });

  it('should update job state to done on success', async () => {
    const result: CliResult = {
      cli: 'codex',
      status: 'success',
      output: 'done',
      truncated: false,
      durationMs: 100,
      exitCode: 0,
    };
    const promise = Promise.resolve(result);
    const id = manager.startJob('codex', promise);
    await promise;
    // Wait for microtask
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.getState(id)).toBe('done');
    expect(manager.getJob(id)?.result?.output).toBe('done');
  });

  it('should update job state to failed on error', async () => {
    const promise = Promise.reject(new Error('cli crashed'));
    const id = manager.startJob('gemini', promise);
    // Wait for rejection to propagate
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.getState(id)).toBe('failed');
    expect(manager.getJob(id)?.result?.error).toContain('cli crashed');
  });

  it('should update job state to timeout', async () => {
    const result: CliResult = {
      cli: 'codex',
      status: 'timeout',
      output: '',
      truncated: false,
      durationMs: 30000,
      exitCode: null,
      error: 'timed out',
    };
    const promise = Promise.resolve(result);
    const id = manager.startJob('codex', promise);
    await promise;
    await new Promise((r) => setTimeout(r, 10));
    expect(manager.getState(id)).toBe('timeout');
  });

  it('should list all jobs', () => {
    const p1 = new Promise<CliResult>(() => {});
    const p2 = new Promise<CliResult>(() => {});
    manager.startJob('codex', p1);
    manager.startJob('gemini', p2);
    expect(manager.listJobs()).toHaveLength(2);
  });

  it('should return undefined for unknown job ID', () => {
    expect(manager.getJob('nonexistent')).toBeUndefined();
    expect(manager.getState('nonexistent')).toBeUndefined();
  });

  it('should cleanup old completed jobs', async () => {
    const result: CliResult = {
      cli: 'codex',
      status: 'success',
      output: 'ok',
      truncated: false,
      durationMs: 50,
      exitCode: 0,
    };
    const id = manager.startJob('codex', Promise.resolve(result));
    await new Promise((r) => setTimeout(r, 10));

    // Cleanup with maxAge = 0 should remove all completed
    const removed = manager.cleanup(0);
    expect(removed).toBe(1);
    expect(manager.getJob(id)).toBeUndefined();
  });

  it('should not cleanup running jobs', () => {
    manager.startJob('codex', new Promise<CliResult>(() => {}));
    const removed = manager.cleanup(0);
    expect(removed).toBe(0);
    expect(manager.listJobs()).toHaveLength(1);
  });
});
