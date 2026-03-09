import { describe, it, expect } from 'vitest';
import { PRESETS, fullDevWorkflow, quickCommitWorkflow, deepReviewWorkflow } from '../../../src/teams/presets.js';
import type { TeamWorkflow } from '../../../src/teams/types.js';

function getAllStepIds(workflow: TeamWorkflow): Set<string> {
  return new Set(workflow.steps.map((s) => s.id));
}

function hasCycle(workflow: TeamWorkflow): boolean {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const step of workflow.steps) {
    inDegree.set(step.id, 0);
    dependents.set(step.id, []);
  }

  for (const step of workflow.steps) {
    for (const dep of step.dependsOn ?? []) {
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
      dependents.get(dep)?.push(step.id);
    }
  }

  const queue = workflow.steps.filter((s) => (inDegree.get(s.id) ?? 0) === 0);
  let visited = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    for (const depId of dependents.get(current.id) ?? []) {
      const newDeg = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, newDeg);
      if (newDeg === 0) {
        const dep = workflow.steps.find((s) => s.id === depId);
        if (dep) queue.push(dep);
      }
    }
  }

  return visited !== workflow.steps.length;
}

describe('PRESETS', () => {
  it('full-dev, quick-commit, deep-review 세 프리셋이 존재한다', () => {
    expect(PRESETS).toHaveProperty('full-dev');
    expect(PRESETS).toHaveProperty('quick-commit');
    expect(PRESETS).toHaveProperty('deep-review');
  });

  it('각 프리셋은 name, description, steps 필드를 갖는다', () => {
    for (const [key, workflow] of Object.entries(PRESETS)) {
      expect(workflow.name, `${key}.name`).toBeTruthy();
      expect(workflow.description, `${key}.description`).toBeTruthy();
      expect(Array.isArray(workflow.steps), `${key}.steps`).toBe(true);
      expect(workflow.steps.length, `${key} step count`).toBeGreaterThan(0);
    }
  });

  it('각 스텝은 id, agentName, description 필드를 갖는다', () => {
    for (const [key, workflow] of Object.entries(PRESETS)) {
      for (const step of workflow.steps) {
        expect(step.id, `${key} step.id`).toBeTruthy();
        expect(step.agentName, `${key} step.agentName`).toBeTruthy();
        expect(step.description, `${key} step.description`).toBeTruthy();
      }
    }
  });
});

describe('dependsOn 참조 유효성', () => {
  it('모든 dependsOn 참조가 동일 워크플로우의 스텝 ID를 가리킨다', () => {
    for (const [key, workflow] of Object.entries(PRESETS)) {
      const ids = getAllStepIds(workflow);
      for (const step of workflow.steps) {
        for (const dep of step.dependsOn ?? []) {
          expect(ids.has(dep), `${key}: step '${step.id}' dependsOn '${dep}' not found`).toBe(true);
        }
      }
    }
  });

  it('스텝 ID는 워크플로우 내에서 중복되지 않는다', () => {
    for (const [key, workflow] of Object.entries(PRESETS)) {
      const ids = workflow.steps.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size, `${key} has duplicate step IDs`).toBe(ids.length);
    }
  });
});

describe('순환 참조 없음', () => {
  it('full-dev 워크플로우에 순환 참조가 없다', () => {
    expect(hasCycle(fullDevWorkflow)).toBe(false);
  });

  it('quick-commit 워크플로우에 순환 참조가 없다', () => {
    expect(hasCycle(quickCommitWorkflow)).toBe(false);
  });

  it('deep-review 워크플로우에 순환 참조가 없다', () => {
    expect(hasCycle(deepReviewWorkflow)).toBe(false);
  });

  it('모든 프리셋에 순환 참조가 없다', () => {
    for (const [key, workflow] of Object.entries(PRESETS)) {
      expect(hasCycle(workflow), `${key} has cycle`).toBe(false);
    }
  });
});

describe('full-dev 프리셋 구조', () => {
  it('analyze → branch → review 순서로 스텝이 정의된다', () => {
    const ids = fullDevWorkflow.steps.map((s) => s.id);
    expect(ids).toEqual(['analyze', 'branch', 'review']);
  });

  it('branch 스텝은 analyze에 의존한다', () => {
    const branch = fullDevWorkflow.steps.find((s) => s.id === 'branch');
    expect(branch?.dependsOn).toContain('analyze');
  });

  it('review 스텝은 optional이다', () => {
    const review = fullDevWorkflow.steps.find((s) => s.id === 'review');
    expect(review?.optional).toBe(true);
  });
});

describe('quick-commit 프리셋 구조', () => {
  it('commit, review 스텝이 존재한다', () => {
    const ids = quickCommitWorkflow.steps.map((s) => s.id);
    expect(ids).toContain('commit');
    expect(ids).toContain('review');
  });

  it('review 스텝은 optional이다', () => {
    const review = quickCommitWorkflow.steps.find((s) => s.id === 'review');
    expect(review?.optional).toBe(true);
  });
});

describe('deep-review 프리셋 구조', () => {
  it('security, performance, readability 스텝이 존재한다', () => {
    const ids = deepReviewWorkflow.steps.map((s) => s.id);
    expect(ids).toContain('security');
    expect(ids).toContain('performance');
    expect(ids).toContain('readability');
  });

  it('각 스텝은 focusAreas inputMapping을 갖는다', () => {
    for (const step of deepReviewWorkflow.steps) {
      expect(step.inputMapping).toHaveProperty('focusAreas');
    }
  });

  it('세 스텝 모두 독립적이다 (dependsOn 없음)', () => {
    for (const step of deepReviewWorkflow.steps) {
      expect(!step.dependsOn || step.dependsOn.length === 0).toBe(true);
    }
  });
});
