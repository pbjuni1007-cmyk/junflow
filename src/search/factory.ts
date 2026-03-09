import { SearchProvider } from './types.js';
import { TavilyProvider } from './tavily.js';

export function createSearchProvider(): SearchProvider | null {
  const tavilyKey = process.env['TAVILY_API_KEY'];
  if (tavilyKey) {
    return new TavilyProvider(tavilyKey);
  }
  return null;
}
