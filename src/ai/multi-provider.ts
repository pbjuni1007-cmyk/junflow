import { AIProvider } from './types.js';

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
