import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAIProvider, getModelForAgent, getAgentRouting, createProviderForAgent } from '../../../src/ai/provider-factory.js';
import type { JunFlowConfig } from '../../../src/config/schema.js';

vi.mock('../../../src/ai/claude.js', () => ({
  ClaudeProvider: class {
    name = 'claude';
    constructor(_key: string) {}
    async complete() { return { content: '', tokensUsed: { input: 0, output: 0 }, model: 'claude' }; }
  },
}));

vi.mock('../../../src/ai/openai.js', () => ({
  OpenAIProvider: class {
    name = 'openai';
    constructor(_key: string) {}
    async complete() { return { content: '', tokensUsed: { input: 0, output: 0 }, model: 'openai' }; }
  },
}));

vi.mock('../../../src/ai/gemini.js', () => ({
  GeminiProvider: class {
    name = 'gemini';
    constructor(_key: string) {}
    async complete() { return { content: '', tokensUsed: { input: 0, output: 0 }, model: 'gemini' }; }
  },
}));

function makeConfig(provider: 'claude' | 'openai' | 'gemini', apiKey?: string): JunFlowConfig {
  return {
    ai: {
      provider,
      model: 'default-model',
      maxTokens: 2048,
      ...(apiKey ? { apiKey } : {}),
    },
    tracker: { type: 'mock' },
    git: {
      branchConvention: '{type}/{issueId}-{description}',
      commitConvention: 'conventional',
      commitLanguage: 'ko',
    },
    output: { color: true, verbose: false },
  };
}

describe('createAIProvider()', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'];
    savedEnv['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'];
    savedEnv['GEMINI_API_KEY'] = process.env['GEMINI_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('claude provider → ClaudeProvider 인스턴스 반환', async () => {
    const config = makeConfig('claude', 'sk-ant-test');
    const provider = await createAIProvider(config);
    expect(provider.name).toBe('claude');
  });

  it('openai provider → OpenAIProvider 인스턴스 반환', async () => {
    const config = makeConfig('openai', 'sk-openai-test');
    const provider = await createAIProvider(config);
    expect(provider.name).toBe('openai');
  });

  it('gemini provider → GeminiProvider 인스턴스 반환', async () => {
    const config = makeConfig('gemini', 'gemini-test-key');
    const provider = await createAIProvider(config);
    expect(provider.name).toBe('gemini');
  });

  it('claude: apiKey 없고 env 없으면 CONFIG_ERROR', async () => {
    const config = makeConfig('claude');
    await expect(createAIProvider(config)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
  });

  it('openai: apiKey 없고 env 없으면 CONFIG_ERROR', async () => {
    const config = makeConfig('openai');
    await expect(createAIProvider(config)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
  });

  it('gemini: apiKey 없고 env 없으면 CONFIG_ERROR', async () => {
    const config = makeConfig('gemini');
    await expect(createAIProvider(config)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
  });

  it('claude: ANTHROPIC_API_KEY 환경변수로 fallback', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'env-anthropic-key';
    const config = makeConfig('claude');
    const provider = await createAIProvider(config);
    expect(provider.name).toBe('claude');
  });

  it('openai: OPENAI_API_KEY 환경변수로 fallback', async () => {
    process.env['OPENAI_API_KEY'] = 'env-openai-key';
    const config = makeConfig('openai');
    const provider = await createAIProvider(config);
    expect(provider.name).toBe('openai');
  });

  it('gemini: GEMINI_API_KEY 환경변수로 fallback', async () => {
    process.env['GEMINI_API_KEY'] = 'env-gemini-key';
    const config = makeConfig('gemini');
    const provider = await createAIProvider(config);
    expect(provider.name).toBe('gemini');
  });
});

