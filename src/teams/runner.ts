import type { AgentContext, Agent } from '../agents/types.js';
import type { TeamWorkflow, WorkflowResult, StepResult, WorkflowStep, WorkflowOptions, StepStatus } from './types.js';
import type { CliWorkerConfig, WorkerResult } from '../orchestrator/types.js';
import { topologicalSort } from '../dag/topology.js';

export type AgentFactory = (agentName: string, context: AgentContext) =>
  Agent<unknown, unknown> | CliWorkerConfig | null;

export class WorkflowRunner {
  constructor(
    private context: AgentContext,
    private agentFactory: AgentFactory,
  ) {}

  async execute(workflow: TeamWorkflow, options: WorkflowOptions = {}): Promise<WorkflowResult> {
    const { onProgress, signal, maxRetries = 0 } = options;
    const results = new Map<string, StepResult>();
    const startTime = Date.now();

    // 취소 체크
    if (signal?.aborted) {
      return this.buildAbortedResult(workflow, results, startTime);
    }

    const stepMap = new Map(workflow.steps.map((s) => [s.id, s]));

    const dagNodes = workflow.steps.map((s) => ({
      id: s.id,
      dependsOn: s.dependsOn ?? [],
    }));
    const levels = topologicalSort(dagNodes);

    let aborted = false;

    for (const level of levels) {
      if (aborted) break;

      // AbortSignal 체크
      if (signal?.aborted) {
        aborted = true;
        break;
      }

      const levelSteps = level
        .map((id) => stepMap.get(id))
        .filter((s): s is WorkflowStep => s !== undefined);

      // 같은 레벨의 스텝들을 Promise.all로 병렬 실행
      const levelResults = await Promise.all(
        levelSteps.map((step) =>
          this.executeStepWithRetry(step, results, maxRetries, onProgress, signal),
        ),
      );

      // 결과를 results 맵에 저장하고 abort 여부 판단
      for (let i = 0; i < levelSteps.length; i++) {
        const step = levelSteps[i]!;
        const stepResult = levelResults[i]!;
        results.set(step.id, stepResult);

        if (!stepResult.success && !step.optional) {
          aborted = true;
        }
      }
    }

    // 실행되지 않은 스텝은 skipped 처리
    for (const step of workflow.steps) {
      if (!results.has(step.id)) {
        const skippedResult: StepResult = {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: signal?.aborted ? 'Aborted' : 'Skipped',
          durationMs: 0,
        };
        results.set(step.id, skippedResult);
        onProgress?.(step.id, 'skipped');
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

  private async executeStepWithRetry(
    step: WorkflowStep,
    results: Map<string, StepResult>,
    maxRetries: number,
    onProgress?: (stepId: string, status: StepStatus) => void,
    signal?: AbortSignal,
  ): Promise<StepResult> {
    let lastResult: StepResult | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        return {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: 'Aborted',
          durationMs: 0,
        };
      }

      if (attempt > 0) {
        onProgress?.(step.id, 'retrying');
      }

      lastResult = await this.executeStep(step, results, onProgress, signal);

      if (lastResult.success) {
        return lastResult;
      }

      // 의존성 실패로 인한 skip은 재시도 불가
      if (lastResult.error?.startsWith('Skipped:')) {
        return lastResult;
      }
    }

    return lastResult!;
  }

  private async executeStep(
    step: WorkflowStep,
    results: Map<string, StepResult>,
    onProgress?: (stepId: string, status: StepStatus) => void,
    signal?: AbortSignal,
  ): Promise<StepResult> {
    // 1. 선행 스텝 성공 여부 확인
    const depsFailed = (step.dependsOn ?? []).some((depId) => {
      const dep = results.get(depId);
      return !dep || !dep.success;
    });

    if (depsFailed) {
      onProgress?.(step.id, 'skipped');
      return {
        stepId: step.id,
        agentName: step.agentName,
        success: false,
        error: 'Skipped: dependency step failed',
        durationMs: 0,
      };
    }

    // 2. inputMapping으로 이전 결과 → 현재 입력 변환
    const input = this.buildInput(step, results);

    // 3. 에이전트 또는 CLI 워커 인스턴스 생성
    const target = this.agentFactory(step.agentName, this.context);

    if (!target) {
      onProgress?.(step.id, 'failed');
      return {
        stepId: step.id,
        agentName: step.agentName,
        success: false,
        error: `Unknown agent: ${step.agentName}`,
        durationMs: 0,
      };
    }

    // 4. 실행
    onProgress?.(step.id, 'running');
    const stepStart = Date.now();

    try {
      // CLI 워커인 경우
      if (this.isCliWorkerConfig(target)) {
        const result = await this.executeCliWorker(target, signal);
        const status: StepStatus = result.success ? 'completed' : 'failed';
        onProgress?.(step.id, status);
        return { ...result, stepId: step.id, agentName: step.agentName };
      }

      // 일반 에이전트인 경우
      if (signal?.aborted) {
        onProgress?.(step.id, 'failed');
        return {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: 'Aborted',
          durationMs: Date.now() - stepStart,
        };
      }

      const result = await (target as Agent<unknown, unknown>).execute(input, this.context);
      const status: StepStatus = result.success ? 'completed' : 'failed';
      onProgress?.(step.id, status);
      return {
        stepId: step.id,
        agentName: step.agentName,
        success: result.success,
        data: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error.message,
        durationMs: result.metadata.durationMs,
        tokensUsed: result.metadata.tokensUsed,
      };
    } catch (err) {
      onProgress?.(step.id, 'failed');
      return {
        stepId: step.id,
        agentName: step.agentName,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - stepStart,
      };
    }
  }

  private isCliWorkerConfig(target: unknown): target is CliWorkerConfig {
    return (
      typeof target === 'object' &&
      target !== null &&
      'type' in target &&
      (target as CliWorkerConfig).type === 'cli-worker'
    );
  }

  private async executeCliWorker(
    config: CliWorkerConfig,
    signal?: AbortSignal,
  ): Promise<StepResult> {
    const startTime = Date.now();

    if (signal?.aborted) {
      return {
        stepId: '',
        agentName: config.cli,
        success: false,
        error: 'Aborted',
        durationMs: 0,
      };
    }

    try {
      // 동적 import로 CliRunner 로드 (순환 의존 방지)
      const { CliRunner } = await import('../orchestrator/cli-runner.js');
      const runner = new CliRunner();
      const result: WorkerResult = await runner.spawn(config.cli, config.prompt, config.options);

      return {
        stepId: '',
        agentName: config.cli,
        success: result.exitCode === 0 && !result.timedOut,
        data: result.output,
        error: result.exitCode !== 0 ? `CLI exited with code ${result.exitCode}` : undefined,
        durationMs: result.durationMs,
      };
    } catch (err) {
      return {
        stepId: '',
        agentName: config.cli,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
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

  private buildAbortedResult(
    workflow: TeamWorkflow,
    results: Map<string, StepResult>,
    startTime: number,
  ): WorkflowResult {
    for (const step of workflow.steps) {
      if (!results.has(step.id)) {
        results.set(step.id, {
          stepId: step.id,
          agentName: step.agentName,
          success: false,
          error: 'Aborted',
          durationMs: 0,
        });
      }
    }
    return {
      workflow: workflow.name,
      steps: Array.from(results.values()),
      totalDurationMs: Date.now() - startTime,
      success: false,
    };
  }
}
