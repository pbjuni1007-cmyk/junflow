import { AIProvider } from './types.js';
import { JunFlowConfig, AgentRoutingEntry } from '../config/schema.js';

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

async function createProviderByName(providerName: 'claude' | 'openai' | 'gemini'): Promise<AIProvider> {
  switch (providerName) {
    case 'claude': {
      const key = process.env['ANTHROPIC_API_KEY'];
      if (!key) throw Object.assign(new Error('ANTHROPIC_API_KEY not set'), { code: 'CONFIG_ERROR' });
      const { ClaudeProvider } = await import('./claude.js');
      return new ClaudeProvider(key);
    }
    case 'openai': {
      const key = process.env['OPENAI_API_KEY'];
      if (!key) throw Object.assign(new Error('OPENAI_API_KEY not set'), { code: 'CONFIG_ERROR' });
      const { OpenAIProvider } = await import('./openai.js');
      return new OpenAIProvider(key);
    }
    case 'gemini': {
      const key = process.env['GEMINI_API_KEY'];
      if (!key) throw Object.assign(new Error('GEMINI_API_KEY not set'), { code: 'CONFIG_ERROR' });
      const { GeminiProvider } = await import('./gemini.js');
      return new GeminiProvider(key);
    }
  }
}

const AGENT_KEY_MAP: Record<string, string> = {
  IssueAnalyzer: 'issueAnalyzer',
  BranchNamer: 'branchNamer',
  CommitWriter: 'commitWriter',
  CodeReviewer: 'codeReviewer',
  DocumentReviewer: 'documentReviewer',
  DeepResearcher: 'deepResearcher',
  Verifier: 'verifier',
  TaskDecomposer: 'taskDecomposer',
};

/**
 * Resolve the routing entry for an agent from agentRouting (preferred)
 * or fall back to the legacy agentModels (model-only).
 */
export function getAgentRouting(config: JunFlowConfig, agentName: string): AgentRoutingEntry | undefined {
  const key = AGENT_KEY_MAP[agentName];
  if (!key) return undefined;

  // Prefer agentRouting
  const routing = config.ai.agentRouting;
  if (routing) {
    const entry = routing[key as keyof typeof routing];
    if (entry) return entry;
  }

  // Fall back to legacy agentModels (model string only)
  const agentModels = config.ai.agentModels;
  if (agentModels) {
    const model = agentModels[key as keyof typeof agentModels];
    if (model) return { model };
  }

  return undefined;
}

/**
 * Get the model name for an agent. Checks agentRouting first, then agentModels.
 */
export function getModelForAgent(config: JunFlowConfig, agentName: string): string | undefined {
  return getAgentRouting(config, agentName)?.model;
}

/**
 * Create an AIProvider for a specific agent based on the routing table.
 * If the agent has a provider override in agentRouting, a new provider instance is created.
 * Otherwise falls back to the given default provider.
 */
export async function createProviderForAgent(
  config: JunFlowConfig,
  agentName: string,
  defaultProvider: AIProvider,
): Promise<AIProvider> {
  const routing = getAgentRouting(config, agentName);
  if (!routing?.provider) return defaultProvider;

  // If the routing provider matches the default config provider, reuse the default
  if (routing.provider === config.ai.provider) return defaultProvider;

  return createProviderByName(routing.provider);
}
