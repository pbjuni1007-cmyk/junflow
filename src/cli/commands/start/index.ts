import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { loadConfig } from '../../../config/loader.js';
import type { JunFlowConfig } from '../../../config/schema.js';
import { ensureGitRepo } from '../../../git/operations.js';
import { IssueAnalyzer } from '../../../agents/issue-analyzer.js';
import { BranchNamer } from '../../../agents/branch-namer.js';
import { ClaudeProvider } from '../../../ai/claude.js';
import { createTracker } from '../../../trackers/factory.js';
import type { AgentContext } from '../../../agents/types.js';
import { handleCliError, cliErrors } from '../../utils/error-handler.js';
import { logger } from '../../utils/logger.js';
import { makeAgentLogger } from '../../utils/agent-logger.js';
import { sessionManager } from '../../../session/index.js';
import { HookRunner } from '../../../hooks/runner.js';
import { renderAnalysisBox } from './rendering.js';
import { selectBranch, createBranchIfNeeded } from './interaction.js';
import { recordAgentResult } from './session-tracking.js';
import { runDecomposition, saveIssueState } from './decomposition.js';
import { WorkflowRunner } from '../../../teams/runner.js';
import { fullDevWorkflow } from '../../../teams/presets.js';
import { createAgentFactory } from '../../../teams/agent-factory.js';
import { formatWorkflowResult } from '../../utils/workflow-renderer.js';

export const startCommand = new Command('start')
  .description('이슈 기반 개발 시작')
  .argument('<issue-id>', '이슈 ID')
  .option('-t, --tracker <type>', '트래커 타입 오버라이드 (notion|mock)')
  .option('--no-branch', '브랜치 생성 건너뛰기')
  .option('--dry-run', '실제 실행 없이 결과만 표시')
  .option('--decompose', '이슈를 서브태스크로 분해')
  .option('--full', '워크플로우 모드 (분석→브랜치→리뷰 자동 실행)')
  .action(async (issueId: string, options: {
    tracker?: string;
    branch?: boolean;
    dryRun?: boolean;
    decompose?: boolean;
    full?: boolean;
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

    // --full: 워크플로우 모드로 전체 플로우 실행
    if (options.full) {
      const agentFactory = createAgentFactory(aiProvider);
      const runner = new WorkflowRunner(context, agentFactory);

      console.log(chalk.bold(`\n워크플로우 모드: ${chalk.cyan('full-dev')}\n`));

      const wfSpinner = ora('워크플로우 실행 중...').start();
      let workflowResult;
      try {
        workflowResult = await runner.execute(fullDevWorkflow);
      } catch (err) {
        wfSpinner.fail('워크플로우 실행 실패');
        handleCliError(err);
      }
      wfSpinner.stop();

      formatWorkflowResult(fullDevWorkflow, workflowResult);

      // post-start 훅 실행
      try {
        await hookRunner.run('post-start', { JUNFLOW_ISSUE_ID: issueId });
      } catch (err) {
        handleCliError(err);
      }

      if (!workflowResult.success) {
        process.exit(1);
      }
      return;
    }

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
    await recordAgentResult('IssueAnalyzer', 'start', analysisResult, cwd);

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

    await recordAgentResult('BranchNamer', 'start', branchResult, cwd);

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
    const selectedBranch = await selectBranch(
      branchCandidates,
      branchName,
      !!options.dryRun,
    );

    // 9. 브랜치 생성
    await createBranchIfNeeded(
      cwd,
      selectedBranch,
      options.branch !== false,
      !!options.dryRun,
    );

    // 10. TaskDecomposer 실행 (--decompose 또는 complexity=high 자동 제안)
    const decompositionResult = await runDecomposition(
      aiProvider, analysis, issueId, context, !!options.decompose,
    );

    // 11. .junflow/current-issue.json 저장 + 세션 연결
    const issueStatePath = await saveIssueState(
      cwd, issueId, analysis, selectedBranch, decompositionResult,
    );

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
