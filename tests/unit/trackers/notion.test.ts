import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentError } from '../../../src/agents/types.js';
import {
  extractTitle,
  extractRichText,
  extractSelect,
  extractMultiSelect,
  NotionTracker,
} from '../../../src/trackers/notion.js';

// 모듈 레벨에서 mock 함수 선언 (hoisting 대응)
const mockQuery = vi.fn();
const mockUpdate = vi.fn();

// @notionhq/client를 모킹 - Client는 반드시 function으로 정의해야 new 가능
vi.mock('@notionhq/client', () => {
  return {
    Client: function Client() {
      return {
        databases: { query: mockQuery },
        pages: { update: mockUpdate },
      };
    },
  };
});

// notion-db-schema.json 기반 샘플 페이지 fixture
function makeBaseProp() {
  return {
    이슈: {
      type: 'title',
      title: [{ plain_text: 'ISSUE-1' }],
    },
    상태: {
      type: 'status',
      status: { name: 'Not started' },
    },
    우선순위: {
      type: 'select',
      select: { name: 'Medium' },
    },
    유형: {
      type: 'select',
      select: { name: 'feature' },
    },
    라벨: {
      type: 'multi_select',
      multi_select: [{ name: 'frontend' }, { name: 'backend' }],
    },
    담당자: {
      type: 'rich_text',
      rich_text: [{ plain_text: 'Jun' }],
    },
    설명: {
      type: 'rich_text',
      rich_text: [{ plain_text: '사용자 프로필 페이지를 구현합니다.' }],
    },
  };
}

function makePage(propOverrides?: Record<string, unknown>, topOverrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'page-abc-123',
    url: 'https://www.notion.so/page-abc-123',
    properties: {
      ...makeBaseProp(),
      ...propOverrides,
    },
    ...topOverrides,
  };
}

// ---------- 헬퍼 함수 단위 테스트 ----------

describe('extractTitle', () => {
  it('title 속성에서 plain_text를 추출한다', () => {
    const properties = {
      이슈: { type: 'title', title: [{ plain_text: 'ISSUE-1' }] },
    };
    expect(extractTitle(properties)).toBe('ISSUE-1');
  });

  it('title 배열이 비어있으면 빈 문자열을 반환한다', () => {
    const properties = {
      이슈: { type: 'title', title: [] },
    };
    expect(extractTitle(properties)).toBe('');
  });

  it('이슈 속성이 없으면 빈 문자열을 반환한다', () => {
    expect(extractTitle({})).toBe('');
  });
});

describe('extractRichText', () => {
  it('rich_text 배열의 plain_text를 이어붙인 문자열을 반환한다', () => {
    const prop = {
      type: 'rich_text',
      rich_text: [{ plain_text: '첫 번째 ' }, { plain_text: '두 번째' }],
    };
    expect(extractRichText(prop)).toBe('첫 번째 두 번째');
  });

  it('rich_text 배열이 비어있으면 빈 문자열을 반환한다', () => {
    const prop = { type: 'rich_text', rich_text: [] };
    expect(extractRichText(prop)).toBe('');
  });

  it('undefined가 전달되면 빈 문자열을 반환한다', () => {
    expect(extractRichText(undefined)).toBe('');
  });
});

describe('extractSelect', () => {
  it('select 타입에서 name을 반환한다', () => {
    const prop = { type: 'select', select: { name: 'High' } };
    expect(extractSelect(prop)).toBe('High');
  });

  it('status 타입에서 name을 반환한다', () => {
    const prop = { type: 'status', status: { name: 'In progress' } };
    expect(extractSelect(prop)).toBe('In progress');
  });

  it('select가 null이면 undefined를 반환한다', () => {
    const prop = { type: 'select', select: null };
    expect(extractSelect(prop)).toBeUndefined();
  });

  it('status가 null이면 undefined를 반환한다', () => {
    const prop = { type: 'status', status: null };
    expect(extractSelect(prop)).toBeUndefined();
  });

  it('undefined가 전달되면 undefined를 반환한다', () => {
    expect(extractSelect(undefined)).toBeUndefined();
  });
});

describe('extractMultiSelect', () => {
  it('multi_select 배열의 name 목록을 반환한다', () => {
    const prop = {
      type: 'multi_select',
      multi_select: [{ name: 'frontend' }, { name: 'backend' }],
    };
    expect(extractMultiSelect(prop)).toEqual(['frontend', 'backend']);
  });

  it('multi_select 배열이 비어있으면 빈 배열을 반환한다', () => {
    const prop = { type: 'multi_select', multi_select: [] };
    expect(extractMultiSelect(prop)).toEqual([]);
  });

  it('undefined가 전달되면 빈 배열을 반환한다', () => {
    expect(extractMultiSelect(undefined)).toEqual([]);
  });
});

