export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStepState {
  stepId: string;
  status: WorkflowStepStatus;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
}

export interface WorkflowState {
  workflowName: string;
  mode: string;
  phase: string;
  steps: WorkflowStepState[];
  resumable: boolean;
}

export interface Session {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'interrupted';
  workingDir: string;
  branch?: string;
  issue?: {
    id: string;
    title: string;
    type: string;
    branch: string;
  };
  agentCalls: AgentCallRecord[];
  tokenUsage: {
    total: number;
    byAgent: Record<string, { calls: number; tokens: number }>;
  };
  workflowState?: WorkflowState;
}

export interface AgentCallRecord {
  agentName: string;
  command: string;
  timestamp: string;
  durationMs: number;
  tokensUsed?: number;
  model?: string;
  success: boolean;
  error?: string;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  branch?: string;
  issueTitle?: string;
  totalAgentCalls: number;
  totalTokens: number;
}
