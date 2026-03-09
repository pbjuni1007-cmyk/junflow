import type { AgentContext, Agent } from '../agents/types.js';
import type { TeamWorkflow, WorkflowResult, StepResult, WorkflowStep } from './types.js';

export type AgentFactory = (agentName: string, context: AgentContext) => Agent<unknown, unknown> | null;

export class WorkflowRunner {
  constructor(
    private context: AgentContext,
    private agentFactory: AgentFactory,
  ) {}

  async execute(workflow: TeamWorkflow): Promise<WorkflowResult> {
    const results = new Map<string, StepResult>();
    const startTime = Date.now();

    const orderedSteps = this.resolveOrder(workflow.steps);

    for (const step of orderedSteps) {
      // 1. 선행 스텝 성공 여부 확인
      const depsFailed = (step.dependsOn ?? []).some((depId) => {
        const dep = results.get(depId);
        return !dep || !dep.success;
      });

      if (depsFailed) {
        results.set(step.id, {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: 'Skipped: dependency step failed',
          durationMs: 0,
        });
        if (!step.optional) {
          break;
        }
        continue;
      }

      // 2. inputMapping으로 이전 결과 → 현재 입력 변환
      const input = this.buildInput(step, results);

      // 3. 에이전트 인스턴스 생성
      const agent = this.agentFactory(step.agentName, this.context);

      if (!agent) {
        const stepResult: StepResult = {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: `Unknown agent: ${step.agentName}`,
          durationMs: 0,
        };
        results.set(step.id, stepResult);
        if (!step.optional) {
          break;
        }
        continue;
      }

      // 4. 에이전트 실행
      const stepStart = Date.now();
      try {
        const result = await agent.execute(input, this.context);
        const stepResult: StepResult = {
          stepId: step.id,
          agentName: step.agentName,
          success: result.success,
          data: result.success ? result.data : undefined,
          error: result.success ? undefined : result.error.message,
          durationMs: result.metadata.durationMs,
          tokensUsed: result.metadata.tokensUsed,
        };
        results.set(step.id, stepResult);

        if (!result.success && !step.optional) {
          break;
        }
      } catch (err) {
        const stepResult: StepResult = {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - stepStart,
        };
        results.set(step.id, stepResult);

        if (!step.optional) {
          break;
        }
      }
    }

    // 실행되지 않은 스텝은 skipped 처리
    for (const step of workflow.steps) {
      if (!results.has(step.id)) {
        results.set(step.id, {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: 'Skipped',
          durationMs: 0,
        });
      }
    }

    const allStepResults = Array.from(results.values());

    const success = allStepResults.every((r) => {
      if (r.success) return true;
      const step = workflow.steps.find((s) => s.id === r.stepId);
      return step?.optional === true;
    });

    return {
      workflow: workflow.name,
      steps: allStepResults,
      totalDurationMs: Date.now() - startTime,
      success,
    };
  }

  private buildInput(step: WorkflowStep, results: Map<string, StepResult>): unknown {
    if (!step.inputMapping || Object.keys(step.inputMapping).length === 0) {
      return {};
    }

    const input: Record<string, unknown> = {};

    for (const [inputKey, valueExpr] of Object.entries(step.inputMapping)) {
      // 값이 JSON 리터럴이면 파싱 시도
      try {
        input[inputKey] = JSON.parse(valueExpr);
        continue;
      } catch {
        // JSON 파싱 실패 → 경로 표현식으로 해석
      }

      // "stepId.field" 형태 경로 표현식
      const dotIdx = valueExpr.indexOf('.');
      if (dotIdx !== -1) {
        const stepId = valueExpr.slice(0, dotIdx);
        const field = valueExpr.slice(dotIdx + 1);
        const stepResult = results.get(stepId);
        if (stepResult?.success && stepResult.data !== undefined) {
          const data = stepResult.data as Record<string, unknown>;
          input[inputKey] = field === 'data' ? stepResult.data : data[field];
        }
      } else {
        input[inputKey] = valueExpr;
      }
    }

    return input;
  }

  /**
   * 위상 정렬로 실행 순서 결정 (Kahn's algorithm)
   */
  resolveOrder(steps: WorkflowStep[]): WorkflowStep[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>(); // id → 이 id에 의존하는 스텝들

    for (const step of steps) {
      if (!inDegree.has(step.id)) {
        inDegree.set(step.id, 0);
      }
      if (!dependents.has(step.id)) {
        dependents.set(step.id, []);
      }
    }

    for (const step of steps) {
      for (const dep of step.dependsOn ?? []) {
        inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
        const deps = dependents.get(dep) ?? [];
        deps.push(step.id);
        dependents.set(dep, deps);
      }
    }

    const queue = steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0);
    const ordered: WorkflowStep[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(current);

      for (const dependentId of dependents.get(current.id) ?? []) {
        const newDegree = (inDegree.get(dependentId) ?? 1) - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          const dep = stepMap.get(dependentId);
          if (dep) queue.push(dep);
        }
      }
    }

    if (ordered.length !== steps.length) {
      throw new Error('Workflow has circular dependency');
    }

    return ordered;
  }
}
