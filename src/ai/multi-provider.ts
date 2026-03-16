import { AIProvider, FallbackChain } from './types.js';

export interface FallbackChainConfig {
  excludeProviders?: string[];
}

interface ProviderEntry {
  name: string;
  envKey: string;
  loader: (key: string) => Promise<AIProvider>;
}

const PROVIDERS: ProviderEntry[] = [
  {
    name: 'claude',
    envKey: 'ANTHROPIC_API_KEY',
    loader: async (key) => {
      const { ClaudeProvider } = await import('./claude.js');
      return new ClaudeProvider(key);
    },
  },
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    loader: async (key) => {
      const { OpenAIProvider } = await import('./openai.js');
      return new OpenAIProvider(key);
    },
  },
  {
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    loader: async (key) => {
      const { GeminiProvider } = await import('./gemini.js');
      return new GeminiProvider(key);
    },
  },
];

export async function getAvailableProviders(): Promise<AIProvider[]> {
  const providers: AIProvider[] = [];

  for (const entry of PROVIDERS) {
    const key = process.env[entry.envKey];
    if (key) {
      try {
        const provider = await entry.loader(key);
        providers.push(provider);
      } catch {
        // 프로바이더 로딩 실패 시 건너뜀
      }
    }
  }

  return providers;
}

/**
 * primary 프로바이더를 기준으로 fallback 체인을 구성한다.
 * 환경변수에 API 키가 설정된 프로바이더만 체인에 포함.
 */
export async function createFallbackChain(
  primaryProvider: AIProvider,
  config?: FallbackChainConfig,
): Promise<FallbackChain> {
  const exclude = new Set(config?.excludeProviders ?? []);
  exclude.add(primaryProvider.name); // primary는 fallback에서 제외

  const allProviders = await getAvailableProviders();
  const fallbacks = allProviders.filter((p) => !exclude.has(p.name));

  return {
    primary: primaryProvider,
    fallbacks,
  };
}
