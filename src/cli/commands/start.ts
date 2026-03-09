import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import type { JunFlowConfig } from '../../config/schema.js';
import { ensureGitRepo, branchExists, createBranch } from '../../git/operations.js';
import { IssueAnalyzer } from '../../agents/issue-analyzer.js';
import { BranchNamer } from '../../agents/branch-namer.js';
import { TaskDecomposer, TaskDecompositionResult } from '../../agents/task-decomposer.js';
import { ClaudeProvider } from '../../ai/claude.js';
import { createTracker } from '../../trackers/factory.js';
import { trackTokenUsage } from '../utils/token-tracker.js';
import type { AgentContext } from '../../agents/types.js';
import { handleCliError, cliErrors } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../../session/index.js';
import { HookRunner } from '../../hooks/runner.js';

function makeAgentLogger(verbose: boolean) {
  return {
    info: (msg: string) => { if (verbose) console.log(chalk.gray(msg)); },
    warn: (msg: string) => console.warn(`${chalk.yellow('⚠')} ${msg}`),
    error: (msg: string) => console.error(`${chalk.red('✖')} ${msg}`),
    debug: (msg: string) => { if (verbose) console.log(chalk.dim(msg)); },
  };
}

function renderAnalysisBox(
  analysis: {
    title: string;
    type: string;
    complexity: string;
    keyRequirements: string[];
    suggestedApproach: string;
  },
  branchCandidates: string[],
): string {
  const typeColor = {
    feature: chalk.green,
    bugfix: chalk.red,
    refactor: chalk.blue,
    chore: chalk.gray,
    docs: chalk.cyan,
  }[analysis.type] ?? chalk.white;

  const complexityColor = {
    low: chalk.green,
    medium: chalk.yellow,
    high: chalk.red,
  }[analysis.complexity] ?? chalk.white;

  const lines: string[] = [];
  lines.push(chalk.bold('Issue Analysis'));
  lines.push(`${chalk.dim('Title:')} ${analysis.title}`);
  lines.push(`${chalk.dim('Type:')} ${typeColor(analysis.type)}  ${chalk.dim('Complexity:')} ${complexityColor(analysis.complexity)}`);

  if (analysis.keyRequirements.length > 0) {
    lines.push(`${chalk.dim('Requirements:')}`);
    for (const req of analysis.keyRequirements) {
      lines.push(`  ${chalk.dim('-')} ${req}`);
    }
  }

  if (analysis.suggestedApproach) {
    lines.push(`${chalk.dim('Suggested Approach:')}`);
    lines.push(`  ${analysis.suggestedApproach}`);
  }

  lines.push('');
  lines.push(chalk.bold('Branch'));
  if (branchCandidates.length > 0) {
    lines.push(`  ${chalk.cyan('>')} ${chalk.bold(branchCandidates[0] ?? '')}`);
    for (let i = 1; i < branchCandidates.length; i++) {
      lines.push(`    ${branchCandidates[i] ?? ''}`);
    }
  }

  return lines.join('\n');
}

function renderDecompositionBox(result: TaskDecompositionResult): string {
  const complexityColor = (c: string) =>
    ({ low: chalk.green, medium: chalk.yellow, high: chalk.red }[c] ?? chalk.white)(c);

  const lines: string[] = [];
  lines.push(chalk.bold(`Task Decomposition (${result.graphType.toUpperCase()}) | Total: ${result.totalEstimate}`));
  lines.push('');

  for (let lvl = 0; lvl < result.executionLevels.length; lvl++) {
    const levelIds = result.executionLevels[lvl]!;
    const label = lvl === 0 && levelIds.length > 1 ? `Level ${lvl} ${chalk.dim('(병렬)')}:` : `Level ${lvl}:`;
    lines.push(chalk.bold(label));
    for (const id of levelIds) {
      const task = result.subtasks.find((t) => t.id === id);
      if (!task) continue;
      const deps = task.dependsOn.length > 0 ? chalk.dim(` → ${task.dependsOn.join(', ')}`) : '';
      lines.push(`  ${chalk.cyan(`[${task.id}]`)} ${task.title} ${chalk.dim(`(${complexityColor(task.estimatedComplexity)})`)}${deps}`);
    }
    if (lvl < result.executionLevels.length - 1) lines.push('');
  }

  return lines.join('\n');
}

