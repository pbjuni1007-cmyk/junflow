import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/search/tavily.js', () => ({
  TavilyProvider: class {
    name = 'tavily';
    constructor(public apiKey: string) {}
    async search() { return { results: [], query: '' }; }
  },
}));

import { createSearchProvider } from '../../../src/search/factory.js';

describe('createSearchProvider()', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env['TAVILY_API_KEY'];
    delete process.env['TAVILY_API_KEY'];
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env['TAVILY_API_KEY'];
    else process.env['TAVILY_API_KEY'] = savedKey;
  });

  it('TAVILY_API_KEY 있으면 TavilyProvider를 반환한다', () => {
    process.env['TAVILY_API_KEY'] = 'tvly-test-key';
    const provider = createSearchProvider();
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('tavily');
  });

  it('TAVILY_API_KEY 없으면 null을 반환한다', () => {
    const provider = createSearchProvider();
    expect(provider).toBeNull();
  });

  it('빈 문자열 키는 falsy로 취급되어 null을 반환한다', () => {
    process.env['TAVILY_API_KEY'] = '';
    const provider = createSearchProvider();
    expect(provider).toBeNull();
  });
});
