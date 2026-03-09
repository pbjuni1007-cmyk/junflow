import { SearchProvider, SearchOptions, SearchResponse, SearchResult } from './types.js';

interface TavilyApiResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  answer?: string;
  query: string;
}

export class TavilyProvider implements SearchProvider {
  name = 'tavily';
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com/search';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const body = {
      api_key: this.apiKey,
      query,
      search_depth: options?.searchDepth ?? 'basic',
      max_results: options?.maxResults ?? 5,
      include_answer: options?.includeAnswer ?? true,
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as TavilyApiResponse;

    const results: SearchResult[] = data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }));

    return {
      results,
      answer: data.answer,
      query: data.query,
    };
  }
}
