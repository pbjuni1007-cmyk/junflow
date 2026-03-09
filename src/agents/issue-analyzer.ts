import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentError } from './types.js';
import { AIProvider } from '../ai/types.js';
import { IssueTracker } from '../trackers/types.js';
import { parseAIResponse } from '../ai/response-parser.js';
import { ISSUE_ANALYZER_SYSTEM } from '../ai/prompts/issue-analysis.js';

export interface IssueAnalyzerInput {
  issueId: string;
  trackerType: 'notion' | 'mock';
}

export interface IssueAnalysis {
  title: string;
  summary: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'chore' | 'docs';
  complexity: 'low' | 'medium' | 'high';
  keyRequirements: string[];
  suggestedApproach: string;
}

const issueAnalysisSchema = z.object({
  title: z.string(),
  summary: z.string(),
  type: z.enum(['feature', 'bugfix', 'refactor', 'chore', 'docs']),
  complexity: z.enum(['low', 'medium', 'high']),
  keyRequirements: z.array(z.string()),
  suggestedApproach: z.string(),
});

function buildSystemPrompt(): string {
  return `${ISSUE_ANALYZER_SYSTEM}`;
}

function buildUserPrompt(issueId: string, title: string, description: string, labels: string[]): string {
  const lines: string[] = [];
  lines.push('## Issue Information');
  lines.push(`ID: ${issueId}`);
  lines.push(`Title: ${title}`);
  if (description) {
    lines.push('');
    lines.push('## Description');
    lines.push(description);
  }
  if (labels.length > 0) {
    lines.push('');
    lines.push(`Labels: ${labels.join(', ')}`);
  }
  return lines.join('\n');
}

export class IssueAnalyzer extends BaseAgent<IssueAnalyzerInput, IssueAnalysis> {
  name = 'IssueAnalyzer';
  description = '이슈 분석 에이전트';

  constructor(
    private aiProvider: AIProvider,
    private tracker: IssueTracker,
  ) {
    super();
  }

  protected async run(
    input: IssueAnalyzerInput,
    context: AgentContext,
  ): Promise<{ data: IssueAnalysis; tokensUsed?: number }> {
    // 1. 트래커에서 이슈 조회
    let issue;
    try {
      issue = await this.tracker.getIssue(input.issueId);
    } catch (err) {
      const agentError: AgentError = {
        code: 'TRACKER_ERROR',
        message: err instanceof Error ? err.message : String((err as AgentError).message ?? err),
        cause: err,
      };
      throw agentError;
    }

    // 2. AI에게 이슈 분석 요청
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(issue.id, issue.title, issue.description, issue.labels);

    const request = {
      systemPrompt,
      userPrompt,
      model: context.config.ai.agentModels?.issueAnalyzer ?? context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.3,
    };

    const response = await this.aiProvider.complete(request);

    // 3. 응답 파싱 및 검증
    let parsed;
    try {
      parsed = await parseAIResponse(response.content, issueAnalysisSchema, {
        maxRetries: 1,
        aiProvider: this.aiProvider,
        originalRequest: request,
      });
    } catch (err) {
      const agentError: AgentError = {
        code: 'AI_PARSE_ERROR',
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      };
      throw agentError;
    }

    const result: IssueAnalysis = {
      title: parsed.title,
      summary: parsed.summary,
      type: parsed.type,
      complexity: parsed.complexity,
      keyRequirements: parsed.keyRequirements,
      suggestedApproach: parsed.suggestedApproach,
    };

    return {
      data: result,
      tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
    };
  }
}
