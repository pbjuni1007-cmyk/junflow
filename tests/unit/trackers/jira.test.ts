import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraTracker, adfToPlainText } from '../../../src/trackers/jira.js';
import type { AgentError } from '../../../src/agents/types.js';

function makeJiraIssue(overrides: Record<string, unknown> = {}) {
  return {
    key: 'PROJ-42',
    fields: {
      summary: '로그인 버그 수정',
      description: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'ADF 본문 내용입니다.' }],
          },
        ],
      },
      status: { name: 'In Progress' },
      labels: ['backend', 'auth'],
      assignee: { displayName: '홍길동' },
      priority: { name: 'High' },
      ...((overrides['fields'] as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

function makeTransitions(names: string[]) {
  return {
    transitions: names.map((name, i) => ({ id: String(i + 1), name })),
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

describe('adfToPlainText', () => {
  it('단순 text 노드를 반환한다', () => {
    expect(adfToPlainText({ type: 'text', text: 'hello' })).toBe('hello');
  });

  it('중첩된 content에서 text를 추출한다', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '첫 번째 ' },
            { type: 'text', text: '문장' },
          ],
        },
      ],
    };
    expect(adfToPlainText(adf)).toBe('첫 번째 문장');
  });

  it('null/undefined 입력 시 빈 문자열을 반환한다', () => {
    expect(adfToPlainText(null)).toBe('');
    expect(adfToPlainText(undefined)).toBe('');
  });

  it('text 없는 노드는 빈 문자열로 처리된다', () => {
    expect(adfToPlainText({ type: 'hardBreak' })).toBe('');
  });
});

describe('JiraTracker', () => {
  let tracker: JiraTracker;
  const originalFetch = global.fetch;

  beforeEach(() => {
    tracker = new JiraTracker('mycompany.atlassian.net', 'user@example.com', 'api-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getIssue', () => {
    it('Jira 이슈를 TrackerIssue로 변환한다', async () => {
      global.fetch = mockFetch(makeJiraIssue());
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.id).toBe('PROJ-42');
      expect(issue.title).toBe('로그인 버그 수정');
      expect(issue.status).toBe('In Progress');
      expect(issue.assignee).toBe('홍길동');
      expect(issue.url).toBe('https://mycompany.atlassian.net/browse/PROJ-42');
    });

    it('ADF description을 plain text로 변환한다', async () => {
      global.fetch = mockFetch(makeJiraIssue());
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.description).toBe('ADF 본문 내용입니다.');
    });

    it('labels 배열을 그대로 반환한다', async () => {
      global.fetch = mockFetch(makeJiraIssue());
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.labels).toEqual(['backend', 'auth']);
    });

    it('priority High → high로 매핑된다', async () => {
      global.fetch = mockFetch(makeJiraIssue());
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.priority).toBe('high');
    });

    it('priority Highest → urgent로 매핑된다', async () => {
      global.fetch = mockFetch(makeJiraIssue({ fields: { ...makeJiraIssue().fields, priority: { name: 'Highest' } } }));
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.priority).toBe('urgent');
    });

    it('priority Medium → medium으로 매핑된다', async () => {
      global.fetch = mockFetch(makeJiraIssue({ fields: { ...makeJiraIssue().fields, priority: { name: 'Medium' } } }));
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.priority).toBe('medium');
    });

    it('priority Low → low로 매핑된다', async () => {
      global.fetch = mockFetch(makeJiraIssue({ fields: { ...makeJiraIssue().fields, priority: { name: 'Low' } } }));
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.priority).toBe('low');
    });

    it('priority Lowest → low로 매핑된다', async () => {
      global.fetch = mockFetch(makeJiraIssue({ fields: { ...makeJiraIssue().fields, priority: { name: 'Lowest' } } }));
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.priority).toBe('low');
    });

    it('인증 헤더가 Basic auth 형식이다', async () => {
      const fetchMock = mockFetch(makeJiraIssue());
      global.fetch = fetchMock;

      await tracker.getIssue('PROJ-42');

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      const expectedToken = Buffer.from('user@example.com:api-token').toString('base64');
      expect(headers['Authorization']).toBe(`Basic ${expectedToken}`);
    });

    it('404 응답이면 TRACKER_ERROR를 throw한다', async () => {
      global.fetch = mockFetch({}, 404);

      await expect(tracker.getIssue('PROJ-999')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });

    it('에러 메시지에 이슈 키가 포함된다', async () => {
      global.fetch = mockFetch({}, 404);

      try {
        await tracker.getIssue('PROJ-999');
        expect.fail('throw하지 않았음');
      } catch (err) {
        expect((err as AgentError).message).toContain('PROJ-999');
      }
    });

    it('raw에 원본 Jira 이슈 데이터가 포함된다', async () => {
      global.fetch = mockFetch(makeJiraIssue());
      const issue = await tracker.getIssue('PROJ-42');

      expect(issue.raw['key']).toBe('PROJ-42');
    });
  });

  describe('updateIssueStatus', () => {
    it('transition 이름으로 상태를 업데이트한다', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => makeTransitions(['To Do', 'In Progress', 'Done']),
        })
        .mockResolvedValueOnce({
          ok: true, status: 204,
          json: async () => ({}),
        });
      global.fetch = fetchMock;

      await tracker.updateIssueStatus('PROJ-42', 'Done');

      const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect((body['transition'] as Record<string, string>)['id']).toBe('3');
    });

    it('대소문자 무시하고 transition을 찾는다', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => makeTransitions(['In Progress']),
        })
        .mockResolvedValueOnce({
          ok: true, status: 204,
          json: async () => ({}),
        });
      global.fetch = fetchMock;

      await expect(tracker.updateIssueStatus('PROJ-42', 'in progress')).resolves.toBeUndefined();
    });

    it('존재하지 않는 transition이면 TRACKER_ERROR를 throw한다', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => makeTransitions(['To Do', 'In Progress']),
      });

      await expect(tracker.updateIssueStatus('PROJ-42', 'NonExistent')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });
  });

  describe('listIssues', () => {
    it('JQL 검색 결과를 TrackerIssue 배열로 반환한다', async () => {
      global.fetch = mockFetch({
        issues: [makeJiraIssue(), makeJiraIssue({ key: 'PROJ-43', fields: { ...makeJiraIssue().fields, summary: '두 번째 이슈' } })],
        total: 2,
      });

      const issues = await tracker.listIssues();

      expect(issues).toHaveLength(2);
      expect(issues[0]?.id).toBe('PROJ-42');
      expect(issues[1]?.id).toBe('PROJ-43');
    });

    it('filter.jql이 요청 body에 포함된다', async () => {
      const fetchMock = mockFetch({ issues: [], total: 0 });
      global.fetch = fetchMock;

      await tracker.listIssues({ jql: 'project = PROJ AND status = Open' });

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body['jql']).toBe('project = PROJ AND status = Open');
    });

    it('API 실패 시 TRACKER_ERROR를 throw한다', async () => {
      global.fetch = mockFetch({}, 400);

      await expect(tracker.listIssues()).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });
  });
});