describe('getModelForAgent()', () => {
  function makeConfigWithAgentModels(
    agentModels: Partial<NonNullable<JunFlowConfig['ai']['agentModels']>>,
  ): JunFlowConfig {
    return {
      ai: {
        provider: 'claude',
        model: 'default-model',
        maxTokens: 2048,
        agentModels,
      },
      tracker: { type: 'mock' },
      git: {
        branchConvention: '{type}/{issueId}-{description}',
        commitConvention: 'conventional',
        commitLanguage: 'ko',
      },
      output: { color: true, verbose: false },
    };
  }

  it('IssueAnalyzer → agentModels.issueAnalyzer 반환', () => {
    const config = makeConfigWithAgentModels({ issueAnalyzer: 'claude-haiku' });
    expect(getModelForAgent(config, 'IssueAnalyzer')).toBe('claude-haiku');
  });

  it('CommitWriter → agentModels.commitWriter 반환', () => {
    const config = makeConfigWithAgentModels({ commitWriter: 'gpt-4o-mini' });
    expect(getModelForAgent(config, 'CommitWriter')).toBe('gpt-4o-mini');
  });

  it('BranchNamer → agentModels.branchNamer 반환', () => {
    const config = makeConfigWithAgentModels({ branchNamer: 'gemini-flash' });
    expect(getModelForAgent(config, 'BranchNamer')).toBe('gemini-flash');
  });

  it('CodeReviewer → agentModels.codeReviewer 반환', () => {
    const config = makeConfigWithAgentModels({ codeReviewer: 'claude-opus' });
    expect(getModelForAgent(config, 'CodeReviewer')).toBe('claude-opus');
  });

  it('알 수 없는 agentName → undefined 반환', () => {
    const config = makeConfigWithAgentModels({ commitWriter: 'gpt-4o' });
    expect(getModelForAgent(config, 'UnknownAgent')).toBeUndefined();
  });

  it('agentModels 없으면 undefined 반환', () => {
    const config = makeConfig('claude', 'key');
    expect(getModelForAgent(config, 'CommitWriter')).toBeUndefined();
  });

  it('해당 agentModel 키가 없으면 undefined 반환', () => {
    const config = makeConfigWithAgentModels({ issueAnalyzer: 'haiku' });
    expect(getModelForAgent(config, 'CommitWriter')).toBeUndefined();
  });

  it('DocumentReviewer → agentModels.documentReviewer 반환', () => {
    const config = makeConfigWithAgentModels({ documentReviewer: 'claude-opus' });
    expect(getModelForAgent(config, 'DocumentReviewer')).toBe('claude-opus');
  });

  it('DeepResearcher → agentModels.deepResearcher 반환', () => {
    const config = makeConfigWithAgentModels({ deepResearcher: 'gemini-pro' });
    expect(getModelForAgent(config, 'DeepResearcher')).toBe('gemini-pro');
  });
});

