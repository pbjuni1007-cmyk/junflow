import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { trackTokenUsage, getSessionTokenSummary } from '../../../src/cli/utils/token-tracker.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'junflow-token-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('trackTokenUsage()', () => {
  it('토큰 사용을 파일에 저장한다', async () => {
    await trackTokenUsage(
      { agentName: 'CommitWriter', tokensUsed: 1000, timestamp: '2024-01-01T00:00:00.000Z' },
      tmpDir,
    );

    const filePath = path.join(tmpDir, '.junflow/session-tokens.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      agentName: 'CommitWriter',
      tokensUsed: 1000,
      timestamp: '2024-01-01T00:00:00.000Z',
    });
  });

  it('여러 번 호출하면 누적 저장된다', async () => {
    await trackTokenUsage(
      { agentName: 'CommitWriter', tokensUsed: 1000, timestamp: '2024-01-01T00:00:00.000Z' },
      tmpDir,
    );
    await trackTokenUsage(
      { agentName: 'CodeReviewer', tokensUsed: 2000, timestamp: '2024-01-01T00:01:00.000Z' },
      tmpDir,
    );
    await trackTokenUsage(
      { agentName: 'CommitWriter', tokensUsed: 500, timestamp: '2024-01-01T00:02:00.000Z' },
      tmpDir,
    );

    const filePath = path.join(tmpDir, '.junflow/session-tokens.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(3);
  });

  it('.junflow 디렉토리가 없어도 자동 생성한다', async () => {
    await trackTokenUsage(
      { agentName: 'CommitWriter', tokensUsed: 100, timestamp: '2024-01-01T00:00:00.000Z' },
      tmpDir,
    );

    const dirExists = await fs
      .stat(path.join(tmpDir, '.junflow'))
      .then(() => true)
      .catch(() => false);

    expect(dirExists).toBe(true);
  });
});

describe('getSessionTokenSummary()', () => {
  it('파일이 없으면 빈 요약을 반환한다', async () => {
    const summary = await getSessionTokenSummary(tmpDir);

    expect(summary.total.calls).toBe(0);
    expect(summary.total.tokens).toBe(0);
    expect(summary.total.estimatedCost).toBe(0);
    expect(Object.keys(summary.byAgent)).toHaveLength(0);
  });

  it('에이전트별로 집계된다', async () => {
    await trackTokenUsage(
      { agentName: 'CommitWriter', tokensUsed: 1000, timestamp: '2024-01-01T00:00:00.000Z' },
      tmpDir,
    );
    await trackTokenUsage(
      { agentName: 'CommitWriter', tokensUsed: 2000, timestamp: '2024-01-01T00:01:00.000Z' },
      tmpDir,
    );
    await trackTokenUsage(
      { agentName: 'CodeReviewer', tokensUsed: 3000, timestamp: '2024-01-01T00:02:00.000Z' },
      tmpDir,
    );

    const summary = await getSessionTokenSummary(tmpDir);

    expect(summary.byAgent['CommitWriter']).toEqual({
      calls: 2,
      tokens: 3000,
      estimatedCost: expect.closeTo(3000 * 9 / 1_000_000, 10),
    });

    expect(summary.byAgent['CodeReviewer']).toEqual({
      calls: 1,
      tokens: 3000,
      estimatedCost: expect.closeTo(3000 * 9 / 1_000_000, 10),
    });
  });

  it('total이 전체 합계를 나타낸다', async () => {
    await trackTokenUsage(
      { agentName: 'CommitWriter', tokensUsed: 1000, timestamp: '2024-01-01T00:00:00.000Z' },
      tmpDir,
    );
    await trackTokenUsage(
      { agentName: 'CodeReviewer', tokensUsed: 2000, timestamp: '2024-01-01T00:01:00.000Z' },
      tmpDir,
    );

    const summary = await getSessionTokenSummary(tmpDir);

    expect(summary.total.calls).toBe(2);
    expect(summary.total.tokens).toBe(3000);
    expect(summary.total.estimatedCost).toBeCloseTo(3000 * 9 / 1_000_000, 10);
  });

  it('비용 추정이 $9/1M 토큰 기준으로 계산된다', async () => {
    await trackTokenUsage(
      { agentName: 'TestAgent', tokensUsed: 1_000_000, timestamp: '2024-01-01T00:00:00.000Z' },
      tmpDir,
    );

    const summary = await getSessionTokenSummary(tmpDir);

    expect(summary.total.estimatedCost).toBeCloseTo(9.0, 5);
  });

  it('calls 횟수가 정확하게 집계된다', async () => {
    for (let i = 0; i < 5; i++) {
      await trackTokenUsage(
        { agentName: 'CommitWriter', tokensUsed: 100, timestamp: new Date().toISOString() },
        tmpDir,
      );
    }

    const summary = await getSessionTokenSummary(tmpDir);

    expect(summary.byAgent['CommitWriter']!.calls).toBe(5);
    expect(summary.total.calls).toBe(5);
  });
});
