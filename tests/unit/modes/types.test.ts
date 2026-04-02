import { describe, it, expect } from 'vitest';
import { ExecutionMode } from '../../../src/modes/types.js';

describe('ExecutionMode', () => {
  it('SINGLE, WORKFLOW, AUTOPILOT 세 모드가 정의된다', () => {
    expect(ExecutionMode.SINGLE).toBe('single');
    expect(ExecutionMode.WORKFLOW).toBe('workflow');
    expect(ExecutionMode.AUTOPILOT).toBe('autopilot');
  });

  it('모든 모드 값이 고유하다', () => {
    const values = Object.values(ExecutionMode);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
