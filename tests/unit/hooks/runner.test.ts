import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRunner } from '../../../src/hooks/runner.js';
import type { HookDefinition } from '../../../src/hooks/types.js';

describe('HookRunner', () => {
  describe('constructor', () => {
    it('빈 훅 목록으로 초기화', () => {
      const runner = new HookRunner();
      expect(runner.listHooks()).toEqual([]);
    });

    it('훅 목록을 받아 초기화', () => {
      const hooks: HookDefinition[] = [
        { event: 'pre-commit', command: 'echo hello' },
      ];
      const runner = new HookRunner(hooks);
      expect(runner.listHooks()).toHaveLength(1);
    });
  });

  describe('listHooks', () => {
    const hooks: HookDefinition[] = [
      { event: 'pre-start', command: 'echo pre-start' },
      { event: 'post-start', command: 'echo post-start' },
      { event: 'pre-commit', command: 'echo pre-commit' },
    ];
    const runner = new HookRunner(hooks);

    it('이벤트 없이 호출 시 전체 훅 반환', () => {
      expect(runner.listHooks()).toHaveLength(3);
    });

    it('이벤트 지정 시 해당 이벤트 훅만 반환', () => {
      const result = runner.listHooks('pre-start');
      expect(result).toHaveLength(1);
      expect(result[0]!.command).toBe('echo pre-start');
    });

    it('해당 이벤트 훅이 없으면 빈 배열 반환', () => {
      expect(runner.listHooks('post-commit')).toEqual([]);
    });
  });

  describe('run', () => {
    it('빈 훅 목록 → 빈 결과 반환', async () => {
      const runner = new HookRunner([]);
      const results = await runner.run('pre-commit');
      expect(results).toEqual([]);
    });

    it('해당 이벤트 훅이 없으면 빈 결과 반환', async () => {
      const runner = new HookRunner([
        { event: 'pre-start', command: 'echo hi' },
      ]);
      const results = await runner.run('pre-commit');
      expect(results).toEqual([]);
    });

    it('성공하는 훅 실행 결과 반환', async () => {
      const runner = new HookRunner([
        { event: 'pre-commit', command: 'echo hello' },
      ]);
      const results = await runner.run('pre-commit');
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.output).toBe('hello');
      expect(results[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('실패하는 훅은 에러를 throw', async () => {
      const runner = new HookRunner([
        { event: 'pre-commit', command: 'exit 1' },
      ]);
      await expect(runner.run('pre-commit')).rejects.toThrow('Hook failed');
    });

    it('continueOnError: true이면 실패해도 다음 훅 계속 실행', async () => {
      const runner = new HookRunner([
        { event: 'pre-commit', command: 'exit 1', continueOnError: true },
        { event: 'pre-commit', command: 'echo second' },
      ]);
      const results = await runner.run('pre-commit');
      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(false);
      expect(results[1]!.success).toBe(true);
    });

    it('continueOnError: false (기본값)이면 실패 시 중단', async () => {
      const runner = new HookRunner([
        { event: 'pre-commit', command: 'exit 1' },
        { event: 'pre-commit', command: 'echo second' },
      ]);
      await expect(runner.run('pre-commit')).rejects.toThrow();
    });

    it('환경변수가 훅 명령어에 전달된다', async () => {
      // node -e로 process.env를 출력해 플랫폼 무관하게 테스트
      const runner = new HookRunner([
        { event: 'post-start', command: 'node -e "process.stdout.write(process.env.JUNFLOW_ISSUE_ID)"' },
      ]);
      const results = await runner.run('post-start', { JUNFLOW_ISSUE_ID: 'ISSUE-42' });
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.output).toBe('ISSUE-42');
    });

    it('실패한 훅 결과에 error 필드가 있다', async () => {
      const runner = new HookRunner([
        { event: 'pre-review', command: 'exit 1', continueOnError: true },
      ]);
      const results = await runner.run('pre-review');
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toBeDefined();
    });

    it('durationMs가 숫자로 기록된다', async () => {
      const runner = new HookRunner([
        { event: 'pre-commit', command: 'echo timing' },
      ]);
      const results = await runner.run('pre-commit');
      expect(typeof results[0]!.durationMs).toBe('number');
    });
  });

  describe('fromConfig', () => {
    it('설정 파일 없어도 빈 HookRunner 반환', async () => {
      const runner = await HookRunner.fromConfig('/nonexistent/path');
      expect(runner.listHooks()).toEqual([]);
    });
  });
});
