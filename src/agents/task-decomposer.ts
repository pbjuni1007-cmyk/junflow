import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext, AgentError } from './types.js';
import { AIProvider } from '../ai/types.js';
import { IssueAnalysis } from './issue-analyzer.js';
import { parseAIResponse } from '../ai/response-parser.js';
import { TASK_DECOMPOSER_SYSTEM } from '../ai/prompts/task-decomposition.js';
import { validateDAG, topologicalSort } from '../dag/topology.js';

export interface TaskDecomposerInput {
  analysis: IssueAnalysis;
  issueId: string;
  maxDepth?: number;
}

export interface SubTask {
  id: string;
  title: string;
  description: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'chore' | 'docs' | 'test';
  dependsOn: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  suggestedFiles?: string[];
}

export interface TaskDecompositionResult {
  graphType: 'independent' | 'sequential' | 'dag';
  subtasks: SubTask[];
  executionLevels: string[][];
  totalEstimate: string;
}

const subtaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['feature', 'bugfix', 'refactor', 'chore', 'docs', 'test']),
  dependsOn: z.array(z.string()),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  suggestedFiles: z.array(z.string()).optional(),
});

const decompositionSchema = z.object({
  graphType: z.enum(['independent', 'sequential', 'dag']),
  subtasks: z.array(subtaskSchema),
  totalEstimate: z.string(),
});

function buildUserPrompt(issueId: string, analysis: IssueAnalysis): string {
  const lines: string[] = [];
  lines.push('## Issue Analysis');
  lines.push(`ID: ${issueId}`);
  lines.push(`Title: ${analysis.title}`);
  lines.push(`Type: ${analysis.type}`);
  lines.push(`Complexity: ${analysis.complexity}`);
  lines.push(`Summary: ${analysis.summary}`);
  if (analysis.keyRequirements.length > 0) {
    lines.push('');
    lines.push('## Key Requirements');
    for (const req of analysis.keyRequirements) {
      lines.push(`- ${req}`);
    }
  }
  if (analysis.suggestedApproach) {
    lines.push('');
    lines.push('## Suggested Approach');
    lines.push(analysis.suggestedApproach);
  }
  lines.push('');
  lines.push('Please decompose this issue into concrete subtasks with dependencies.');
  return lines.join('\n');
}

export class TaskDecomposer extends BaseAgent<TaskDecomposerInput, TaskDecompositionResult> {
  name = 'TaskDecomposer';
  description = '복잡한 이슈를 서브태스크로 분해';

  constructor(private aiProvider: AIProvider) {
    super();
  }

  protected async run(
    input: TaskDecomposerInput,
    context: AgentContext,
  ): Promise<{ data: TaskDecompositionResult; tokensUsed?: number }> {
    const userPrompt = buildUserPrompt(input.issueId, input.analysis);

    const request = {
      systemPrompt: TASK_DECOMPOSER_SYSTEM,
      userPrompt,
      model: context.config.ai.model,
      maxTokens: context.config.ai.maxTokens,
      temperature: 0.3,
    };

    const response = await this.aiProvider.complete(request);

    // 파싱 및 zod 검증
    let parsed: z.infer<typeof decompositionSchema>;
    try {
      parsed = await parseAIResponse(response.content, decompositionSchema, {
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

    // DAG 유효성 검증 (순환 참조 + 존재하지 않는 의존성)
    const dagNodes = parsed.subtasks.map((t) => ({ id: t.id, dependsOn: t.dependsOn }));
    const validation = validateDAG(dagNodes);
    if (!validation.valid) {
      const agentError: AgentError = {
        code: 'VALIDATION_ERROR',
        message: `DAG validation failed: ${validation.errors.join('; ')}`,
      };
      throw agentError;
    }

    // 위상 정렬로 executionLevels 계산
    const executionLevels = topologicalSort(dagNodes);

    const result: TaskDecompositionResult = {
      graphType: parsed.graphType,
      subtasks: parsed.subtasks,
      executionLevels,
      totalEstimate: parsed.totalEstimate,
    };

    return {
      data: result,
      tokensUsed: response.tokensUsed.input + response.tokensUsed.output,
    };
  }
}
