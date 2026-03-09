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
