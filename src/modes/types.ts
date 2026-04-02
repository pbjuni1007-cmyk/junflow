export enum ExecutionMode {
  SINGLE = 'single',
  WORKFLOW = 'workflow',
  AUTOPILOT = 'autopilot',
}

export interface ModeState {
  mode: ExecutionMode;
  phase: string;
  iteration: number;
  startedAt: string;
  results: Record<string, unknown>;
  resumable: boolean;
}
