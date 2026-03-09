import { AIProvider } from './types.js';
import { JunFlowConfig } from '../config/schema.js';

export async function createAIProvider(config: JunFlowConfig): Promise<AIProvider> {
  const { provider, apiKey } = config.ai;

  switch (provider) {
    case 'claude': {
      const key = apiKey ?? process.env['ANTHROPIC_API_KEY'];
      if (!key) throw Object.assign(new Error('ANTHROPIC_API_KEY not set'), { code: 'CONFIG_ERROR' });
      const { ClaudeProvider } = await import('./claude.js');
      return new ClaudeProvider(key);
    }
    case 'openai': {
      const key = apiKey ?? process.env['OPENAI_API_KEY'];
      if (!key) throw Object.assign(new Error('OPENAI_API_KEY not set'), { code: 'CONFIG_ERROR' });
      const { OpenAIProvider } = await import('./openai.js');
      return new OpenAIProvider(key);
    }
    case 'gemini': {
      const key = apiKey ?? process.env['GEMINI_API_KEY'];
      if (!key) throw Object.assign(new Error('GEMINI_API_KEY not set'), { code: 'CONFIG_ERROR' });
      const { GeminiProvider } = await import('./gemini.js');
      return new GeminiProvider(key);
    }
    default: {
      const _exhaustive: never = provider;
      throw Object.assign(new Error(`Unknown AI provider: ${String(_exhaustive)}`), { code: 'CONFIG_ERROR' });
    }
  }
}

export function getModelForAgent(config: JunFlowConfig, agentName: string): string | undefined {
  const agentModels = config.ai.agentModels;
  if (!agentModels) return undefined;

  const mapping: Record<string, keyof typeof agentModels> = {
    'IssueAnalyzer': 'issueAnalyzer',
    'BranchNamer': 'branchNamer',
    'CommitWriter': 'commitWriter',
    'CodeReviewer': 'codeReviewer',
  };

  const key = mapping[agentName];
  return key ? agentModels[key] : undefined;
}
