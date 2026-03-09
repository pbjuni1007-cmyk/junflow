import type { AgentError } from '../agents/types.js';
import type { IssueTracker, TrackerIssue } from './types.js';

const SAMPLE_ISSUES: TrackerIssue[] = [
  {
    id: 'ISSUE-1',
    title: '사용자 프로필 페이지 구현',
    description:
      '사용자 프로필 조회/수정 페이지를 구현합니다. 프로필 이미지 업로드와 반응형 레이아웃을 포함합니다.',
    status: 'todo',
    labels: ['feature', 'frontend'],
    priority: 'medium',
    url: 'https://example.com/issues/1',
    raw: {},
  },
  {
    id: 'ISSUE-2',
    title: '로그인 페이지 버그 수정',
    description:
      '비밀번호 입력 필드에서 한글 입력 시 글자가 깨지는 버그를 수정합니다.',
    status: 'in_progress',
    labels: ['bugfix', 'frontend'],
    priority: 'high',
    url: 'https://example.com/issues/2',
    raw: {},
  },
  {
    id: 'ISSUE-3',
    title: 'API 응답 캐싱 구현',
    description:
      'Redis 기반 API 응답 캐싱을 구현하여 반복 요청의 응답 시간을 개선합니다.',
    status: 'todo',
    labels: ['feature', 'backend', 'performance'],
    priority: 'low',
    url: 'https://example.com/issues/3',
    raw: {},
  },
];

export class MockTracker implements IssueTracker {
  name = 'mock';
  private issues: Map<string, TrackerIssue>;

  constructor() {
    this.issues = new Map(SAMPLE_ISSUES.map((issue) => [issue.id, issue]));
  }

  async getIssue(issueId: string): Promise<TrackerIssue> {
    const issue = this.issues.get(issueId);
    if (!issue) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `이슈 '${issueId}'를 찾을 수 없습니다. 사용 가능한 이슈: ${Array.from(this.issues.keys()).join(', ')}`,
      };
      throw err;
    }
    return { ...issue };
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    const issue = this.issues.get(issueId);
    if (!issue) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `이슈 '${issueId}'를 찾을 수 없습니다.`,
      };
      throw err;
    }
    this.issues.set(issueId, { ...issue, status });
  }

  async listIssues(): Promise<TrackerIssue[]> {
    return Array.from(this.issues.values()).map((issue) => ({ ...issue }));
  }
}
