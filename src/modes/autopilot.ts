import type { AIProvider } from '../ai/types.js';
import type { AgentContext } from '../agents/types.js';
import type { WorkflowResult } from '../teams/types.js';
import { WorkflowRunner } from '../teams/runner.js';
import { autopilotWorkflow } from '../teams/presets.js';
import { createAgentFactory } from '../teams/agent-factory.js';
import { ExecutionMode } from './types.js';
import type { ModeState } from './types.js';

export interface AutopilotOptions {
  issueId?: string;
  dryRun?: boolean;
}

export interface AutopilotResult {
  workflowResult: WorkflowResult;
  state: ModeState;
}

/**
 * Autopilot 모드: 이슈 분석 → 브랜치 → 커밋 → 리뷰 → 검증 전체 사이클을
 * autopilotWorkflow DAG 프리셋으로 자동 실행한다.
 */
export async function runAutopilot(
  aiProvider: AIProvider,
  context: AgentContext,
  options: AutopilotOptions = {},
): Promise<AutopilotResult> {
  const state: ModeState = {
    mode: ExecutionMode.AUTOPILOT,
    phase: 'initializing',
    iteration: 0,
    startedAt: new Date().toISOString(),
    results: {},
    resumable: false,
  };

  if (options.issueId) {
    state.results['issueId'] = options.issueId;
  }

  const agentFactory = createAgentFactory(aiProvider);
  const runner = new WorkflowRunner(context, agentFactory);

  state.phase = 'executing';
  const workflowResult = await runner.execute(autopilotWorkflow);

  state.phase = workflowResult.success ? 'completed' : 'failed';
  state.results['workflow'] = {
    name: workflowResult.workflow,
    success: workflowResult.success,
    totalDurationMs: workflowResult.totalDurationMs,
    stepsCompleted: workflowResult.steps.filter((s) => s.success).length,
    stepsTotal: workflowResult.steps.length,
  };

  return { workflowResult, state };
}
