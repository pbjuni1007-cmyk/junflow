import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentError } from './types.js';
import { AIProvider } from '../ai/types.js';
import { IssueAnalysis } from './issue-analyzer.js';
import { parseAIResponse } from '../ai/response-parser.js';
import { BRANCH_NAMER_SYSTEM } from '../ai/prompts/branch-naming.js';

export interface BranchNamerInput {
  analysis: IssueAnalysis;
  issueId: string;
  convention?: string;
}

export interface BranchNameResult {
  branchName: string;
  alternatives: string[];
}

const branchNameResultSchema = z.object({
  branchName: z.string(),
  alternatives: z.array(z.string()),
});

export function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-/_]/g, '-') // 허용 문자 외 모두 하이픈으로
    .replace(/--+/g, '-')           // 연속 하이픈 제거
    .replace(/\/\/+/g, '/')         // 연속 슬래시 제거
    .replace(/^[-/]+|[-/]+$/g, '')  // 앞뒤 하이픈/슬래시 제거
    .slice(0, 60);                  // 길이 60자 제한
}

function buildUserPrompt(
  analysis: IssueAnalysis,
  issueId: string,
  convention: string,
): string {
  const lines: string[] = [];
  lines.push('## Issue Analysis');
  lines.push(`ID: ${issueId}`);
  lines.push(`Title: ${analysis.title}`);
  lines.push(`Type: ${analysis.type}`);
  lines.push(`Complexity: ${analysis.complexity}`);
  lines.push(`Summary: ${analysis.summary}`);
  lines.push('');
  lines.push('## Branch Convention Template');
  lines.push(convention);
  lines.push('');
  lines.push('## Key Requirements');
  for (const req of analysis.keyRequirements) {
    lines.push(`- ${req}`);
  }
  lines.push('');
  lines.push('Generate a primary branch name and 2 alternatives following the convention template.');
  lines.push('Replace {type} with the issue type, {issueId} with the issue ID, {description} with a short kebab-case description.');
  return lines.join('\n');
}

export class BranchNamer extends BaseAgent<BranchNamerInput, BranchNameResult> {
  name = 'BranchNamer';
  description = '브랜치 이름 생성 에이전트';

  constructor(private aiProvider: AIProvider) {
    super();
  }

  protected async run(
    input: BranchNamerInput,
    context: AgentContext,
  ): Promise<{ data: BranchNameResult; tokensUsed?: number }> {
    const convention = input.convention ?? context.config.git.branchConvention;

    const systemPrompt = BRANCH_NAMER_SYSTEM;
    const userPrompt = buildUserPrompt(input.analysis, input.issueId, convention);

    const request = {
      systemPrompt,
      userPrompt,
      model: context.config.ai.agentModels?.branchNamer ?? context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.4,
    };

    const response = await this.aiProvider.complete(request);

    let parsed;
    try {
      parsed = await parseAIResponse(response.content, branchNameResultSchema, {
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

    const result: BranchNameResult = {
      branchName: sanitizeBranchName(parsed.branchName),
      alternatives: parsed.alternatives.map(sanitizeBranchName),
    };

    return {
      data: result,
      tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
    };
  }
}
