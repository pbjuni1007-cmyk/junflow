import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { simpleGit } from 'simple-git';
import {
  getStagedDiff,
  getCurrentBranch,
  getLastCommit,
  getStatus,
  createBranch,
  commit,
  ensureGitRepo,
} from '../git/operations.js';
import { truncateDiff } from '../utils/diff-truncator.js';
import { loadConfig } from '../config/loader.js';
import { createTracker } from '../trackers/factory.js';
import { sessionManager } from '../session/index.js';

function jsonResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResponse(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }], isError: true as const };
}

export function createMCPServer(): Server {
  const server = new Server(
    { name: 'git-pilot', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // === Context 수집 도구 ===
      {
        name: 'gp_get_staged_diff',
        description: 'staged 변경사항의 diff를 수집합니다. lock/generated/binary 파일은 자동 제외됩니다.',
        inputSchema: {
          type: 'object',
          properties: {
            truncate: { type: 'boolean', description: '토큰 제한 기반 truncation 적용 (기본: true)', default: true },
            maxTokens: { type: 'number', description: 'truncation 시 최대 토큰 수 (기본: 8000)' },
          },
        },
      },
      {
        name: 'gp_get_branch_diff',
        description: '현재 브랜치와 base 브랜치 간의 diff를 수집합니다.',
        inputSchema: {
          type: 'object',
          properties: {
            base: { type: 'string', description: '비교 대상 브랜치 (기본: config의 defaultBaseBranch 또는 main)' },
            truncate: { type: 'boolean', description: '토큰 제한 기반 truncation 적용 (기본: true)', default: true },
          },
        },
      },
      {
        name: 'gp_get_issue',
        description: '이슈 트래커(Notion/GitHub/Jira/Mock)에서 이슈 데이터를 가져옵니다.',
        inputSchema: {
          type: 'object',
          properties: {
            issueId: { type: 'string', description: '이슈 ID' },
            tracker: { type: 'string', enum: ['notion', 'github', 'jira', 'mock'], description: '트래커 타입 오버라이드' },
          },
          required: ['issueId'],
        },
      },
      {
        name: 'gp_get_context',
        description: '현재 작업 컨텍스트를 일괄 조회합니다 (브랜치, 이슈, git 상태, 컨벤션 설정).',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'gp_get_commit_convention',
        description: 'git 커밋/브랜치 컨벤션 설정을 반환합니다.',
        inputSchema: { type: 'object', properties: {} },
      },
      // === Action 실행 도구 ===
      {
        name: 'gp_create_branch',
        description: '새 브랜치를 생성하고 체크아웃합니다.',
        inputSchema: {
          type: 'object',
          properties: {
            branchName: { type: 'string', description: '생성할 브랜치 이름' },
          },
          required: ['branchName'],
        },
      },
      {
        name: 'gp_commit',
        description: '주어진 메시지로 git commit을 실행합니다. staged 파일이 있어야 합니다.',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: '커밋 메시지' },
          },
          required: ['message'],
        },
      },
      {
        name: 'gp_status',
        description: '현재 git-pilot 작업 상태를 조회합니다 (브랜치, git 상태, 세션 정보).',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'gp_session_record',
        description: '세션에 에이전트 호출 기록을 추가합니다.',
        inputSchema: {
          type: 'object',
          properties: {
            agentName: { type: 'string', description: '에이전트 이름' },
            command: { type: 'string', description: '실행한 커맨드' },
            durationMs: { type: 'number', description: '소요 시간 (ms)' },
            success: { type: 'boolean', description: '성공 여부' },
            error: { type: 'string', description: '에러 메시지' },
          },
          required: ['agentName', 'command', 'success'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = (args ?? {}) as Record<string, unknown>;
    const cwd = process.cwd();

    try {
      switch (name) {
        // === Context 수집 도구 ===

        case 'gp_get_staged_diff': {
          await ensureGitRepo(cwd);
          const diff = await getStagedDiff(cwd);
          if (!diff || diff.trim() === '') {
            return errorResponse('staged 변경사항이 없습니다. git add 후 다시 시도하세요.');
          }
          const shouldTruncate = params['truncate'] !== false;
          if (shouldTruncate) {
            const maxTokens = typeof params['maxTokens'] === 'number' ? params['maxTokens'] : undefined;
            const result = truncateDiff(diff, maxTokens);
            return jsonResponse({
              diff: result.truncatedDiff,
              wasTruncated: result.wasTruncated,
              omittedFiles: result.omittedFiles,
            });
          }
          return jsonResponse({ diff, wasTruncated: false, omittedFiles: [] });
        }

        case 'gp_get_branch_diff': {
          await ensureGitRepo(cwd);
          const config = await loadConfig();
          const base = (params['base'] as string) ?? config.git.defaultBaseBranch ?? 'main';
          const git = simpleGit(cwd);
          const diff = await git.diff([`${base}..HEAD`]);
          if (!diff.trim()) {
            return jsonResponse({ diff: '', files: [], message: `${base} 대비 변경사항이 없습니다.` });
          }
          const shouldTruncate = params['truncate'] !== false;
          if (shouldTruncate) {
            const result = truncateDiff(diff);
            return jsonResponse({
              diff: result.truncatedDiff,
              base,
              wasTruncated: result.wasTruncated,
              omittedFiles: result.omittedFiles,
            });
          }
          return jsonResponse({ diff, base, wasTruncated: false, omittedFiles: [] });
        }

        case 'gp_get_issue': {
          const issueId = params['issueId'] as string;
          const config = await loadConfig();
          const trackerOverride = params['tracker'] as string | undefined;
          const effectiveConfig = trackerOverride
            ? { ...config, tracker: { ...config.tracker, type: trackerOverride as 'notion' | 'github' | 'jira' | 'mock' } }
            : config;
          const tracker = await createTracker(effectiveConfig);
          const issue = await tracker.getIssue(issueId);
          return jsonResponse(issue);
        }

        case 'gp_get_context': {
          await ensureGitRepo(cwd);
          const config = await loadConfig();
          let branch = '(unknown)';
          try { branch = await getCurrentBranch(cwd); } catch { /* ignore */ }

          let lastCommit = null;
          try { lastCommit = await getLastCommit(cwd); } catch { /* ignore */ }

          let gitStatus = null;
          try { gitStatus = await getStatus(cwd); } catch { /* ignore */ }

          let currentIssue = null;
          try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const content = await fs.readFile(path.join(cwd, '.git-pilot/current-issue.json'), 'utf-8');
            currentIssue = JSON.parse(content);
          } catch { /* ignore */ }

          return jsonResponse({
            branch,
            lastCommit,
            status: gitStatus,
            currentIssue,
            convention: {
              branchConvention: config.git.branchConvention,
              commitConvention: config.git.commitConvention,
              commitLanguage: config.git.commitLanguage,
              defaultBaseBranch: config.git.defaultBaseBranch ?? 'main',
            },
          });
        }

        case 'gp_get_commit_convention': {
          const config = await loadConfig();
          return jsonResponse({
            branchConvention: config.git.branchConvention,
            commitConvention: config.git.commitConvention,
            commitLanguage: config.git.commitLanguage,
            defaultBaseBranch: config.git.defaultBaseBranch ?? 'main',
          });
        }

        // === Action 실행 도구 ===

        case 'gp_create_branch': {
          await ensureGitRepo(cwd);
          const branchName = params['branchName'] as string;
          await createBranch(cwd, branchName);
          return jsonResponse({ success: true, branch: branchName });
        }

        case 'gp_commit': {
          await ensureGitRepo(cwd);
          const message = params['message'] as string;
          const hash = await commit(cwd, message);
          return jsonResponse({ success: true, hash, message });
        }

        case 'gp_status': {
          let gitStatus = null;
          try {
            await ensureGitRepo(cwd);
            const status = await getStatus(cwd);
            const branch = await getCurrentBranch(cwd);
            const lastCommitData = await getLastCommit(cwd);
            gitStatus = { branch, ...status, lastCommit: lastCommitData };
          } catch { /* ignore */ }

          let currentSession = null;
          try {
            currentSession = await sessionManager.getCurrent();
          } catch { /* ignore */ }

          return jsonResponse({
            version: '1.0.0',
            workingDir: cwd,
            git: gitStatus,
            session: currentSession ? {
              id: currentSession.id,
              status: currentSession.status,
              startedAt: currentSession.startedAt,
              agentCalls: currentSession.agentCalls.length,
              totalTokens: currentSession.tokenUsage.total,
            } : null,
          });
        }

        case 'gp_session_record': {
          await sessionManager.start(cwd).catch(() => {});
          await sessionManager.recordAgentCall({
            agentName: params['agentName'] as string,
            command: params['command'] as string,
            timestamp: new Date().toISOString(),
            durationMs: (params['durationMs'] as number) ?? 0,
            success: params['success'] as boolean,
            error: params['error'] as string | undefined,
          });
          return jsonResponse({ recorded: true });
        }

        default:
          return errorResponse(`알 수 없는 도구: ${name}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(`에러: ${msg}`);
    }
  });

  return server;
}
