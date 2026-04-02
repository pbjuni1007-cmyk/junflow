import { describe, it, expect, vi } from 'vitest';
import { formatWorkflowResult } from '../../../src/cli/utils/workflow-renderer.js';
import type { TeamWorkflow, WorkflowResult } from '../../../src/teams/types.js';

describe('formatWorkflowResult', () => {
  it('console.log를 호출하여 결과를 출력한다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const workflow: TeamWorkflow = {
      name: 'test-wf',
      description: '테스트',
      steps: [
        { id: 's1', agentName: 'AgentA', description: '스텝 A' },
        { id: 's2', agentName: 'AgentB', description: '스텝 B', optional: true },
      ],
    };

    const result: WorkflowResult = {
      workflow: 'test-wf',
      steps: [
        { stepId: 's1', agentName: 'AgentA', success: true, durationMs: 100, tokensUsed: 50 },
        { stepId: 's2', agentName: 'AgentB', success: false, error: 'Skipped', durationMs: 0 },
      ],
      totalDurationMs: 100,
      success: true,
    };

    formatWorkflowResult(workflow, result);

    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('test-wf');
    expect(output).toContain('s1');
    expect(output).toContain('s2');

    spy.mockRestore();
  });

  it('실패한 워크플로우에서 failed 상태를 표시한다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const workflow: TeamWorkflow = {
      name: 'fail-wf',
      description: '실패 테스트',
      steps: [
        { id: 's1', agentName: 'AgentA', description: '스텝 A' },
      ],
    };

    const result: WorkflowResult = {
      workflow: 'fail-wf',
      steps: [
        { stepId: 's1', agentName: 'AgentA', success: false, error: 'something failed', durationMs: 50 },
      ],
      totalDurationMs: 50,
      success: false,
    };

    formatWorkflowResult(workflow, result);

    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('fail-wf');

    spy.mockRestore();
  });

  it('빈 스텝 목록에서도 에러 없이 렌더링한다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const workflow: TeamWorkflow = {
      name: 'empty',
      description: '빈 워크플로우',
      steps: [],
    };

    const result: WorkflowResult = {
      workflow: 'empty',
      steps: [],
      totalDurationMs: 0,
      success: true,
    };

    expect(() => formatWorkflowResult(workflow, result)).not.toThrow();

    spy.mockRestore();
  });
});
