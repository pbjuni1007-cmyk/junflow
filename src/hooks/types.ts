export type HookEvent =
  | 'pre-start'
  | 'post-start'
  | 'pre-commit'
  | 'post-commit'
  | 'pre-review'
  | 'post-review';

export interface HookDefinition {
  event: HookEvent;
  command: string;
  description?: string;
  continueOnError?: boolean;
}

export interface HookResult {
  event: HookEvent;
  command: string;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}
