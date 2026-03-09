import type { AgentError } from '../agents/types.js';
import type { IssueTracker, TrackerIssue } from './types.js';

interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
}

export function adfToPlainText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';
  const node = adf as AdfNode;
  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }
  if (Array.isArray(node.content)) {
    return node.content.map(adfToPlainText).join('');
  }
  return '';
}

function normalizePriority(name: string | undefined): TrackerIssue['priority'] {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  if (lower === 'highest' || lower === 'urgent') return 'urgent';
  if (lower === 'high') return 'high';
  if (lower === 'medium') return 'medium';
  if (lower === 'low' || lower === 'lowest') return 'low';
  return undefined;
}

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description: unknown;
    status: { name: string };
    labels: string[];
    assignee: { displayName: string } | null;
    priority: { name: string } | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
}

interface JiraTransition {
  id: string;
  name: string;
}

interface JiraTransitionsResult {
  transitions: JiraTransition[];
}

export class JiraTracker implements IssueTracker {
  name = 'jira';
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    private domain: string,
    private email: string,
    private apiToken: string,
  ) {
    this.baseUrl = `https://${domain}/rest/api/3`;
    this.headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
    };
  }

  private jiraIssueToTrackerIssue(issue: JiraIssue): TrackerIssue {
    const description = adfToPlainText(issue.fields.description);
    return {
      id: issue.key,
      title: issue.fields.summary,
      description,
      status: issue.fields.status.name,
      labels: issue.fields.labels ?? [],
      assignee: issue.fields.assignee?.displayName,
      priority: normalizePriority(issue.fields.priority?.name),
      url: `https://${this.domain}/browse/${issue.key}`,
      raw: issue as Record<string, unknown>,
    };
  }

  async getIssue(issueId: string): Promise<TrackerIssue> {
    const res = await fetch(`${this.baseUrl}/issue/${issueId}`, {
      headers: this.headers,
    });

    if (res.status === 404) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `Jira 이슈 '${issueId}'를 찾을 수 없습니다. (${this.domain})`,
      };
      throw err;
    }

    if (!res.ok) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `Jira API 오류: ${res.status} ${res.statusText}`,
      };
      throw err;
    }

    const issue = (await res.json()) as JiraIssue;
    return this.jiraIssueToTrackerIssue(issue);
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    // 1. 사용 가능한 transition 목록 조회
    const transRes = await fetch(`${this.baseUrl}/issue/${issueId}/transitions`, {
      headers: this.headers,
    });

    if (!transRes.ok) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `Jira transition 목록 조회 실패: ${transRes.status} ${transRes.statusText}`,
      };
      throw err;
    }

    const { transitions } = (await transRes.json()) as JiraTransitionsResult;
    const target = transitions.find(
      (t) => t.name.toLowerCase() === status.toLowerCase(),
    );

    if (!target) {
      const available = transitions.map((t) => t.name).join(', ');
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `Jira transition '${status}'을 찾을 수 없습니다. 사용 가능: ${available}`,
      };
      throw err;
    }

    // 2. transition 실행
    const res = await fetch(`${this.baseUrl}/issue/${issueId}/transitions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ transition: { id: target.id } }),
    });

    if (!res.ok && res.status !== 204) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `Jira 이슈 상태 업데이트 실패: ${res.status} ${res.statusText}`,
      };
      throw err;
    }
  }

  async listIssues(filter?: Record<string, unknown>): Promise<TrackerIssue[]> {
    const jql = (filter?.['jql'] as string | undefined) ?? 'ORDER BY created DESC';

    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ jql, maxResults: 50 }),
    });

    if (!res.ok) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `Jira 이슈 목록 조회 실패: ${res.status} ${res.statusText}`,
      };
      throw err;
    }

    const result = (await res.json()) as JiraSearchResult;
    return result.issues.map((issue) => this.jiraIssueToTrackerIssue(issue));
  }
}
