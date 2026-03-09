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
}

export interface AgentCallRecord {
  agentName: string;
  command: string;
  timestamp: string;
  durationMs: number;
  tokensUsed?: number;
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
