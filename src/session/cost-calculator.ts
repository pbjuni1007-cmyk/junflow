export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * 모델별 토큰 단가 테이블 (USD per 1M tokens)
 * 2026년 4월 기준 공개 가격
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude
  'claude-opus': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  // OpenAI
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1-nano': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  // Gemini
  'gemini-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
  'gemini-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
};

// 모델명이 불분명할 때 사용하는 기본 단가 (Sonnet 평균 기준)
const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 3, outputPerMillion: 15 };

// input:output 비율을 모르면 평균으로 추정 (input 60%, output 40%)
const INPUT_RATIO = 0.6;
const OUTPUT_RATIO = 0.4;

export function getModelPricing(model?: string): ModelPricing {
  if (!model) return DEFAULT_PRICING;

  const normalized = model.toLowerCase();

  // 정확한 매칭 먼저
  if (MODEL_PRICING[normalized]) return MODEL_PRICING[normalized]!;

  // 부분 매칭
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

export function estimateCost(tokens: number, model?: string): number {
  const pricing = getModelPricing(model);
  const inputTokens = tokens * INPUT_RATIO;
  const outputTokens = tokens * OUTPUT_RATIO;
  return (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
}

export interface AgentCostEntry {
  agentName: string;
  model?: string;
  tokens: number;
  calls: number;
  cost: number;
}

export interface CostReport {
  agents: AgentCostEntry[];
  total: {
    tokens: number;
    calls: number;
    cost: number;
  };
}

export function buildCostReport(
  agentData: Array<{ agentName: string; model?: string; tokensUsed?: number }>,
): CostReport {
  const agentMap = new Map<string, AgentCostEntry>();

  for (const record of agentData) {
    const tokens = record.tokensUsed ?? 0;
    const key = record.agentName;
    const existing = agentMap.get(key);

    if (existing) {
      existing.tokens += tokens;
      existing.calls += 1;
      existing.cost += estimateCost(tokens, record.model);
    } else {
      agentMap.set(key, {
        agentName: record.agentName,
        model: record.model,
        tokens,
        calls: 1,
        cost: estimateCost(tokens, record.model),
      });
    }
  }

  const agents = Array.from(agentMap.values());
  const total = {
    tokens: agents.reduce((sum, a) => sum + a.tokens, 0),
    calls: agents.reduce((sum, a) => sum + a.calls, 0),
    cost: agents.reduce((sum, a) => sum + a.cost, 0),
  };

  return { agents, total };
}

export function getAvailableModels(): string[] {
  return Object.keys(MODEL_PRICING);
}
