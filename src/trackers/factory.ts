import type { IssueTracker } from './types.js';
import type { JunFlowConfig } from '../config/schema.js';
import type { AgentError } from '../agents/types.js';

export async function createTracker(config: JunFlowConfig): Promise<IssueTracker> {
  switch (config.tracker.type) {
    case 'notion': {
      const { NotionTracker } = await import('./notion.js');
      const apiKey = config.tracker.notion?.apiKey ?? process.env['NOTION_API_KEY'];
      const dbId = config.tracker.notion?.databaseId;
      if (!apiKey || !dbId) {
        const err: AgentError = {
          code: 'CONFIG_ERROR',
          message: 'Notion API key와 database ID가 필요합니다.',
        };
        throw err;
      }
      return new NotionTracker(apiKey, dbId);
    }
    case 'github': {
      const { GitHubTracker } = await import('./github.js');
      const owner = config.tracker.github?.owner;
      const repo = config.tracker.github?.repo;
      if (!owner || !repo) {
        const err: AgentError = {
          code: 'CONFIG_ERROR',
          message: 'GitHub owner와 repo가 필요합니다.',
        };
        throw err;
      }
      const token = config.tracker.github?.token ?? process.env['GITHUB_TOKEN'];
      return new GitHubTracker(owner, repo, token);
    }
    case 'jira': {
      const { JiraTracker } = await import('./jira.js');
      const domain = config.tracker.jira?.domain;
      const email = config.tracker.jira?.email;
      if (!domain || !email) {
        const err: AgentError = {
          code: 'CONFIG_ERROR',
          message: 'Jira domain과 email이 필요합니다.',
        };
        throw err;
      }
      const token = config.tracker.jira?.apiToken ?? process.env['JIRA_API_TOKEN'];
      if (!token) {
        const err: AgentError = {
          code: 'CONFIG_ERROR',
          message: 'JIRA_API_TOKEN이 필요합니다.',
        };
        throw err;
      }
      return new JiraTracker(domain, email, token);
    }
    case 'mock': {
      const { MockTracker } = await import('./mock.js');
      return new MockTracker();
    }
    default: {
      const err: AgentError = {
        code: 'CONFIG_ERROR',
        message: `알 수 없는 tracker 타입: ${String(config.tracker.type)}`,
      };
      throw err;
    }
  }
}
