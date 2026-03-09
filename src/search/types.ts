export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  answer?: string;
  query: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
}

export interface SearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
}
