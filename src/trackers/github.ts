import type { AgentError } from '../agents/types.js';
import type { IssueTracker, TrackerIssue } from './types.js';

interface GitHubLabel {
  name: string;
}

interface GitHubUser {
  login: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: GitHubLabel[];
  assignee: GitHubUser | null;
  html_url: string;
  [key: string]: unknown;
}

function extractPriorityFromLabels(labels: string[]): TrackerIssue['priority'] {
  for (const label of labels) {
    const lower = label.toLowerCase();
    if (lower === 'priority:urgent' || lower === 'urgent') return 'urgent';
    if (lower === 'priority:high' || lower === 'high') return 'high';
    if (lower === 'priority:medium' || lower === 'medium') return 'medium';
    if (lower === 'priority:low' || lower === 'low') return 'low';
  }
  return undefined;
}

function githubIssueToTrackerIssue(issue: GitHubIssue): TrackerIssue {
  const labels = issue.labels.map((l) => l.name);
  return {
    id: issue.number.toString(),
    title: issue.title,
    description: issue.body ?? '',
    status: issue.state,
    labels,
    assignee: issue.assignee?.login,
    priority: extractPriorityFromLabels(labels),
    url: issue.html_url,
    raw: issue as Record<string, unknown>,
  };
}

export class GitHubTracker implements IssueTracker {
  name = 'github';
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(
    private owner: string,
    private repo: string,
    private token?: string,
  ) {
    this.baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    this.headers = {
      'Accept': 'application/vnd.github.v3+json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  }

  private classifyHttpError(status: number, statusText: string, context: string): AgentError {
    if (status === 401 || status === 403) {
      return {
        code: 'AUTH_ERROR',
        message: `GitHub 인증 실패: ${status} ${statusText}. 토큰 권한을 확인해주세요.`,
      };
    }
    if (status === 429) {
      return {
        code: 'RATE_LIMIT_ERROR',
        message: `GitHub API 요청 한도 초과. 잠시 후 다시 시도해주세요.`,
      };
    }
    if (status === 502 || status === 503 || status === 504) {
      return {
        code: 'NETWORK_ERROR',
        message: `GitHub API 서버 오류: ${status} ${statusText}`,
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
            message: `GitHub API 연결 실패: ${msg}`,
            cause: error,
          };
          throw err;
        }
      }
      throw error;
    }
  }

  async getIssue(issueId: string): Promise<TrackerIssue> {
    const res = await this.safeFetch(`${this.baseUrl}/issues/${issueId}`, {
      headers: this.headers,
    });

    if (res.status === 404) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `GitHub 이슈 #${issueId}를 찾을 수 없습니다. (${this.owner}/${this.repo})`,
      };
      throw err;
    }

    if (!res.ok) {
      throw this.classifyHttpError(res.status, res.statusText, `GitHub API 오류`);
    }

    const issue = (await res.json()) as GitHubIssue;
    return githubIssueToTrackerIssue(issue);
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    const state = status === 'closed' ? 'closed' : 'open';
    const res = await this.safeFetch(`${this.baseUrl}/issues/${issueId}`, {
      method: 'PATCH',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });

    if (!res.ok) {
      throw this.classifyHttpError(res.status, res.statusText, `GitHub 이슈 상태 업데이트 실패`);
    }
  }

  async listIssues(filter?: Record<string, unknown>): Promise<TrackerIssue[]> {
    const params = new URLSearchParams();
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
    }

    const url = `${this.baseUrl}/issues${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await this.safeFetch(url, { headers: this.headers });

    if (!res.ok) {
      throw this.classifyHttpError(res.status, res.statusText, `GitHub 이슈 목록 조회 실패`);
    }

    const issues = (await res.json()) as GitHubIssue[];
    return issues.map(githubIssueToTrackerIssue);
  }
}
