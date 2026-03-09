import { describe, it, expect, beforeEach } from 'vitest';
import { MockTracker } from '../../../src/trackers/mock.js';
import type { AgentError } from '../../../src/agents/types.js';
import sampleIssue from '../../fixtures/sample-issue.json';

describe('MockTracker', () => {
  let tracker: MockTracker;

  beforeEach(() => {
    tracker = new MockTracker();
  });

  describe('getIssue', () => {
    it('ISSUE-1을 조회하면 sample-issue.json과 일치하는 데이터를 반환한다', async () => {
      const issue = await tracker.getIssue('ISSUE-1');
      expect(issue.id).toBe(sampleIssue.id);
      expect(issue.title).toBe(sampleIssue.title);
      expect(issue.description).toBe(sampleIssue.description);
      expect(issue.status).toBe(sampleIssue.status);
      expect(issue.labels).toEqual(sampleIssue.labels);
      expect(issue.priority).toBe(sampleIssue.priority);
      expect(issue.url).toBe(sampleIssue.url);
    });

    it('ISSUE-2를 조회하면 올바른 데이터를 반환한다', async () => {
      const issue = await tracker.getIssue('ISSUE-2');
      expect(issue.id).toBe('ISSUE-2');
      expect(issue.status).toBe('in_progress');
      expect(issue.priority).toBe('high');
      expect(issue.labels).toContain('bugfix');
    });

    it('존재하지 않는 이슈를 조회하면 TRACKER_ERROR를 throw한다', async () => {
      await expect(tracker.getIssue('ISSUE-999')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });

    it('에러 메시지에 사용 가능한 이슈 목록이 포함된다', async () => {
      try {
        await tracker.getIssue('ISSUE-999');
        expect.fail('throw하지 않았음');
      } catch (err) {
        const agentErr = err as AgentError;
        expect(agentErr.message).toContain('ISSUE-1');
        expect(agentErr.message).toContain('ISSUE-2');
        expect(agentErr.message).toContain('ISSUE-3');
      }
    });

    it('반환된 이슈는 내부 상태와 독립적인 복사본이다', async () => {
      const issue = await tracker.getIssue('ISSUE-1');
      issue.status = 'mutated';
      const issueAgain = await tracker.getIssue('ISSUE-1');
      expect(issueAgain.status).toBe('todo');
    });
  });

  describe('listIssues', () => {
    it('모든 이슈(3개)를 반환한다', async () => {
      const issues = await tracker.listIssues();
      expect(issues).toHaveLength(3);
    });

    it('반환된 목록에 ISSUE-1, ISSUE-2, ISSUE-3이 모두 포함된다', async () => {
      const issues = await tracker.listIssues();
      const ids = issues.map((i) => i.id);
      expect(ids).toContain('ISSUE-1');
      expect(ids).toContain('ISSUE-2');
      expect(ids).toContain('ISSUE-3');
    });

    it('반환된 이슈 목록은 내부 상태와 독립적인 복사본이다', async () => {
      const issues = await tracker.listIssues();
      issues[0].status = 'mutated';
      const issuesAgain = await tracker.listIssues();
      expect(issuesAgain[0].status).not.toBe('mutated');
    });
  });

  describe('updateIssueStatus', () => {
    it('이슈 상태를 변경하면 getIssue로 변경된 상태가 조회된다', async () => {
      await tracker.updateIssueStatus('ISSUE-1', 'in_progress');
      const issue = await tracker.getIssue('ISSUE-1');
      expect(issue.status).toBe('in_progress');
    });

    it('ISSUE-2를 done으로 변경할 수 있다', async () => {
      await tracker.updateIssueStatus('ISSUE-2', 'done');
      const issue = await tracker.getIssue('ISSUE-2');
      expect(issue.status).toBe('done');
    });

    it('존재하지 않는 이슈를 업데이트하면 TRACKER_ERROR를 throw한다', async () => {
      await expect(tracker.updateIssueStatus('ISSUE-999', 'done')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });

    it('상태 변경 후 다른 필드는 그대로 유지된다', async () => {
      const before = await tracker.getIssue('ISSUE-1');
      await tracker.updateIssueStatus('ISSUE-1', 'done');
      const after = await tracker.getIssue('ISSUE-1');
      expect(after.title).toBe(before.title);
      expect(after.description).toBe(before.description);
      expect(after.labels).toEqual(before.labels);
    });
  });
});
