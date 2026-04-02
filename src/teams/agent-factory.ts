import type { AIProvider } from '../ai/types.js';
import type { Agent } from '../agents/types.js';
import type { AgentFactory } from './runner.js';
import type { CliWorkerConfig, CliName } from '../orchestrator/types.js';
import { IssueAnalyzer } from '../agents/issue-analyzer.js';
import { BranchNamer } from '../agents/branch-namer.js';
import { CommitWriter } from '../agents/commit-writer.js';
import { CodeReviewer } from '../agents/code-reviewer.js';
import { Verifier } from '../agents/verifier.js';
import { DeepCodeReviewer } from '../agents/deep-code-reviewer.js';
import { DeepCommitWriter } from '../agents/deep-commit-writer.js';
import { PlanAgent } from '../agents/plan-agent.js';
import { MockTracker } from '../trackers/mock.js';

/** CLI 워커 에이전트 이름 → CliWorkerConfig 매핑 */
const CLI_WORKER_PREFIX = 'CliWorker:';

function parseCliWorkerName(agentName: string): CliWorkerConfig | null {
  if (!agentName.startsWith(CLI_WORKER_PREFIX)) return null;
  const rest = agentName.slice(CLI_WORKER_PREFIX.length);
  const [cli, ...promptParts] = rest.split(':');
  if (!cli || !['codex', 'gemini', 'claude'].includes(cli)) return null;
  return {
    type: 'cli-worker',
    cli: cli as CliName,
    prompt: promptParts.join(':') || '',
  };
}

/**
 * 에이전트 이름 → 인스턴스를 생성하는 공용 팩토리.
 * WorkflowRunner에 주입하여 DAG 프리셋을 실제 에이전트로 연결한다.
 *
 * CLI 워커: 이름이 "CliWorker:codex:프롬프트" 형태면 CliWorkerConfig 반환.
 */
export function createAgentFactory(aiProvider: AIProvider): AgentFactory {
  return (agentName: string): Agent<unknown, unknown> | CliWorkerConfig | null => {
    // CLI 워커 체크
    const cliConfig = parseCliWorkerName(agentName);
    if (cliConfig) return cliConfig;

    switch (agentName) {
      case 'IssueAnalyzer':
        return new IssueAnalyzer(aiProvider, new MockTracker()) as Agent<unknown, unknown>;
      case 'BranchNamer':
        return new BranchNamer(aiProvider) as Agent<unknown, unknown>;
      case 'CommitWriter':
        return new CommitWriter(aiProvider) as Agent<unknown, unknown>;
      case 'CodeReviewer':
        return new CodeReviewer(aiProvider) as Agent<unknown, unknown>;
      case 'Verifier':
        return new Verifier(aiProvider) as Agent<unknown, unknown>;
      case 'DeepCodeReviewer':
        return new DeepCodeReviewer(aiProvider) as Agent<unknown, unknown>;
      case 'DeepCommitWriter':
        return new DeepCommitWriter(aiProvider) as Agent<unknown, unknown>;
      case 'PlanAgent':
        return new PlanAgent(aiProvider) as Agent<unknown, unknown>;
      default:
        return null;
    }
  };
}
