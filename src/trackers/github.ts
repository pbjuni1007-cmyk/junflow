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

  async getIssue(issueId: string): Promise<TrackerIssue> {
    const res = await fetch(`${this.baseUrl}/issues/${issueId}`, {
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
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `GitHub API 오류: ${res.status} ${res.statusText}`,
      };
      throw err;
    }

    const issue = (await res.json()) as GitHubIssue;
    return githubIssueToTrackerIssue(issue);
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    const state = status === 'closed' ? 'closed' : 'open';
    const res = await fetch(`${this.baseUrl}/issues/${issueId}`, {
      method: 'PATCH',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });

    if (!res.ok) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `GitHub 이슈 상태 업데이트 실패: ${res.status} ${res.statusText}`,
      };
      throw err;
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
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `GitHub 이슈 목록 조회 실패: ${res.status} ${res.statusText}`,
      };
      throw err;
    }

    const issues = (await res.json()) as GitHubIssue[];
    return issues.map(githubIssueToTrackerIssue);
  }
}
