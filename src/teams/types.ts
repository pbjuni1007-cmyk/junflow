export interface TeamWorkflow {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  agentName: string;
  description: string;
  dependsOn?: string[];
  inputMapping?: Record<string, string>;
  optional?: boolean;
}

/** 워크플로우 실행 옵션 */
export interface WorkflowOptions {
  /** 스텝 상태 변경 시 호출되는 콜백 */
  onProgress?: (stepId: string, status: StepStatus) => void;
  /** 워크플로우 취소를 위한 AbortSignal */
  signal?: AbortSignal;
  /** 실패한 스텝의 최대 재시도 횟수 (기본 0) */
  maxRetries?: number;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';

export interface WorkflowResult {
  workflow: string;
  steps: StepResult[];
  totalDurationMs: number;
  success: boolean;
}

export interface StepResult {
  stepId: string;
  agentName: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  tokensUsed?: number;
}