// ---------- NotionTracker 단위 테스트 ----------

describe('NotionTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('apiKey가 빈 문자열이면 TRACKER_ERROR를 throw한다', () => {
      expect(() => new NotionTracker('', 'db-id')).toThrow(
        expect.objectContaining({ code: 'TRACKER_ERROR' } satisfies Partial<AgentError>),
      );
    });

    it('apiKey 없음 에러 메시지에 설정 방법이 포함된다', () => {
      try {
        new NotionTracker('', 'db-id');
        expect.fail('throw하지 않았음');
      } catch (err) {
        const agentErr = err as AgentError;
        expect(agentErr.message).toContain('NOTION_API_KEY');
      }
    });
  });

  describe('getIssue', () => {
    it('Notion 페이지를 TrackerIssue로 변환하여 반환한다', async () => {
      const page = makePage();
      mockQuery.mockResolvedValueOnce({ results: [page] });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      const issue = await tracker.getIssue('ISSUE-1');

      expect(issue.id).toBe('page-abc-123');
      expect(issue.title).toBe('ISSUE-1');
      expect(issue.description).toBe('사용자 프로필 페이지를 구현합니다.');
      expect(issue.status).toBe('Not started');
      expect(issue.priority).toBe('medium'); // 'Medium' -> toLowerCase()
      expect(issue.labels).toContain('feature'); // 유형이 labels에 포함됨
      expect(issue.labels).toContain('frontend');
      expect(issue.labels).toContain('backend');
      expect(issue.assignee).toBe('Jun');
      expect(issue.url).toBe('https://www.notion.so/page-abc-123');
      expect(issue.raw).toBe(page); // 원본 데이터 보존
    });

    it('database query 시 issueId로 title 필터를 사용한다', async () => {
      mockQuery.mockResolvedValueOnce({ results: [makePage()] });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      await tracker.getIssue('ISSUE-1');

      expect(mockQuery).toHaveBeenCalledWith({
        database_id: 'test-db-id',
        filter: {
          property: '이슈',
          title: { equals: 'ISSUE-1' },
        },
      });
    });

    it('결과가 없으면 TRACKER_ERROR를 throw한다', async () => {
      mockQuery.mockResolvedValueOnce({ results: [] });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      await expect(tracker.getIssue('ISSUE-999')).rejects.toMatchObject({
        code: 'TRACKER_ERROR',
      } satisfies Partial<AgentError>);
    });

    it('이슈 없음 에러 메시지에 issueId가 포함된다', async () => {
      mockQuery.mockResolvedValueOnce({ results: [] });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      try {
        await tracker.getIssue('ISSUE-999');
        expect.fail('throw하지 않았음');
      } catch (err) {
        expect((err as AgentError).message).toContain('ISSUE-999');
      }
    });

    it('담당자가 비어있으면 assignee가 undefined이다', async () => {
      const page = makePage({ 담당자: { type: 'rich_text', rich_text: [] } });
      mockQuery.mockResolvedValueOnce({ results: [page] });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      const issue = await tracker.getIssue('ISSUE-1');
      expect(issue.assignee).toBeUndefined();
    });

    it('우선순위 select가 null이면 priority가 undefined이다', async () => {
      const page = makePage({ 우선순위: { type: 'select', select: null } });
      mockQuery.mockResolvedValueOnce({ results: [page] });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      const issue = await tracker.getIssue('ISSUE-1');
      expect(issue.priority).toBeUndefined();
    });
  });

  describe('updateIssueStatus', () => {
    it('페이지의 상태 속성을 업데이트한다', async () => {
      mockQuery.mockResolvedValueOnce({ results: [makePage()] });
      mockUpdate.mockResolvedValueOnce({});

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      await tracker.updateIssueStatus('ISSUE-1', 'In progress');

      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: 'page-abc-123',
        properties: {
          상태: { status: { name: 'In progress' } },
        },
      });
    });
  });

  describe('listIssues', () => {
    it('데이터베이스의 모든 이슈를 TrackerIssue 배열로 반환한다', async () => {
      mockQuery.mockResolvedValueOnce({
        results: [makePage(), makePage({}, { id: 'page-def-456' })],
      });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      const issues = await tracker.listIssues();
      expect(issues).toHaveLength(2);
      expect(issues[0].id).toBe('page-abc-123');
      expect(issues[1].id).toBe('page-def-456');
    });

    it('filter 없이 호출하면 filter 파라미터를 전달하지 않는다', async () => {
      mockQuery.mockResolvedValueOnce({ results: [] });

      const tracker = new NotionTracker('test-api-key', 'test-db-id');
      await tracker.listIssues();

      expect(mockQuery).toHaveBeenCalledWith({ database_id: 'test-db-id' });
    });
  });
});
