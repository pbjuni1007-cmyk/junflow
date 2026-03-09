import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTracker } from '../../../src/trackers/factory.js';
import type { JunFlowConfig } from '../../../src/config/schema.js';
import type { AgentError } from '../../../src/agents/types.js';

function makeConfig(tracker: JunFlowConfig['tracker']): JunFlowConfig {
  return {
    ai: {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 2048,
    },
    tracker,
    git: {
      branchConvention: '{type}/{issueId}-{description}',
      commitConvention: 'conventional',
      commitLanguage: 'ko',
    },
    output: {
      color: true,
      verbose: false,
    },
  };
}

describe('createTracker', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('mock', () => {
    it('mock 타입이면 MockTracker 인스턴스를 반환한다', async () => {
      const tracker = await createTracker(makeConfig({ type: 'mock' }));
      expect(tracker.name).toBe('mock');
    });
  });

  describe('github', () => {
    it('github 타입이면 GitHubTracker 인스턴스를 반환한다', async () => {
      const tracker = await createTracker(
        makeConfig({
          type: 'github',
          github: { owner: 'myorg', repo: 'myrepo' },
        }),
      );
      expect(tracker.name).toBe('github');
    });

    it('token은 선택 사항이다', async () => {
      await expect(
        createTracker(makeConfig({ type: 'github', github: { owner: 'myorg', repo: 'myrepo' } })),
      ).resolves.toBeDefined();
    });

    it('GITHUB_TOKEN 환경변수를 token으로 사용할 수 있다', async () => {
      vi.stubEnv('GITHUB_TOKEN', 'env-token');
      const tracker = await createTracker(
        makeConfig({ type: 'github', github: { owner: 'myorg', repo: 'myrepo' } }),
      );
      expect(tracker.name).toBe('github');
    });

    it('owner가 없으면 CONFIG_ERROR를 throw한다', async () => {
      await expect(
        createTracker(makeConfig({ type: 'github', github: { owner: '', repo: 'myrepo' } })),
      ).rejects.toMatchObject({ code: 'CONFIG_ERROR' } satisfies Partial<AgentError>);
    });

    it('repo가 없으면 CONFIG_ERROR를 throw한다', async () => {
      await expect(
        createTracker(makeConfig({ type: 'github', github: { owner: 'myorg', repo: '' } })),
      ).rejects.toMatchObject({ code: 'CONFIG_ERROR' } satisfies Partial<AgentError>);
    });

    it('github 설정이 없으면 CONFIG_ERROR를 throw한다', async () => {
      await expect(
        createTracker(makeConfig({ type: 'github' })),
      ).rejects.toMatchObject({ code: 'CONFIG_ERROR' } satisfies Partial<AgentError>);
    });
  });

  describe('jira', () => {
    it('jira 타입이면 JiraTracker 인스턴스를 반환한다', async () => {
      const tracker = await createTracker(
        makeConfig({
          type: 'jira',
          jira: { domain: 'mycompany.atlassian.net', email: 'user@example.com', apiToken: 'token' },
        }),
      );
      expect(tracker.name).toBe('jira');
    });

    it('JIRA_API_TOKEN 환경변수를 apiToken으로 사용할 수 있다', async () => {
      vi.stubEnv('JIRA_API_TOKEN', 'env-token');
      const tracker = await createTracker(
        makeConfig({
          type: 'jira',
          jira: { domain: 'mycompany.atlassian.net', email: 'user@example.com' },
        }),
      );
      expect(tracker.name).toBe('jira');
    });

    it('domain이 없으면 CONFIG_ERROR를 throw한다', async () => {
      await expect(
        createTracker(makeConfig({
          type: 'jira',
          jira: { domain: '', email: 'user@example.com', apiToken: 'token' },
        })),
      ).rejects.toMatchObject({ code: 'CONFIG_ERROR' } satisfies Partial<AgentError>);
    });

    it('email이 없으면 CONFIG_ERROR를 throw한다', async () => {
      await expect(
        createTracker(makeConfig({
          type: 'jira',
          jira: { domain: 'mycompany.atlassian.net', email: '', apiToken: 'token' },
        })),
      ).rejects.toMatchObject({ code: 'CONFIG_ERROR' } satisfies Partial<AgentError>);
    });

    it('apiToken이 없고 환경변수도 없으면 CONFIG_ERROR를 throw한다', async () => {
      vi.stubEnv('JIRA_API_TOKEN', '');
      await expect(
        createTracker(makeConfig({
          type: 'jira',
          jira: { domain: 'mycompany.atlassian.net', email: 'user@example.com' },
        })),
      ).rejects.toMatchObject({ code: 'CONFIG_ERROR' } satisfies Partial<AgentError>);
    });

    it('jira 설정이 없으면 CONFIG_ERROR를 throw한다', async () => {
      await expect(
        createTracker(makeConfig({ type: 'jira' })),
      ).rejects.toMatchObject({ code: 'CONFIG_ERROR' } satisfies Partial<AgentError>);
    });
  });

  describe('notion', () => {
    it('notion 타입이면 NotionTracker 인스턴스를 반환한다', async () => {
      const tracker = await createTracker(
        makeConfig({
          type: 'notion',
          notion: { apiKey: 'secret_key', databaseId: 'db-id-123' },
        }),
      );
      expect(tracker.name).toBe('notion');
    });

    it('apiKey가 없고 환경변수도 없으면 CONFIG_ERROR를 throw한다', async () => {
      vi.stubEnv('NOTION_API_KEY', '');
      await expect(
        createTracker(makeConfig({
          type: 'notion',
          notion: { databaseId: 'db-id-123' },
        })),
      ).rejects.toSatisfy((err: unknown) => {
        const e = err as AgentError;
        return e.code === 'CONFIG_ERROR' || e.code === 'TRACKER_ERROR';
      });
    });
  });
});
