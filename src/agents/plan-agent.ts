import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext } from './types.js';
import { AIProvider } from '../ai/types.js';
import { parseAIResponse } from '../ai/response-parser.js';

export interface PlanInput {
  /** 이슈 제목 또는 작업 설명 */
  title: string;
  /** 이슈 본문 또는 상세 컨텍스트 */
  description?: string;
  /** 관련 파일 목록 (선택) */
  relatedFiles?: string[];
  /** diff 컨텍스트 (선택) */
  diff?: string;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'test' | 'docs';
  priority: 'high' | 'medium' | 'low';
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  dependsOn?: string[];
  files?: string[];
}

export interface PlanResult {
  summary: string;
  approach: string;
  tasks: PlanTask[];
  risks: string[];
  estimatedScope: 'small' | 'medium' | 'large';
}

const planTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['feature', 'bugfix', 'refactor', 'test', 'docs']),
  priority: z.enum(['high', 'medium', 'low']),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex']),
  dependsOn: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
});

export const planResultSchema = z.object({
  summary: z.string(),
  approach: z.string(),
  tasks: z.array(planTaskSchema),
  risks: z.array(z.string()),
  estimatedScope: z.enum(['small', 'medium', 'large']),
});

const PLAN_SYSTEM = `You are an expert software architect and project planner. Given an issue or task description, you create a detailed, actionable implementation plan.

Your plan should:
1. Analyze the requirements and identify the scope
2. Break the work into discrete, testable tasks
3. Identify dependencies between tasks (using task IDs)
4. Assess risks and complexity
5. Suggest the implementation approach

Respond with a JSON object:
{
  "summary": "string - one-paragraph summary of the plan",
  "approach": "string - recommended technical approach",
  "tasks": [
    {
      "id": "string - e.g. T1, T2",
      "title": "string - concise task title",
      "description": "string - what needs to be done",
      "type": "feature | bugfix | refactor | test | docs",
      "priority": "high | medium | low",
      "estimatedComplexity": "simple | moderate | complex",
      "dependsOn": ["string - task IDs this depends on"] | undefined,
      "files": ["string - files likely to be modified"] | undefined
    }
  ],
  "risks": ["string - potential risks or blockers"],
  "estimatedScope": "small | medium | large"
}

Order tasks by dependency and priority. Return only the JSON object.`;

/**
 * 구현 계획 에이전트.
 * 이슈를 분석하여 태스크 분해 + 의존성 + 리스크 평가를 수행한다.
 */
export class PlanAgent extends BaseAgent<PlanInput, PlanResult> {
  name = 'PlanAgent';
  description = '이슈 분석 → 태스크 분해 → 구현 계획';

  constructor(private aiProvider: AIProvider) {
    super();
  }

  protected async run(
    input: PlanInput,
    context: AgentContext,
  ): Promise<{ data: PlanResult; tokensUsed?: number }> {
    const lines: string[] = [];

    lines.push('## Task to Plan');
    lines.push(`Title: ${input.title}`);

    if (input.description) {
      lines.push(`\nDescription:\n${input.description}`);
    }

    if (input.relatedFiles && input.relatedFiles.length > 0) {
      lines.push('\n## Related Files');
      for (const f of input.relatedFiles) {
        lines.push(`- ${f}`);
      }
    }

    if (input.diff) {
      lines.push('\n## Current Diff Context');
      lines.push(input.diff.slice(0, 4000));
    }

    const request = {
      systemPrompt: PLAN_SYSTEM,
      userPrompt: lines.join('\n'),
      model: context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.3,
    };

    const response = await this.aiProvider.complete(request);

    const parsed = await parseAIResponse(response.content, planResultSchema, {
      maxRetries: 1,
      aiProvider: this.aiProvider,
      originalRequest: request,
    });

    return {
      data: parsed,
      tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
    };
  }
}
