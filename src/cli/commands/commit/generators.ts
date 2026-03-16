import ora from 'ora';
import chalk from 'chalk';
import { CommitWriter, commitMessageSchema } from '../../../agents/commit-writer.js';
import { getAvailableProviders } from '../../../ai/multi-provider.js';
import { ConsensusRunner } from '../../../ai/consensus.js';
import { Verifier, verifyLoop } from '../../../agents/verifier.js';
import type { AIProvider } from '../../../ai/types.js';
import type { AgentContext } from '../../../agents/types.js';
import { handleCliError } from '../../utils/error-handler.js';
import { logger } from '../../utils/logger.js';
import { sessionManager } from '../../../session/index.js';
import type { IssueContext } from './rendering.js';

interface CommitAgentInput {
  diff: string;
  issueAnalysis: IssueContext | undefined;
  convention: 'conventional' | 'gitmoji' | undefined;
  language: 'ko' | 'en' | undefined;
}

interface GenerateResult {
  message: string;
  alternatives: string[];
}

export async function generateConsensus(
  aiProvider: AIProvider,
  agentInput: CommitAgentInput,
  config: { git: { commitConvention: string; commitLanguage: string } },
  diff: string,
  issueAnalysis: IssueContext | undefined,
): Promise<GenerateResult> {
  const spinner = ora('멀티모델 합의 생성 중...').start();
  const providers = await getAvailableProviders();
  if (providers.length === 0) {
    spinner.stop();
    logger.error('AI API 키가 설정되지 않았습니다. ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY 중 하나를 설정해주세요.');
    process.exit(1);
  }
  spinner.text = `${providers.length}개 모델로 커밋 메시지 생성 중...`;

  const consensusRunner = new ConsensusRunner(aiProvider);
  const { truncateDiff } = await import('../../../ai/diff-truncator.js');
  const { COMMIT_WRITER_SYSTEM } = await import('../../../ai/prompts/commit-message.js');
  const { truncatedDiff } = truncateDiff(diff);

  const convention = agentInput.convention ?? config.git.commitConvention;
  const language = agentInput.language ?? config.git.commitLanguage;

  try {
    const consensusResult = await consensusRunner.run(
      providers,
      {
        systemPrompt: `${COMMIT_WRITER_SYSTEM}\nUse ${convention} convention. ${language === 'ko' ? '한국어로 작성.' : 'Write in English.'}\nRespond with JSON: {"message":"string","alternatives":["string"],"scope":"string|null","breakingChange":boolean}`,
        userPrompt: `## Staged Diff\n${truncatedDiff}${issueAnalysis ? `\n\n## Issue Context\nTitle: ${issueAnalysis.title}\nType: ${issueAnalysis.type}` : ''}`,
        maxTokens: 2048,
        temperature: 0.3,
      },
      commitMessageSchema,
    );

    spinner.stop();
    logger.info(`합의 완료: ${consensusResult.providersUsed.join(' + ')} (일치도: ${consensusResult.agreementScore}%)`);

    await sessionManager.recordAgentCall({
      agentName: 'ConsensusRunner',
      command: 'commit --consensus',
      timestamp: new Date().toISOString(),
      durationMs: 0,
      tokensUsed: consensusResult.totalTokensUsed,
      success: true,
    }).catch(() => {});

    return {
      message: consensusResult.consensus.message,
      alternatives: consensusResult.consensus.alternatives,
    };
  } catch (err) {
    spinner.stop();
    handleCliError(err);
  }
}

export async function generateWithVerify(
  agent: CommitWriter,
  aiProvider: AIProvider,
  agentInput: CommitAgentInput,
  agentContext: AgentContext,
  diff: string,
): Promise<GenerateResult> {
  const spinner = ora('AI 커밋 메시지 생성 + 검증 중...').start();
  const verifier = new Verifier(aiProvider);

  try {
    const verified = await verifyLoop(agent, verifier, agentInput, agentContext, {
      taskDescription: `Generate a high-quality commit message for the following diff:\n${diff.slice(0, 500)}...`,
      criteria: [
        'Message follows conventional commit format',
        'Message is concise (under 72 characters)',
        'Message accurately describes the changes',
        'Alternatives are meaningfully different from main message',
      ],
      maxRetries: 2,
      onRetry: (attempt, issues) => {
        spinner.text = `검증 실패, 재생성 중 (${attempt}/2)... ${issues[0] ?? ''}`;
      },
    });

    spinner.stop();

    const vr = verified.verification;
    const statusIcon = vr.approved ? chalk.green('✓') : chalk.yellow('△');
    logger.info(`검증 ${statusIcon} (${vr.score}/10, ${verified.attempts}회 시도)`);
    if (vr.issues.length > 0) {
      for (const issue of vr.issues) {
        logger.warn(`  ${issue}`);
      }
    }

    if (!verified.result.success) {
      handleCliError(verified.result.error);
    }

    await sessionManager.recordAgentCall({
      agentName: 'CommitWriter+Verifier',
      command: 'commit --verify',
      timestamp: new Date().toISOString(),
      durationMs: verified.result.metadata.durationMs,
      tokensUsed: verified.result.metadata.tokensUsed,
      success: verified.result.success,
    }).catch(() => {});

    return {
      message: verified.result.data.message,
      alternatives: verified.result.data.alternatives,
    };
  } catch (err) {
    spinner.stop();
    handleCliError(err);
  }
}

export async function generateDefault(
  agent: CommitWriter,
  agentInput: CommitAgentInput,
  agentContext: AgentContext,
): Promise<GenerateResult> {
  const spinner = ora('AI가 커밋 메시지를 생성 중...').start();
  const result = await agent.execute(agentInput, agentContext);
  spinner.stop();

  await sessionManager.recordAgentCall({
    agentName: 'CommitWriter',
    command: 'commit',
    timestamp: new Date().toISOString(),
    durationMs: result.metadata.durationMs,
    tokensUsed: result.metadata.tokensUsed,
    success: result.success,
    error: result.success ? undefined : result.error.message,
  }).catch(() => {});

  if (!result.success) {
    handleCliError(result.error);
  }

  return {
    message: result.data.message,
    alternatives: result.data.alternatives,
  };
}
