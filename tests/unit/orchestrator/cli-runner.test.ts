import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { CliRunner } from '../../../src/orchestrator/cli-runner.js';

/** 가짜 ChildProcess를 만드는 헬퍼 */
function createMockChild(stdout: string, exitCode: number, delay = 0): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  (child as any).stdout = stdoutEmitter;
  (child as any).stderr = stderrEmitter;
  child.kill = vi.fn().mockReturnValue(true);

  setTimeout(() => {
    if (stdout) {
      stdoutEmitter.emit('data', Buffer.from(stdout));
    }
    child.emit('close', exitCode);
  }, delay);

  return child;
}

describe('CliRunner', () => {
  let runner: CliRunner;

  beforeEach(() => {
    runner = new CliRunner();
    vi.clearAllMocks();
  });

  it('성공적인 CLI 실행 결과를 반환한다', async () => {
    mockSpawn.mockReturnValue(createMockChild('review result', 0));

    const result = await runner.spawn('codex', 'review this code');

    expect(result.cli).toBe('codex');
    expect(result.output).toBe('review result');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBeFalsy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('CLI별 올바른 인자로 spawn한다 — codex', async () => {
    mockSpawn.mockReturnValue(createMockChild('', 0));
    await runner.spawn('codex', 'test prompt');
    expect(mockSpawn).toHaveBeenCalledWith(
      'codex',
      ['--prompt', 'test prompt', '--print'],
      expect.any(Object),
    );
  });

  it('CLI별 올바른 인자로 spawn한다 — gemini', async () => {
    mockSpawn.mockReturnValue(createMockChild('', 0));
    await runner.spawn('gemini', 'test prompt');
    expect(mockSpawn).toHaveBeenCalledWith(
      'gemini',
      ['--prompt', 'test prompt'],
      expect.any(Object),
    );
  });

  it('CLI별 올바른 인자로 spawn한다 — claude', async () => {
    mockSpawn.mockReturnValue(createMockChild('', 0));
    await runner.spawn('claude', 'test prompt');
    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['--print', 'test prompt'],
      expect.any(Object),
    );
  });

  it('비정상 종료 시 exitCode를 반환한다', async () => {
    mockSpawn.mockReturnValue(createMockChild('error output', 1));

    const result = await runner.spawn('codex', 'bad command');

    expect(result.exitCode).toBe(1);
    expect(result.output).toBe('error output');
  });

  it('spawn error 시 에러 메시지를 반환한다', async () => {
    const child = new EventEmitter() as ChildProcess;
    (child as any).stdout = new EventEmitter();
    (child as any).stderr = new EventEmitter();
    child.kill = vi.fn();
    mockSpawn.mockReturnValue(child);

    const promise = runner.spawn('codex', 'test');
    setTimeout(() => child.emit('error', new Error('ENOENT')), 0);
    const result = await promise;

    expect(result.exitCode).toBe(-1);
    expect(result.output).toBe('ENOENT');
  });

  it('stderr 출력을 stdout이 비었을 때 output으로 사용한다', async () => {
    const child = new EventEmitter() as ChildProcess;
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    (child as any).stdout = stdoutEmitter;
    (child as any).stderr = stderrEmitter;
    child.kill = vi.fn();
    mockSpawn.mockReturnValue(child);

    const promise = runner.spawn('codex', 'test');
    setTimeout(() => {
      stderrEmitter.emit('data', Buffer.from('stderr output'));
      child.emit('close', 1);
    }, 0);
    const result = await promise;

    expect(result.output).toBe('stderr output');
  });

  it('cwd 옵션을 spawn에 전달한다', async () => {
    mockSpawn.mockReturnValue(createMockChild('', 0));
    await runner.spawn('codex', 'test', { cwd: '/some/path' });
    expect(mockSpawn).toHaveBeenCalledWith(
      'codex',
      expect.any(Array),
      expect.objectContaining({ cwd: '/some/path' }),
    );
  });

  describe('spawnAll', () => {
    it('여러 CLI를 병렬로 실행한다', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockChild('codex result', 0))
        .mockReturnValueOnce(createMockChild('gemini result', 0));

      const results = await runner.spawnAll([
        { cli: 'codex', prompt: 'task 1' },
        { cli: 'gemini', prompt: 'task 2' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]!.cli).toBe('codex');
      expect(results[1]!.cli).toBe('gemini');
    });

    it('빈 배열이면 빈 결과를 반환한다', async () => {
      const results = await runner.spawnAll([]);
      expect(results).toHaveLength(0);
    });
  });
});
