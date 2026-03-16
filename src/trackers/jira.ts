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

  private classifyHttpError(status: number, statusText: string, context: string): AgentError {
    if (status === 401 || status === 403) {
      return {
        code: 'AUTH_ERROR',
        message: `Jira 인증 실패: ${status} ${statusText}. 이메일과 API 토큰을 확인해주세요.`,
      };
    }
    if (status === 429) {
      return {
        code: 'RATE_LIMIT_ERROR',
        message: `Jira API 요청 한도 초과. 잠시 후 다시 시도해주세요.`,
      };
    }
    if (status === 502 || status === 503 || status === 504) {
      return {
        code: 'NETWORK_ERROR',
        message: `Jira API 서버 오류: ${status} ${statusText}`,
      };
    }
    return {
      code: 'TRACKER_ERROR',
      message: `${context}: ${status} ${statusText}`,
    };
  }

  private async safeFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message;
        if (
          msg.includes('ECONNREFUSED') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('ENOTFOUND') ||
          msg.includes('fetch') ||
          msg.includes('network')
        ) {
          const err: AgentError = {
            code: 'NETWORK_ERROR',
            message: `Jira API 연결 실패: ${msg}`,
            cause: error,
          };
          throw err;
        }
      }
      throw error;
    }
  }

  async getIssue(issueId: string): Promise<TrackerIssue> {
    const res = await this.safeFetch(`${this.baseUrl}/issue/${issueId}`, {
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
      throw this.classifyHttpError(res.status, res.statusText, `Jira API 오류`);
    }

    const issue = (await res.json()) as JiraIssue;
    return this.jiraIssueToTrackerIssue(issue);
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    // 1. 사용 가능한 transition 목록 조회
    const transRes = await this.safeFetch(`${this.baseUrl}/issue/${issueId}/transitions`, {
      headers: this.headers,
    });

    if (!transRes.ok) {
      throw this.classifyHttpError(transRes.status, transRes.statusText, `Jira transition 목록 조회 실패`);
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
    const res = await this.safeFetch(`${this.baseUrl}/issue/${issueId}/transitions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ transition: { id: target.id } }),
    });

    if (!res.ok && res.status !== 204) {
      throw this.classifyHttpError(res.status, res.statusText, `Jira 이슈 상태 업데이트 실패`);
    }
  }

  async listIssues(filter?: Record<string, unknown>): Promise<TrackerIssue[]> {
    const jql = (filter?.['jql'] as string | undefined) ?? 'ORDER BY created DESC';

    const res = await this.safeFetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ jql, maxResults: 50 }),
    });

    if (!res.ok) {
      throw this.classifyHttpError(res.status, res.statusText, `Jira 이슈 목록 조회 실패`);
    }

    const result = (await res.json()) as JiraSearchResult;
    return result.issues.map((issue) => this.jiraIssueToTrackerIssue(issue));
  }
}
