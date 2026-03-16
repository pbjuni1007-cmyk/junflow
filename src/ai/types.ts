export interface AIProvider {
  name: string;
  complete(request: AIRequest): Promise<AIResponse>;
}

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
}

export interface FallbackChain {
  primary: AIProvider;
  fallbacks: AIProvider[];
}
