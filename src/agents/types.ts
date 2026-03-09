import { JunFlowConfig } from '../config/schema.js';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface AgentContext {
  workingDir: string;
  config: JunFlowConfig;
  logger: Logger;
}

export type AgentResult<T> =
  | { success: true; data: T; metadata: AgentMetadata }
  | { success: false; error: AgentError; metadata: AgentMetadata };

export interface AgentMetadata {
  agentName: string;
  durationMs: number;
  tokensUsed?: number;
}

export interface AgentError {
  code: 'AI_ERROR' | 'AI_PARSE_ERROR' | 'TRACKER_ERROR' | 'GIT_ERROR' | 'VALIDATION_ERROR' | 'CONFIG_ERROR' | 'NETWORK_ERROR';
  message: string;
  cause?: unknown;
}

export interface Agent<TInput, TOutput> {
  name: string;
  description: string;
  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

export function succeed<T>(
  agentName: string,
  data: T,
  durationMs: number,
  tokensUsed?: number,
): AgentResult<T> {
  return {
    success: true,
    data,
    metadata: { agentName, durationMs, tokensUsed },
  };
}

export function fail<T>(
  agentName: string,
  error: AgentError,
  durationMs: number,
): AgentResult<T> {
  return {
    success: false,
    error,
    metadata: { agentName, durationMs },
  };
}
