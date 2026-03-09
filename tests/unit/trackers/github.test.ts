import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubTracker } from '../../../src/trackers/github.js';
import type { AgentError } from '../../../src/agents/types.js';

function makeGitHubIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: '로그인 버그 수정',
    body: '로그인 시 세션이 만료되는 버그입니다.',
    state: 'open',
    labels: [{ name: 'bug' }, { name: 'priority:high' }],
    assignee: { login: 'octocat' },
    html_url: 'https://github.com/owner/repo/issues/42',
    ...overrides,
  };
}

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    json: async () => data,
  });
}

describe('GitHubTracker', () => {
  let tracker: GitHubTracker;
  const originalFetch = global.fetch;

  beforeEach(() => {
    tracker = new GitHubTracker('owner', 'repo', 'ghp_token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getIssue', () => {
    it('GitHub 이슈를 TrackerIssue로 변환한다', async () => {
      global.fetch = mockFetch(makeGitHubIssue());
      const issue = await tracker.getIssue('42');

      expect(issue.id).toBe('42');
      expect(issue.title).toBe('로그인 버그 수정');
      expect(issue.description).toBe('로그인 시 세션이 만료되는 버그입니다.');
      expect(issue.status).toBe('open');
      expect(issue.assignee).toBe('octocat');
      expect(issue.url).toBe('https://github.com/owner/repo/issues/42');
    });

    it('labels 배열에서 label name을 추출한다', async () => {
      global.fetch = mockFetch(makeGitHubIssue());
      const issue = await tracker.getIssue('42');

      expect(issue.labels).toContain('bug');
      expect(issue.labels).toContain('priority:high');
    });

    it('priority:high 라벨에서 priority를 추출한다', async () => {
      global.fetch = mockFetch(makeGitHubIssue());
      const issue = await tracker.getIssue('42');

      expect(issue.priority).toBe('high');
    });

    it('priority:urgent 라벨에서 urgent를 추출한다', async () => {
      global.fetch = mockFetch(makeGitHubIssue({ labels: [{ name: 'priority:urgent' }] }));
      const issue = await tracker.getIssue('42');

      expect(issue.priority).toBe('urgent');
    });

    it('priority:low 라벨에서 low를 추출한다', async () => {
      global.fetch = mockFetch(makeGitHubIssue({ labels: [{ name: 'priority:low' }] }));
      const issue = await tracker.getIssue('42');

      expect(issue.priority).toBe('low');
    });

    it('priority 라벨이 없으면 priority가 undefined이다', async () => {
      global.fetch = mockFetch(makeGitHubIssue({ labels: [{ name: 'bug' }] }));
      const issue = await tracker.getIssue('42');

      expect(issue.priority).toBeUndefined();
    });

    it('body가 null이면 description이 빈 문자열이다', async () => {
      global.fetch = mockFetch(makeGitHubIssue({ body: null }));
      const issue = await tracker.getIssue('42');

      expect(issue.description).toBe('');
    });

    it('assignee가 없으면 assignee가 undefined이다', async () => {
      global.fetch = mockFetch(makeGitHubIssue({ assignee: null }));
      const issue = await tracker.getIssue('42');

      expect(issue.assignee).toBeUndefined();
    });

    it('404 응답이면 TRACKER_ERROR를 throw한다', async () => {
      global.fetch = mockFetch({ message: 'Not Found' }, 404);

      await expect(tracker.getIssue('999')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });

    it('에러 메시지에 이슈 번호가 포함된다', async () => {
      global.fetch = mockFetch({ message: 'Not Found' }, 404);

      try {
        await tracker.getIssue('999');
        expect.fail('throw하지 않았음');
      } catch (err) {
        expect((err as AgentError).message).toContain('999');
      }
    });

    it('500 응답이면 TRACKER_ERROR를 throw한다', async () => {
      global.fetch = mockFetch({}, 500);

      await expect(tracker.getIssue('42')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });

    it('raw에 원본 GitHub 이슈 데이터가 포함된다', async () => {
      const raw = makeGitHubIssue();
      global.fetch = mockFetch(raw);
      const issue = await tracker.getIssue('42');

      expect(issue.raw['number']).toBe(42);
      expect(issue.raw['html_url']).toBe('https://github.com/owner/repo/issues/42');
    });
  });

  describe('updateIssueStatus', () => {
    it('closed 상태로 업데이트하면 PATCH 요청에 state: closed가 포함된다', async () => {
      const fetchMock = mockFetch(makeGitHubIssue({ state: 'closed' }));
      global.fetch = fetchMock;

      await tracker.updateIssueStatus('42', 'closed');

      const [, options] = (fetchMock.mock.calls[0] as [string, RequestInit]);
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body['state']).toBe('closed');
    });

    it('open 이외의 상태는 open으로 매핑된다', async () => {
      const fetchMock = mockFetch(makeGitHubIssue());
      global.fetch = fetchMock;

      await tracker.updateIssueStatus('42', 'in_progress');

      const [, options] = (fetchMock.mock.calls[0] as [string, RequestInit]);
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body['state']).toBe('open');
    });

    it('API 실패 시 TRACKER_ERROR를 throw한다', async () => {
      global.fetch = mockFetch({}, 422);

      await expect(tracker.updateIssueStatus('42', 'closed')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });
  });

  describe('listIssues', () => {
    it('이슈 목록을 TrackerIssue 배열로 반환한다', async () => {
      global.fetch = mockFetch([makeGitHubIssue(), makeGitHubIssue({ number: 43, title: '두 번째 이슈' })]);

      const issues = await tracker.listIssues();

      expect(issues).toHaveLength(2);
      expect(issues[0]?.id).toBe('42');
      expect(issues[1]?.id).toBe('43');
    });

    it('filter 파라미터가 query string으로 변환된다', async () => {
      const fetchMock = mockFetch([]);
      global.fetch = fetchMock;

      await tracker.listIssues({ state: 'closed', labels: 'bug' });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('state=closed');
      expect(url).toContain('labels=bug');
    });

    it('filter 없이 호출해도 정상 동작한다', async () => {
      global.fetch = mockFetch([]);
      const issues = await tracker.listIssues();
      expect(issues).toEqual([]);
    });

    it('API 실패 시 TRACKER_ERROR를 throw한다', async () => {
      global.fetch = mockFetch({}, 401);

      await expect(tracker.listIssues()).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });
  });
});
