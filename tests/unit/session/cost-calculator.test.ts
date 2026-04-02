import { describe, it, expect } from 'vitest';
import {
  getModelPricing,
  estimateCost,
  buildCostReport,
  getAvailableModels,
} from '../../../src/session/cost-calculator.js';

describe('getModelPricing()', () => {
  it('정확한 모델명을 매칭한다', () => {
    const pricing = getModelPricing('claude-sonnet');
    expect(pricing.inputPerMillion).toBe(3);
    expect(pricing.outputPerMillion).toBe(15);
  });

  it('claude-haiku 매칭', () => {
    const pricing = getModelPricing('claude-haiku');
    expect(pricing.inputPerMillion).toBe(0.25);
  });

  it('claude-opus 매칭', () => {
    const pricing = getModelPricing('claude-opus');
    expect(pricing.inputPerMillion).toBe(15);
  });

  it('gpt-4o 매칭', () => {
    const pricing = getModelPricing('gpt-4o');
    expect(pricing.inputPerMillion).toBe(2.5);
  });

  it('gemini-flash 매칭', () => {
    const pricing = getModelPricing('gemini-flash');
    expect(pricing.inputPerMillion).toBe(0.075);
  });

  it('부분 매칭으로 모델을 찾는다', () => {
    const pricing = getModelPricing('claude-sonnet-4');
    expect(pricing.inputPerMillion).toBe(3);
  });

  it('대소문자 무시', () => {
    const pricing = getModelPricing('Claude-Sonnet');
    expect(pricing.inputPerMillion).toBe(3);
  });

  it('알 수 없는 모델은 기본 단가 반환', () => {
    const pricing = getModelPricing('unknown-model-xyz');
    expect(pricing.inputPerMillion).toBe(3); // default = sonnet 기준
  });

  it('model이 undefined면 기본 단가 반환', () => {
    const pricing = getModelPricing(undefined);
    expect(pricing.inputPerMillion).toBe(3);
  });
});

describe('estimateCost()', () => {
  it('0 토큰이면 비용 0', () => {
    expect(estimateCost(0)).toBe(0);
  });

  it('1M 토큰 기본 모델: input 60% * $3 + output 40% * $15 = $7.8', () => {
    const cost = estimateCost(1_000_000);
    expect(cost).toBeCloseTo(7.8, 1);
  });

  it('haiku는 더 저렴하다', () => {
    const haikuCost = estimateCost(1000, 'claude-haiku');
    const sonnetCost = estimateCost(1000, 'claude-sonnet');
    expect(haikuCost).toBeLessThan(sonnetCost);
  });

  it('opus는 더 비싸다', () => {
    const opusCost = estimateCost(1000, 'claude-opus');
    const sonnetCost = estimateCost(1000, 'claude-sonnet');
    expect(opusCost).toBeGreaterThan(sonnetCost);
  });

  it('특정 토큰 수에 대한 비용이 양수다', () => {
    expect(estimateCost(5000, 'gpt-4o')).toBeGreaterThan(0);
  });
});

describe('buildCostReport()', () => {
  it('빈 입력에 대해 빈 리포트 반환', () => {
    const report = buildCostReport([]);
    expect(report.agents).toHaveLength(0);
    expect(report.total.tokens).toBe(0);
    expect(report.total.cost).toBe(0);
  });

  it('단일 에이전트 리포트', () => {
    const report = buildCostReport([
      { agentName: 'CodeReviewer', model: 'claude-sonnet', tokensUsed: 10000 },
    ]);

    expect(report.agents).toHaveLength(1);
    expect(report.agents[0]!.agentName).toBe('CodeReviewer');
    expect(report.agents[0]!.tokens).toBe(10000);
    expect(report.agents[0]!.calls).toBe(1);
    expect(report.agents[0]!.cost).toBeGreaterThan(0);
    expect(report.total.tokens).toBe(10000);
  });

  it('같은 에이전트 여러 호출을 합산한다', () => {
    const report = buildCostReport([
      { agentName: 'CodeReviewer', tokensUsed: 5000 },
      { agentName: 'CodeReviewer', tokensUsed: 3000 },
    ]);

    expect(report.agents).toHaveLength(1);
    expect(report.agents[0]!.tokens).toBe(8000);
    expect(report.agents[0]!.calls).toBe(2);
  });

  it('여러 에이전트를 개별 집계한다', () => {
    const report = buildCostReport([
      { agentName: 'CodeReviewer', model: 'claude-sonnet', tokensUsed: 10000 },
      { agentName: 'CommitWriter', model: 'claude-haiku', tokensUsed: 3000 },
      { agentName: 'Verifier', model: 'claude-haiku', tokensUsed: 1500 },
    ]);

    expect(report.agents).toHaveLength(3);
    expect(report.total.tokens).toBe(14500);
    expect(report.total.calls).toBe(3);
    expect(report.total.cost).toBeGreaterThan(0);
  });

  it('tokensUsed가 없으면 0으로 처리', () => {
    const report = buildCostReport([
      { agentName: 'CodeReviewer' },
    ]);

    expect(report.agents[0]!.tokens).toBe(0);
    expect(report.agents[0]!.cost).toBe(0);
  });

  it('total.cost는 개별 agent cost의 합이다', () => {
    const report = buildCostReport([
      { agentName: 'A', model: 'claude-opus', tokensUsed: 10000 },
      { agentName: 'B', model: 'claude-haiku', tokensUsed: 5000 },
    ]);

    const sumCost = report.agents.reduce((s, a) => s + a.cost, 0);
    expect(report.total.cost).toBeCloseTo(sumCost, 10);
  });
});

describe('getAvailableModels()', () => {
  it('최소 5개 모델이 등록되어 있다', () => {
    const models = getAvailableModels();
    expect(models.length).toBeGreaterThanOrEqual(5);
  });

  it('claude-sonnet이 포함되어 있다', () => {
    expect(getAvailableModels()).toContain('claude-sonnet');
  });

  it('gpt-4o가 포함되어 있다', () => {
    expect(getAvailableModels()).toContain('gpt-4o');
  });

  it('gemini-pro가 포함되어 있다', () => {
    expect(getAvailableModels()).toContain('gemini-pro');
  });
});
