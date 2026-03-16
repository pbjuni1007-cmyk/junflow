import { trackTokenUsage } from '../../utils/token-tracker.js';
import { sessionManager } from '../../../session/index.js';
import type { AgentResult } from '../../../agents/types.js';

export async function recordAgentResult(
  agentName: string,
  command: string,
  result: AgentResult<unknown>,
  cwd: string,
): Promise<void> {
  if (result.metadata.tokensUsed) {
    await trackTokenUsage(
      {
        agentName,
        tokensUsed: result.metadata.tokensUsed,
        timestamp: new Date().toISOString(),
      },
      cwd,
    ).catch(() => {/* 토큰 추적 실패는 무시 */});
  }
  const errorMsg = !result.success ? result.error.message : undefined;
  await sessionManager.recordAgentCall({
    agentName,
    command,
    timestamp: new Date().toISOString(),
    durationMs: result.metadata.durationMs,
    tokensUsed: result.metadata.tokensUsed,
    success: result.success,
    error: errorMsg,
  }).catch(() => {});
}
