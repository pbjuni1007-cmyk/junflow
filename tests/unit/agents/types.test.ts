import { describe, it, expect } from 'vitest';
import { succeed, fail, AgentResult, AgentError } from '../../../src/agents/types.js';

describe('succeed()', () => {
  it('성공 결과를 생성한다', () => {
    const result = succeed('TestAgent', { value: 42 }, 100);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ value: 42 });
      expect(result.metadata.agentName).toBe('TestAgent');
      expect(result.metadata.durationMs).toBe(100);
      expect(result.metadata.tokensUsed).toBeUndefined();
    }
  });

  it('tokensUsed가 있을 때 메타데이터에 포함된다', () => {
    const result = succeed('TestAgent', 'data', 200, 500);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metadata.tokensUsed).toBe(500);
    }
  });

  it('success === true이면 data 필드가 존재한다', () => {
    const result: AgentResult<string> = succeed('Agent', 'hello', 50);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('hello');
    }
  });
});

describe('fail()', () => {
  it('실패 결과를 생성한다', () => {
    const error: AgentError = { code: 'AI_ERROR', message: 'something went wrong' };
    const result = fail('TestAgent', error, 150);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AI_ERROR');
      expect(result.error.message).toBe('something went wrong');
      expect(result.metadata.agentName).toBe('TestAgent');
      expect(result.metadata.durationMs).toBe(150);
    }
  });

  it('cause를 포함한 에러를 생성한다', () => {
    const cause = new Error('root cause');
    const error: AgentError = { code: 'NETWORK_ERROR', message: 'net fail', cause };
    const result = fail<string>('Agent', error, 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.cause).toBe(cause);
    }
  });

  it('success === false이면 error 필드가 존재한다', () => {
    const result: AgentResult<number> = fail('Agent', { code: 'GIT_ERROR', message: 'git fail' }, 10);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

describe('AgentResult discriminated union', () => {
  it('success true/false로 타입을 구분한다', () => {
    const successResult: AgentResult<number> = succeed('A', 1, 0);
    const failResult: AgentResult<number> = fail('A', { code: 'AI_ERROR', message: 'err' }, 0);

    expect(successResult.success).toBe(true);
    expect(failResult.success).toBe(false);
  });
});
