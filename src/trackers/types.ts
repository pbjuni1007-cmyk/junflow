export interface TrackerIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  labels: string[];
  assignee?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  url?: string;
  raw: Record<string, unknown>;
}

export interface IssueTracker {
  name: string;
  getIssue(issueId: string): Promise<TrackerIssue>;
  updateIssueStatus?(issueId: string, status: string): Promise<void>;
  listIssues?(filter?: Record<string, unknown>): Promise<TrackerIssue[]>;
}
