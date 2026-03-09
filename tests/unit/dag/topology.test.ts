import { describe, it, expect } from 'vitest';
import { detectCycle, topologicalSort, validateDAG, DAGNode } from '../../../src/dag/topology.js';

describe('detectCycle', () => {
  it('순환 없는 DAG → null 반환', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: [] },
      { id: 't3', dependsOn: ['t1', 't2'] },
      { id: 't4', dependsOn: ['t3'] },
    ];
    expect(detectCycle(nodes)).toBeNull();
  });

  it('직접 순환 (A→B→A) → 순환 노드 반환', () => {
    const nodes: DAGNode[] = [
      { id: 'A', dependsOn: ['B'] },
      { id: 'B', dependsOn: ['A'] },
    ];
    const result = detectCycle(nodes);
    expect(result).not.toBeNull();
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('간접 순환 (A→B→C→A) → 순환 노드 반환', () => {
    const nodes: DAGNode[] = [
      { id: 'A', dependsOn: ['C'] },
      { id: 'B', dependsOn: ['A'] },
      { id: 'C', dependsOn: ['B'] },
    ];
    const result = detectCycle(nodes);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
  });

  it('자기 참조 (A→A) → 순환 감지', () => {
    const nodes: DAGNode[] = [
      { id: 'A', dependsOn: ['A'] },
    ];
    const result = detectCycle(nodes);
    expect(result).not.toBeNull();
    expect(result).toContain('A');
  });

  it('빈 노드 목록 → null', () => {
    expect(detectCycle([])).toBeNull();
  });

  it('독립 노드만 있는 경우 → null', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: [] },
    ];
    expect(detectCycle(nodes)).toBeNull();
  });
});

describe('topologicalSort', () => {
  it('독립 노드들 → 모두 레벨 0', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: [] },
      { id: 't3', dependsOn: [] },
    ];
    const levels = topologicalSort(nodes);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toHaveLength(3);
    expect(levels[0]).toContain('t1');
    expect(levels[0]).toContain('t2');
    expect(levels[0]).toContain('t3');
  });

  it('순차 체인 (t1→t2→t3) → 각각 별도 레벨', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: ['t1'] },
      { id: 't3', dependsOn: ['t2'] },
    ];
    const levels = topologicalSort(nodes);
    expect(levels).toHaveLength(3);
    expect(levels[0]).toContain('t1');
    expect(levels[1]).toContain('t2');
    expect(levels[2]).toContain('t3');
  });

  it('다이아몬드 DAG → 올바른 레벨', () => {
    // t1 → t2, t3 → t4
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: ['t1'] },
      { id: 't3', dependsOn: ['t1'] },
      { id: 't4', dependsOn: ['t2', 't3'] },
    ];
    const levels = topologicalSort(nodes);
    expect(levels).toHaveLength(3);
    expect(levels[0]).toEqual(['t1']);
    expect(levels[1]).toContain('t2');
    expect(levels[1]).toContain('t3');
    expect(levels[2]).toEqual(['t4']);
  });

  it('빈 노드 목록 → 빈 배열', () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it('작업 명세서 예시 DAG: [t1,t2] → [t3] → [t4]', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: [] },
      { id: 't3', dependsOn: ['t1', 't2'] },
      { id: 't4', dependsOn: ['t3'] },
    ];
    const levels = topologicalSort(nodes);
    expect(levels).toHaveLength(3);
    expect(levels[0]).toContain('t1');
    expect(levels[0]).toContain('t2');
    expect(levels[1]).toEqual(['t3']);
    expect(levels[2]).toEqual(['t4']);
  });
});

describe('validateDAG', () => {
  it('유효한 DAG → valid: true, errors: []', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't2', dependsOn: ['t1'] },
    ];
    const result = validateDAG(nodes);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('존재하지 않는 의존성 → 에러 포함', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: [] },
      { id: 't3', dependsOn: ['t5'] }, // t5는 존재하지 않음
    ];
    const result = validateDAG(nodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('t5'))).toBe(true);
    expect(result.errors.some((e) => e.includes('t3'))).toBe(true);
  });

  it('순환 참조 → 에러 포함', () => {
    const nodes: DAGNode[] = [
      { id: 't1', dependsOn: ['t2'] },
      { id: 't2', dependsOn: ['t1'] },
    ];
    const result = validateDAG(nodes);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('빈 노드 목록 → valid: true', () => {
    const result = validateDAG([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