describe('getAgentRouting()', () => {
  function makeConfigWithRouting(
    agentRouting: NonNullable<JunFlowConfig['ai']['agentRouting']>,
    agentModels?: NonNullable<JunFlowConfig['ai']['agentModels']>,
  ): JunFlowConfig {
    return {
      ai: {
        provider: 'claude',
        model: 'default-model',
        maxTokens: 2048,
        agentRouting,
        ...(agentModels ? { agentModels } : {}),
      },
      tracker: { type: 'mock' },
      git: {
        branchConvention: '{type}/{issueId}-{description}',
        commitConvention: 'conventional',
        commitLanguage: 'ko',
      },
      output: { color: true, verbose: false },
    };
  }

  it('agentRouting에서 provider + model + timeout 반환', () => {
    const config = makeConfigWithRouting({
      codeReviewer: { provider: 'openai', model: 'gpt-4o', timeout: 30000 },
    });
    const routing = getAgentRouting(config, 'CodeReviewer');
    expect(routing).toEqual({ provider: 'openai', model: 'gpt-4o', timeout: 30000 });
  });

  it('agentRouting이 agentModels보다 우선', () => {
    const config = makeConfigWithRouting(
      { commitWriter: { provider: 'gemini', model: 'gemini-pro' } },
      { commitWriter: 'old-model' },
    );
    const routing = getAgentRouting(config, 'CommitWriter');
    expect(routing?.model).toBe('gemini-pro');
    expect(routing?.provider).toBe('gemini');
  });

  it('agentRouting 없으면 agentModels로 fallback', () => {
    const config = makeConfigWithRouting({}, { issueAnalyzer: 'haiku-model' });
    const routing = getAgentRouting(config, 'IssueAnalyzer');
    expect(routing).toEqual({ model: 'haiku-model' });
  });

  it('둘 다 없으면 undefined', () => {
    const config = makeConfigWithRouting({});
    expect(getAgentRouting(config, 'CodeReviewer')).toBeUndefined();
  });

  it('알 수 없는 agentName → undefined', () => {
    const config = makeConfigWithRouting({
      codeReviewer: { model: 'gpt-4o' },
    });
    expect(getAgentRouting(config, 'UnknownAgent')).toBeUndefined();
  });

  it('Verifier 라우팅 지원', () => {
    const config = makeConfigWithRouting({
      verifier: { provider: 'openai', model: 'gpt-4o-mini' },
    });
    expect(getAgentRouting(config, 'Verifier')).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('TaskDecomposer 라우팅 지원', () => {
    const config = makeConfigWithRouting({
      taskDecomposer: { model: 'claude-opus' },
    });
    expect(getAgentRouting(config, 'TaskDecomposer')).toEqual({
      model: 'claude-opus',
    });
  });

  it('getModelForAgent가 agentRouting에서 모델 반환', () => {
    const config = makeConfigWithRouting({
      documentReviewer: { provider: 'openai', model: 'gpt-4o' },
    });
    expect(getModelForAgent(config, 'DocumentReviewer')).toBe('gpt-4o');
  });
});

describe('createProviderForAgent()', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'];
    savedEnv['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'];
    savedEnv['GEMINI_API_KEY'] = process.env['GEMINI_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'test-anthropic';
    process.env['OPENAI_API_KEY'] = 'test-openai';
    process.env['GEMINI_API_KEY'] = 'test-gemini';
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('라우팅에 provider 없으면 defaultProvider 반환', async () => {
    const config: JunFlowConfig = {
      ai: {
        provider: 'claude',
        model: 'default-model',
        maxTokens: 2048,
        agentRouting: { codeReviewer: { model: 'claude-opus' } },
      },
      tracker: { type: 'mock' },
      git: {
        branchConvention: '{type}/{issueId}-{description}',
        commitConvention: 'conventional',
        commitLanguage: 'ko',
      },
      output: { color: true, verbose: false },
    };
    const defaultProvider = await createAIProvider(config);
    const result = await createProviderForAgent(config, 'CodeReviewer', defaultProvider);
    expect(result).toBe(defaultProvider);
  });

  it('라우팅 provider가 기본과 같으면 defaultProvider 반환', async () => {
    const config: JunFlowConfig = {
      ai: {
        provider: 'claude',
        model: 'default-model',
        maxTokens: 2048,
        agentRouting: { codeReviewer: { provider: 'claude', model: 'claude-opus' } },
      },
      tracker: { type: 'mock' },
      git: {
        branchConvention: '{type}/{issueId}-{description}',
        commitConvention: 'conventional',
        commitLanguage: 'ko',
      },
      output: { color: true, verbose: false },
    };
    const defaultProvider = await createAIProvider(config);
    const result = await createProviderForAgent(config, 'CodeReviewer', defaultProvider);
    expect(result).toBe(defaultProvider);
  });

  it('라우팅 provider가 다르면 새 프로바이더 생성', async () => {
    const config: JunFlowConfig = {
      ai: {
        provider: 'claude',
        model: 'default-model',
        maxTokens: 2048,
        agentRouting: { codeReviewer: { provider: 'openai', model: 'gpt-4o' } },
      },
      tracker: { type: 'mock' },
      git: {
        branchConvention: '{type}/{issueId}-{description}',
        commitConvention: 'conventional',
        commitLanguage: 'ko',
      },
      output: { color: true, verbose: false },
    };
    const defaultProvider = await createAIProvider(config);
    const result = await createProviderForAgent(config, 'CodeReviewer', defaultProvider);
    expect(result).not.toBe(defaultProvider);
    expect(result.name).toBe('openai');
  });

  it('라우팅 없는 에이전트는 defaultProvider 반환', async () => {
    const config: JunFlowConfig = {
      ai: {
        provider: 'claude',
        model: 'default-model',
        maxTokens: 2048,
      },
      tracker: { type: 'mock' },
      git: {
        branchConvention: '{type}/{issueId}-{description}',
        commitConvention: 'conventional',
        commitLanguage: 'ko',
      },
      output: { color: true, verbose: false },
    };
    const defaultProvider = await createAIProvider(config);
    const result = await createProviderForAgent(config, 'CodeReviewer', defaultProvider);
    expect(result).toBe(defaultProvider);
  });
});
