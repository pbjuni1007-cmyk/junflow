import { describe, it, expect, vi } from 'vitest';
import { WorkflowRunner } from '../../../src/teams/runner.js';
import type { AgentFactory } from '../../../src/teams/runner.js';
import type { TeamWorkflow } from '../../../src/teams/types.js';
import type { AgentContext, Agent, AgentResult } from '../../../src/agents/types.js';

function makeContext(): AgentContext {
  return {
    workingDir: '/tmp',
    config: {} as AgentContext['config'],
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

function makeSuccessAgent(name: string, data: unknown, tokensUsed = 100): Agent<unknown, unknown> {
  return {
    name,
    description: '',
    execute: vi.fn().mockResolvedValue({
      success: true,
      data,
      metadata: { agentName: name, durationMs: 50, tokensUsed },
    } satisfies AgentResult<unknown>),
  };
}

function makeFailAgent(name: string, errorMsg = 'agent error'): Agent<unknown, unknown> {
  return {
    name,
    description: '',
    execute: vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'AI_ERROR', message: errorMsg },
      metadata: { agentName: name, durationMs: 10 },
    } satisfies AgentResult<unknown>),
  };
}

describe('WorkflowRunner', () => {
  describe('순차 워크플로우 실행', () => {
    it('step1 → step2 순서로 실행되고 결과를 집계한다', async () => {
      const agent1 = makeSuccessAgent('AgentA', { value: 'hello' }, 200);
      const agent2 = makeSuccessAgent('AgentB', { result: 'world' }, 150);

      const factory: AgentFactory = (name) => {
        if (name === 'AgentA') return agent1;
        if (name === 'AgentB') return agent2;
        return null;
      };

      const workflow: TeamWorkflow = {
        name: 'test-seq',
        description: '순차 테스트',
        steps: [
          { id: 'step1', agentName: 'AgentA', description: '1단계' },
          { id: 'step2', agentName: 'AgentB', description: '2단계', dependsOn: ['step1'] },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      const result = await runner.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]?.stepId).toBe('step1');
      expect(result.steps[0]?.success).toBe(true);
      expect(result.steps[1]?.stepId).toBe('step2');
      expect(result.steps[1]?.success).toBe(true);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('병렬 독립 스텝', () => {
    it('dependsOn 없는 스텝들은 모두 실행된다', async () => {
      const agentA = makeSuccessAgent('AgentA', { a: 1 });
      const agentB = makeSuccessAgent('AgentB', { b: 2 });
      const agentC = makeSuccessAgent('AgentC', { c: 3 });

      const factory: AgentFactory = (name) => {
        if (name === 'AgentA') return agentA;
        if (name === 'AgentB') return agentB;
        if (name === 'AgentC') return agentC;
        return null;
      };

      const workflow: TeamWorkflow = {
        name: 'test-parallel',
        description: '독립 스텝 테스트',
        steps: [
          { id: 's1', agentName: 'AgentA', description: 'A' },
          { id: 's2', agentName: 'AgentB', description: 'B' },
          { id: 's3', agentName: 'AgentC', description: 'C' },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      const result = await runner.execute(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps.every((s) => s.success)).toBe(true);
    });
  });

  describe('선행 스텝 실패 시 후속 스텝 스킵', () => {
    it('필수 선행 스텝이 실패하면 후속 스텝은 skipped 처리된다', async () => {
      const agentA = makeFailAgent('AgentA', 'upstream failure');
      const agentB = makeSuccessAgent('AgentB', { result: 'ok' });

      const factory: AgentFactory = (name) => {
        if (name === 'AgentA') return agentA;
        if (name === 'AgentB') return agentB;
        return null;
      };

      const workflow: TeamWorkflow = {
        name: 'test-fail',
        description: '실패 전파 테스트',
        steps: [
          { id: 'upstream', agentName: 'AgentA', description: 'A' },
          { id: 'downstream', agentName: 'AgentB', description: 'B', dependsOn: ['upstream'] },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      const result = await runner.execute(workflow);

      expect(result.success).toBe(false);
      const downstreamStep = result.steps.find((s) => s.stepId === 'downstream');
      expect(downstreamStep).toBeDefined();
      expect(downstreamStep?.success).toBe(false);
      expect(downstreamStep?.error).toMatch(/[Ss]kipped/);
      // downstream 에이전트는 실행되지 않아야 함
      expect(agentB.execute).not.toHaveBeenCalled();
    });
  });

  describe('optional 스텝 실패 시 계속 진행', () => {
    it('optional 스텝이 실패해도 워크플로우는 success로 완료된다', async () => {
      const agentA = makeSuccessAgent('AgentA', { ok: true });
      const agentB = makeFailAgent('AgentB', 'optional step failed');

      const factory: AgentFactory = (name) => {
        if (name === 'AgentA') return agentA;
        if (name === 'AgentB') return agentB;
        return null;
      };

      const workflow: TeamWorkflow = {
        name: 'test-optional',
        description: 'optional 스텝 테스트',
        steps: [
          { id: 'required', agentName: 'AgentA', description: 'A' },
          { id: 'optional', agentName: 'AgentB', description: 'B', optional: true },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      const result = await runner.execute(workflow);

      expect(result.success).toBe(true);
      const optStep = result.steps.find((s) => s.stepId === 'optional');
      expect(optStep?.success).toBe(false);
    });

    it('모든 스텝이 optional일 때 모두 실패해도 success를 반환한다', async () => {
      const agentA = makeFailAgent('AgentA');
      const agentB = makeFailAgent('AgentB');

      const factory: AgentFactory = (name) => {
        if (name === 'AgentA') return agentA;
        if (name === 'AgentB') return agentB;
        return null;
      };

      const workflow: TeamWorkflow = {
        name: 'test-all-optional',
        description: '전체 optional 테스트',
        steps: [
          { id: 's1', agentName: 'AgentA', description: 'A', optional: true },
          { id: 's2', agentName: 'AgentB', description: 'B', optional: true },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      const result = await runner.execute(workflow);

      expect(result.success).toBe(true);
    });
  });

  describe('inputMapping으로 데이터 전달', () => {
    it('이전 스텝 결과의 data 필드를 다음 스텝 입력으로 전달한다', async () => {
      const agentA = makeSuccessAgent('AgentA', { analysis: { title: 'Test' } });
      const agentB = makeSuccessAgent('AgentB', { branchName: 'feature/test' });

      const receivedInputs: unknown[] = [];
      (agentB.execute as ReturnType<typeof vi.fn>).mockImplementation((input: unknown) => {
        receivedInputs.push(input);
        return Promise.resolve({
          success: true,
          data: { branchName: 'feature/test' },
          metadata: { agentName: 'AgentB', durationMs: 30, tokensUsed: 80 },
        });
      });

      const factory: AgentFactory = (name) => {
        if (name === 'AgentA') return agentA;
        if (name === 'AgentB') return agentB;
        return null;
      };

      const workflow: TeamWorkflow = {
        name: 'test-mapping',
        description: 'inputMapping 테스트',
        steps: [
          { id: 'step1', agentName: 'AgentA', description: 'A' },
          {
            id: 'step2',
            agentName: 'AgentB',
            description: 'B',
            dependsOn: ['step1'],
            inputMapping: { analysis: 'step1.data' },
          },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      await runner.execute(workflow);

      expect(receivedInputs).toHaveLength(1);
      const input = receivedInputs[0] as Record<string, unknown>;
      expect(input).toHaveProperty('analysis');
      expect(input['analysis']).toEqual({ analysis: { title: 'Test' } });
    });

    it('JSON 리터럴 inputMapping을 파싱해서 전달한다', async () => {
      const agentA = makeSuccessAgent('AgentA', { ok: true });
      const receivedInputs: unknown[] = [];
      (agentA.execute as ReturnType<typeof vi.fn>).mockImplementation((input: unknown) => {
        receivedInputs.push(input);
        return Promise.resolve({
          success: true,
          data: { ok: true },
          metadata: { agentName: 'AgentA', durationMs: 20, tokensUsed: 50 },
        });
      });

      const factory: AgentFactory = (name) => {
        if (name === 'AgentA') return agentA;
        return null;
      };

      const workflow: TeamWorkflow = {
        name: 'test-json-mapping',
        description: 'JSON mapping 테스트',
        steps: [
          {
            id: 'step1',
            agentName: 'AgentA',
            description: 'A',
            inputMapping: { focusAreas: '["security","performance"]' },
          },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      await runner.execute(workflow);

      expect(receivedInputs).toHaveLength(1);
      const input = receivedInputs[0] as Record<string, unknown>;
      expect(input['focusAreas']).toEqual(['security', 'performance']);
    });
  });

  describe('전체 결과 집계', () => {
    it('totalDurationMs는 0 이상이고 success는 모든 필수 스텝 성공 시 true다', async () => {
      const factory: AgentFactory = (name) => makeSuccessAgent(name, { ok: true });

      const workflow: TeamWorkflow = {
        name: 'test-aggregate',
        description: '집계 테스트',
        steps: [
          { id: 's1', agentName: 'AgentA', description: 'A' },
          { id: 's2', agentName: 'AgentB', description: 'B' },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      const result = await runner.execute(workflow);

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.success).toBe(true);
      expect(result.workflow).toBe('test-aggregate');
      expect(result.steps).toHaveLength(2);
    });

    it('필수 스텝 실패 시 success는 false다', async () => {
      const factory: AgentFactory = (name) => makeFailAgent(name);

      const workflow: TeamWorkflow = {
        name: 'test-fail-agg',
        description: '실패 집계 테스트',
        steps: [
          { id: 's1', agentName: 'AgentA', description: 'A' },
        ],
      };

      const runner = new WorkflowRunner(makeContext(), factory);
      const result = await runner.execute(workflow);

      expect(result.success).toBe(false);
    });
  });

  describe('resolveOrder (위상 정렬)', () => {
    it('순환 참조가 있으면 에러를 던진다', () => {
      const runner = new WorkflowRunner(makeContext(), () => null);

      const steps = [
        { id: 'a', agentName: 'A', description: 'A', dependsOn: ['b'] },
        { id: 'b', agentName: 'B', description: 'B', dependsOn: ['a'] },
      ];

      expect(() => runner.resolveOrder(steps)).toThrow('circular');
    });

    it('dependsOn 순서를 올바르게 정렬한다', () => {
      const runner = new WorkflowRunner(makeContext(), () => null);

      const steps = [
        { id: 'c', agentName: 'C', description: 'C', dependsOn: ['b'] },
        { id: 'a', agentName: 'A', description: 'A' },
        { id: 'b', agentName: 'B', description: 'B', dependsOn: ['a'] },
      ];

      const ordered = runner.resolveOrder(steps);
      const ids = ordered.map((s) => s.id);

      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
    });
  });
});