export const startCommand = new Command('start')
  .description('이슈 기반 개발 시작')
  .argument('<issue-id>', '이슈 ID')
  .option('-t, --tracker <type>', '트래커 타입 오버라이드 (notion|mock)')
  .option('--no-branch', '브랜치 생성 건너뛰기')
  .option('--dry-run', '실제 실행 없이 결과만 표시')
  .option('--decompose', '이슈를 서브태스크로 분해')
  .action(async (issueId: string, options: {
    tracker?: string;
    branch?: boolean;
    dryRun?: boolean;
    decompose?: boolean;
  }) => {
    const cwd = process.cwd();

    // 0. 세션 시작
    await sessionManager.start(cwd).catch(() => {/* 세션 시작 실패는 무시 */});

    // 0-1. pre-start 훅 실행
    const hookRunner = await HookRunner.fromConfig(cwd);
    try {
      await hookRunner.run('pre-start', { JUNFLOW_ISSUE_ID: issueId });
    } catch (err) {
      handleCliError(err);
    }

    // 1. Config 로드
    let config;
    try {
      config = await loadConfig();
    } catch (err) {
      handleCliError(err);
    }

    // 2. Git 저장소 확인
    try {
      await ensureGitRepo(cwd);
    } catch {
      cliErrors.notGitRepo();
    }

    // 3. 트래커 인스턴스 생성
    const effectiveConfig = options.tracker
      ? { ...config, tracker: { ...config.tracker, type: options.tracker as JunFlowConfig['tracker']['type'] } }
      : config;
    let tracker;
    try {
      tracker = await createTracker(effectiveConfig);
    } catch (err) {
      handleCliError(err);
    }

    // 4. AI 프로바이더 생성
    const apiKey = config.ai.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      cliErrors.missingApiKey('ANTHROPIC_API_KEY');
    }
    const aiProvider = new ClaudeProvider(apiKey);

    const agentLogger = makeAgentLogger(config.output.verbose);
    const context: AgentContext = { workingDir: cwd, config, logger: agentLogger };

    // 5. IssueAnalyzer 실행
    const analyzeSpinner = ora(`이슈 ${issueId} 분석 중...`).start();
    const issueAnalyzer = new IssueAnalyzer(aiProvider, tracker);
    const analysisResult = await issueAnalyzer.execute({ issueId, trackerType }, context);
    analyzeSpinner.stop();

    if (!analysisResult.success) {
      handleCliError(analysisResult.error);
    }

    const analysis = analysisResult.data;

    // 토큰 추적 + 세션 에이전트 호출 기록
    if (analysisResult.metadata.tokensUsed) {
      await trackTokenUsage(
        {
          agentName: 'IssueAnalyzer',
          tokensUsed: analysisResult.metadata.tokensUsed,
          timestamp: new Date().toISOString(),
        },
        cwd,
      ).catch(() => {/* 토큰 추적 실패는 무시 */});
    }
    await sessionManager.recordAgentCall({
      agentName: 'IssueAnalyzer',
      command: 'start',
      timestamp: new Date().toISOString(),
      durationMs: analysisResult.metadata.durationMs,
      tokensUsed: analysisResult.metadata.tokensUsed,
      success: analysisResult.success,
      error: analysisResult.success ? undefined : analysisResult.error.message,
    }).catch(() => {});

    // 6. BranchNamer 실행
    const branchSpinner = ora('브랜치 이름 생성 중...').start();
    const branchNamer = new BranchNamer(aiProvider);
    const branchResult = await branchNamer.execute(
      {
        analysis,
        issueId,
        convention: config.git.branchConvention,
      },
      context,
    );
    branchSpinner.stop();

    if (!branchResult.success) {
      handleCliError(branchResult.error);
    }

    if (branchResult.metadata.tokensUsed) {
      await trackTokenUsage(
        {
          agentName: 'BranchNamer',
          tokensUsed: branchResult.metadata.tokensUsed,
          timestamp: new Date().toISOString(),
        },
        cwd,
      ).catch(() => {/* 토큰 추적 실패는 무시 */});
    }
    await sessionManager.recordAgentCall({
      agentName: 'BranchNamer',
      command: 'start',
      timestamp: new Date().toISOString(),
      durationMs: branchResult.metadata.durationMs,
      tokensUsed: branchResult.metadata.tokensUsed,
      success: branchResult.success,
      error: branchResult.success ? undefined : branchResult.error.message,
    }).catch(() => {});

    const { branchName, alternatives } = branchResult.data;
    const branchCandidates = [branchName, ...alternatives].slice(0, 3);

    // 7. 결과 출력 (boxen)
    const boxContent = renderAnalysisBox(analysis, branchCandidates);
    console.log(
      boxen(boxContent, {
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: 'cyan',
      }),
    );

    // 8. 브랜치 선택 UI
    let selectedBranch: string;

    if (options.dryRun) {
      selectedBranch = branchCandidates[0] ?? branchName;
    } else {
      const choices = branchCandidates.map((b, i) => ({
        name: i === 0 ? `${chalk.cyan('>')} ${b} ${chalk.dim('(추천)')}` : `  ${b}`,
        value: b,
        short: b,
      }));
      choices.push({ name: chalk.dim('  직접 입력...'), value: '__custom__', short: '직접 입력' });

      const { chosenBranch } = await inquirer.prompt<{ chosenBranch: string }>([
        {
          type: 'list',
          name: 'chosenBranch',
          message: '브랜치를 선택하세요:',
          choices,
          default: branchCandidates[0],
        },
      ]);

      if (chosenBranch === '__custom__') {
        const { customBranch } = await inquirer.prompt<{ customBranch: string }>([
          {
            type: 'input',
            name: 'customBranch',
            message: '브랜치 이름을 입력하세요:',
            default: branchCandidates[0],
            validate: (input: string) => input.trim().length > 0 || '브랜치 이름을 입력해야 합니다',
          },
        ]);
        selectedBranch = customBranch.trim();
      } else {
        selectedBranch = chosenBranch;
      }
    }

    // 9. 브랜치 생성
    if (options.branch !== false && !options.dryRun) {
      const exists = await branchExists(cwd, selectedBranch);
      if (exists) {
        logger.warn(`브랜치 '${selectedBranch}'가 이미 존재합니다.`);
      } else {
        const branchCreateSpinner = ora(`브랜치 '${selectedBranch}' 생성 중...`).start();
        try {
          await createBranch(cwd, selectedBranch);
          branchCreateSpinner.stop();
          logger.success(`브랜치 '${selectedBranch}' 생성 완료`);
        } catch (err) {
          branchCreateSpinner.stop();
          handleCliError(err);
        }
      }
    }

    // 10. TaskDecomposer 실행 (--decompose 또는 complexity=high 자동 제안)
    let decompositionResult: TaskDecompositionResult | undefined;

    const shouldDecompose = options.decompose || analysis.complexity === 'high';

    if (shouldDecompose) {
      if (!options.decompose && analysis.complexity === 'high') {
        logger.info(`complexity가 'high'입니다. --decompose로 서브태스크 분해를 권장합니다.`);
      }

      if (options.decompose) {
        const decomposeSpinner = ora('서브태스크 분해 중...').start();
        const taskDecomposer = new TaskDecomposer(aiProvider);
        const decomposeResult = await taskDecomposer.execute({ analysis, issueId }, context);
        decomposeSpinner.stop();

        if (decomposeResult.success) {
          decompositionResult = decomposeResult.data;
          console.log(
            boxen(renderDecompositionBox(decompositionResult), {
              padding: { top: 0, bottom: 0, left: 1, right: 1 },
              borderStyle: 'round',
              borderColor: 'yellow',
              title: ' Task Decomposition (DAG) ',
              titleAlignment: 'left',
            }),
          );
        } else {
          logger.warn(`태스크 분해 실패: ${decomposeResult.error.message}`);
        }
      }
    }

    // 11. .junflow/current-issue.json 저장
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

    // 세션에 이슈 정보 연결
    await sessionManager.attachIssue({
      id: issueId,
      title: analysis.title,
      type: analysis.type,
      branch: selectedBranch,
    }).catch(() => {});

    // post-start 훅 실행
    try {
      await hookRunner.run('post-start', {
        JUNFLOW_ISSUE_ID: issueId,
        JUNFLOW_BRANCH: selectedBranch,
      });
    } catch (err) {
      handleCliError(err);
    }

    if (options.dryRun) {
      logger.info('[dry-run] 브랜치 생성 및 Git 변경 없이 완료');
      logger.info(`[dry-run] current-issue.json은 저장되었습니다: ${issueStatePath}`);
    } else {
      logger.success(`개발 시작 준비 완료! 현재 이슈: ${chalk.bold(issueId)}`);
    }
  });
