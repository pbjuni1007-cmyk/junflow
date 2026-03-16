import fs from 'fs/promises';
import path from 'path';
import boxen from 'boxen';
import ora from 'ora';
import { TaskDecomposer, TaskDecompositionResult } from '../../../agents/task-decomposer.js';
import type { IssueAnalysis } from '../../../agents/issue-analyzer.js';
import type { AIProvider } from '../../../ai/types.js';
import type { AgentContext } from '../../../agents/types.js';
import { logger } from '../../utils/logger.js';
import { sessionManager } from '../../../session/index.js';
import { renderDecompositionBox } from './rendering.js';

export async function runDecomposition(
  aiProvider: AIProvider,
  analysis: IssueAnalysis,
  issueId: string,
  context: AgentContext,
  decompose: boolean,
): Promise<TaskDecompositionResult | undefined> {
  const shouldDecompose = decompose || analysis.complexity === 'high';

  if (!shouldDecompose) return undefined;

  if (!decompose && analysis.complexity === 'high') {
    logger.info(`complexity가 'high'입니다. --decompose로 서브태스크 분해를 권장합니다.`);
  }

  if (!decompose) return undefined;

  const decomposeSpinner = ora('서브태스크 분해 중...').start();
  const taskDecomposer = new TaskDecomposer(aiProvider);
  const decomposeResult = await taskDecomposer.execute({ analysis, issueId }, context);
  decomposeSpinner.stop();

  if (decomposeResult.success) {
    const result = decomposeResult.data;
    console.log(
      boxen(renderDecompositionBox(result), {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'yellow',
        title: ' Task Decomposition (DAG) ',
        titleAlignment: 'left',
      }),
    );
    return result;
  }

  logger.warn(`태스크 분해 실패: ${decomposeResult.error.message}`);
  return undefined;
}

export async function saveIssueState(
  cwd: string,
  issueId: string,
  analysis: IssueAnalysis,
  selectedBranch: string,
  decompositionResult?: TaskDecompositionResult,
): Promise<string> {
  const issueStatePath = path.join(cwd, '.junflow', 'current-issue.json');
  const issueState: Record<string, unknown> = {
    issueId,
    analysis,
    branch: selectedBranch,
    startedAt: new Date().toISOString(),
  };
  if (decompositionResult) {
    issueState['subtasks'] = decompositionResult.subtasks;
    issueState['executionLevels'] = decompositionResult.executionLevels;
    issueState['totalEstimate'] = decompositionResult.totalEstimate;
  }
  await fs.mkdir(path.dirname(issueStatePath), { recursive: true });
  await fs.writeFile(issueStatePath, JSON.stringify(issueState, null, 2), 'utf-8');

  await sessionManager.attachIssue({
    id: issueId,
    title: analysis.title,
    type: analysis.type,
    branch: selectedBranch,
  }).catch(() => {});

  return issueStatePath;
}
