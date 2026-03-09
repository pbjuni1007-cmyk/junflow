import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MockTracker } from '../trackers/mock.js';
import { IssueAnalyzer } from '../agents/issue-analyzer.js';
import { BranchNamer } from '../agents/branch-namer.js';
import { CommitWriter } from '../agents/commit-writer.js';
import { CodeReviewer } from '../agents/code-reviewer.js';
import { createAIProvider } from '../ai/provider-factory.js';
import { loadConfig } from '../config/loader.js';
import type { AgentContext } from '../agents/types.js';
import type { IssueAnalysis } from '../agents/issue-analyzer.js';
import { simpleGit } from 'simple-git';

function makeContext(config: Awaited<ReturnType<typeof loadConfig>>): AgentContext {
  return {
    workingDir: process.cwd(),
    config,
    logger: {
      info: (msg: string) => process.stderr.write(`[junflow-mcp] INFO: ${msg}\n`),
      warn: (msg: string) => process.stderr.write(`[junflow-mcp] WARN: ${msg}\n`),
      error: (msg: string) => process.stderr.write(`[junflow-mcp] ERROR: ${msg}\n`),
      debug: (msg: string) => process.stderr.write(`[junflow-mcp] DEBUG: ${msg}\n`),
    },
  };
}

export function createMCPServer(): Server {
  const server = new Server(
    {
      name: 'junflow',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'junflow_get_issue',
        description: '이슈 트래커에서 이슈 조회',
        inputSchema: {
          type: 'object',
          properties: {
            issueId: { type: 'string', description: '이슈 ID' },
            tracker: { type: 'string', enum: ['notion', 'mock'], default: 'mock' },
          },
          required: ['issueId'],
        },
      },
      {
        name: 'junflow_analyze_issue',
        description: 'AI로 이슈 분석 (타입, 복잡도, 요구사항 추출)',
        inputSchema: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
          },
          required: ['issueId'],
        },
      },
      {
        name: 'junflow_suggest_branch',
        description: '이슈 분석 결과 기반 브랜치 이름 제안',
        inputSchema: {
          type: 'object',
          properties: {
            issueId: { type: 'string' },
            analysis: { type: 'object', description: 'IssueAnalysis 객체' },
          },
          required: ['issueId'],
        },
      },
      {
        name: 'junflow_generate_commit',
        description: 'staged diff 기반 AI 커밋 메시지 생성',
        inputSchema: {
          type: 'object',
          properties: {
            diff: { type: 'string', description: 'git diff 문자열 (없으면 자동 수집)' },
          },
        },
      },
      {
        name: 'junflow_review_code',
        description: 'diff 기반 AI 코드 리뷰',
        inputSchema: {
          type: 'object',
          properties: {
            diff: { type: 'string' },
            focusAreas: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      {
        name: 'junflow_status',
        description: '현재 junflow 작업 상태 조회',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = (args ?? {}) as Record<string, unknown>;

    switch (name) {
      case 'junflow_get_issue': {
        const issueId = params['issueId'] as string;
        const tracker = new MockTracker();
        try {
          const issue = await tracker.getIssue(issueId);
          return {
            content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String((err as { message?: string }).message ?? err);
          return {
            content: [{ type: 'text', text: `에러: ${msg}` }],
            isError: true,
          };
        }
      }

      case 'junflow_analyze_issue': {
        const issueId = params['issueId'] as string;
        const config = await loadConfig(process.cwd());
        const aiProvider = await createAIProvider(config);
        const tracker = new MockTracker();
        const analyzer = new IssueAnalyzer(aiProvider, tracker);
        const ctx = makeContext(config);
        const result = await analyzer.execute({ issueId, trackerType: 'mock' }, ctx);
        if (!result.success) {
          return {
            content: [{ type: 'text', text: `에러: ${result.error.message}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case 'junflow_suggest_branch': {
        const issueId = params['issueId'] as string;
        const analysis = params['analysis'] as IssueAnalysis | undefined;
        const config = await loadConfig(process.cwd());
        const aiProvider = await createAIProvider(config);
        const ctx = makeContext(config);

        let resolvedAnalysis = analysis;
        if (!resolvedAnalysis) {
          const tracker = new MockTracker();
          const analyzer = new IssueAnalyzer(aiProvider, tracker);
          const analyzeResult = await analyzer.execute({ issueId, trackerType: 'mock' }, ctx);
          if (!analyzeResult.success) {
            return {
              content: [{ type: 'text', text: `이슈 분석 에러: ${analyzeResult.error.message}` }],
              isError: true,
            };
          }
          resolvedAnalysis = analyzeResult.data;
        }

        const namer = new BranchNamer(aiProvider);
        const result = await namer.execute({ issueId, analysis: resolvedAnalysis }, ctx);
        if (!result.success) {
          return {
            content: [{ type: 'text', text: `에러: ${result.error.message}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case 'junflow_generate_commit': {
        let diff = params['diff'] as string | undefined;
        if (!diff) {
          const git = simpleGit(process.cwd());
          diff = await git.diff(['--cached']);
          if (!diff) {
            return {
              content: [{ type: 'text', text: 'staged 변경사항이 없습니다. git add 후 다시 시도하세요.' }],
              isError: true,
            };
          }
        }
        const config = await loadConfig(process.cwd());
        const aiProvider = await createAIProvider(config);
        const writer = new CommitWriter(aiProvider);
        const ctx = makeContext(config);
        const result = await writer.execute({ diff }, ctx);
        if (!result.success) {
          return {
            content: [{ type: 'text', text: `에러: ${result.error.message}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case 'junflow_review_code': {
        let diff = params['diff'] as string | undefined;
        if (!diff) {
          const git = simpleGit(process.cwd());
          diff = await git.diff(['HEAD']);
          if (!diff) {
            return {
              content: [{ type: 'text', text: '리뷰할 diff가 없습니다.' }],
              isError: true,
            };
          }
        }
        const focusAreas = params['focusAreas'] as ('security' | 'performance' | 'readability' | 'testing')[] | undefined;
        const config = await loadConfig(process.cwd());
        const aiProvider = await createAIProvider(config);
        const reviewer = new CodeReviewer(aiProvider);
        const ctx = makeContext(config);
        const result = await reviewer.execute({ diff, focusAreas }, ctx);
        if (!result.success) {
          return {
            content: [{ type: 'text', text: `에러: ${result.error.message}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        };
      }

      case 'junflow_status': {
        const git = simpleGit(process.cwd());
        let gitStatus = 'git status 조회 실패';
        try {
          const status = await git.status();
          gitStatus = JSON.stringify({
            branch: status.current,
            staged: status.staged,
            modified: status.modified,
            untracked: status.not_added,
          }, null, 2);
        } catch {
          // 무시
        }
        return {
          content: [
            {
              type: 'text',
              text: `junflow v0.2.0 상태\n\n작업 디렉토리: ${process.cwd()}\n\ngit 상태:\n${gitStatus}`,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `알 수 없는 도구: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}
