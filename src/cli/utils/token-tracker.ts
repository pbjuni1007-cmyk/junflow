import fs from 'fs/promises';
import path from 'path';

export interface TokenUsageEntry {
  agentName: string;
  tokensUsed: number;
  timestamp: string;
}

export interface SessionTokenSummary {
  byAgent: Record<string, { calls: number; tokens: number; estimatedCost: number }>;
  total: { calls: number; tokens: number; estimatedCost: number };
}

const TOKEN_FILE = '.junflow/session-tokens.json';
// Claude Sonnet 기준 평균 $9/1M tokens (input $3 + output $15 평균)
const COST_PER_TOKEN = 9 / 1_000_000;

function getTokenFilePath(cwd: string): string {
  return path.join(cwd, TOKEN_FILE);
}

export async function trackTokenUsage(
  entry: TokenUsageEntry,
  cwd: string = process.cwd(),
): Promise<void> {
  const filePath = getTokenFilePath(cwd);

  let entries: TokenUsageEntry[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    entries = JSON.parse(content) as TokenUsageEntry[];
  } catch {
    // 파일 없으면 빈 배열로 시작
  }

  entries.push(entry);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function getSessionTokenSummary(
  cwd: string = process.cwd(),
): Promise<SessionTokenSummary> {
  const filePath = getTokenFilePath(cwd);

  let entries: TokenUsageEntry[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    entries = JSON.parse(content) as TokenUsageEntry[];
  } catch {
    // 파일 없으면 빈 요약 반환
  }

  const byAgent: Record<string, { calls: number; tokens: number; estimatedCost: number }> = {};

  for (const entry of entries) {
    if (!byAgent[entry.agentName]) {
      byAgent[entry.agentName] = { calls: 0, tokens: 0, estimatedCost: 0 };
    }
    byAgent[entry.agentName]!.calls += 1;
    byAgent[entry.agentName]!.tokens += entry.tokensUsed;
    byAgent[entry.agentName]!.estimatedCost += entry.tokensUsed * COST_PER_TOKEN;
  }

  const totalTokens = entries.reduce((sum, e) => sum + e.tokensUsed, 0);
  const total = {
    calls: entries.length,
    tokens: totalTokens,
    estimatedCost: totalTokens * COST_PER_TOKEN,
  };

  return { byAgent, total };
}
