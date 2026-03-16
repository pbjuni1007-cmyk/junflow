import { z } from 'zod';
import { BaseAgent } from './base-agent.js';
import { AgentContext } from './types.js';
import { AIProvider } from '../ai/types.js';
import { SearchProvider } from '../search/types.js';
import { parseAIResponse } from '../ai/response-parser.js';
import { DEEP_RESEARCHER_SYSTEM } from '../ai/prompts/document-review.js';

export interface DeepResearcherInput {
  content: string;
  filePath: string;
  documentReviewSummary?: string;
}

export interface ClaimValidation {
  claim: string;
  verdict: 'supported' | 'partially_supported' | 'unsupported' | 'needs_more_data';
  confidence: number;
  evidence: string[];
  counterpoints: string[];
  sources: string[];
  recommendation: string;
}

export interface SimilarProduct {
  name: string;
  url: string | null;
  relevance: string;
  lesson: string;
}

export interface DeepResearchResult {
  summary: string;
  claims: ClaimValidation[];
  similarProducts: SimilarProduct[];
  overallRiskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
  searchUsed: boolean;
}

const deepResearchSchema = z.object({
  summary: z.string(),
  claims: z.array(
    z.object({
      claim: z.string(),
      verdict: z.enum(['supported', 'partially_supported', 'unsupported', 'needs_more_data']),
      confidence: z.number(),
      evidence: z.array(z.string()),
      counterpoints: z.array(z.string()),
      sources: z.array(z.string()),
      recommendation: z.string(),
    }),
  ),
  similarProducts: z.array(
    z.object({
      name: z.string(),
      url: z.string().nullable(),
      relevance: z.string(),
      lesson: z.string(),
    }),
  ),
  overallRiskLevel: z.enum(['low', 'medium', 'high']),
  recommendations: z.array(z.string()),
});

// Step 1: AI가 문서에서 핵심 주장/가정을 추출
const CLAIM_EXTRACTOR_PROMPT = `You are an analyst. Extract the key claims, assumptions, and technical decisions from the given document.

Respond with a JSON object:
{
  "claims": ["string - each key claim or assumption"],
  "searchQueries": ["string - web search queries to validate these claims"]
}

Return only the JSON object, no markdown code blocks.`;

const claimExtractorSchema = z.object({
  claims: z.array(z.string()),
  searchQueries: z.array(z.string()),
});

export class DeepResearcher extends BaseAgent<DeepResearcherInput, DeepResearchResult> {
  name = 'DeepResearcher';
  description = '딥 리서치 검증 에이전트';

  constructor(
    private aiProvider: AIProvider,
    private searchProvider: SearchProvider | null,
  ) {
    super();
  }

  protected async run(
    input: DeepResearcherInput,
    context: AgentContext,
  ): Promise<{ data: DeepResearchResult; tokensUsed?: number }> {
    let totalTokens = 0;

    // Step 1: 핵심 주장 추출
    context.logger.info('[DeepResearcher] 핵심 주장 추출 중...');
    const extractRequest = {
      systemPrompt: CLAIM_EXTRACTOR_PROMPT,
      userPrompt: input.content,
      model: context.config.ai.model,
      maxTokens: 2048,
      temperature: 0.2,
    };

    const extractResponse = await this.aiProvider.complete(extractRequest);
    totalTokens += extractResponse.tokensUsed.input + extractResponse.tokensUsed.output;

    const extracted = await parseAIResponse(extractResponse.content, claimExtractorSchema, {
      maxRetries: 1,
      aiProvider: this.aiProvider,
      originalRequest: extractRequest,
    });

    // Step 2: 웹 검색 (searchProvider가 있으면)
    let searchContext: string;
    let searchUsed = false;

    if (this.searchProvider) {
      context.logger.info(`[DeepResearcher] 웹 검색 실행 중 (${extracted.searchQueries.length}개 쿼리)...`);
      searchUsed = true;

      const searchResults = await Promise.allSettled(
        extracted.searchQueries.slice(0, 5).map((query) =>
          this.searchProvider!.search(query, { maxResults: 3, includeAnswer: true }),
        ),
      );

      const searchLines: string[] = ['## Web Search Results'];

      for (let i = 0; i < searchResults.length; i++) {
        const result = searchResults[i]!;
        const query = extracted.searchQueries[i]!;

        if (result.status === 'fulfilled') {
          searchLines.push(`\n### Query: "${query}"`);
          if (result.value.answer) {
            searchLines.push(`Answer: ${result.value.answer}`);
          }
          for (const r of result.value.results) {
            searchLines.push(`- [${r.title}](${r.url}): ${r.content.slice(0, 300)}`);
          }
        } else {
          searchLines.push(`\n### Query: "${query}"`);
          searchLines.push(`(Search failed: ${result.reason})`);
        }
      }

      searchContext = searchLines.join('\n');
    } else {
      context.logger.info('[DeepResearcher] 검색 API 키 없음 — AI 자체 지식으로 분석');
      searchContext = '(No web search available. Use your own knowledge to validate claims.)';
    }

    // Step 3: 주장 검증 요청
    context.logger.info('[DeepResearcher] 주장 검증 중...');
    const userLines: string[] = [];
    userLines.push('## Document');
    userLines.push(input.content);
    userLines.push('');
    userLines.push('## Extracted Claims');
    for (const claim of extracted.claims) {
      userLines.push(`- ${claim}`);
    }
    userLines.push('');
    userLines.push(searchContext);

    if (input.documentReviewSummary) {
      userLines.push('');
      userLines.push('## Prior Document Review Summary');
      userLines.push(input.documentReviewSummary);
    }

    const validateRequest = {
      systemPrompt: DEEP_RESEARCHER_SYSTEM,
      userPrompt: userLines.join('\n'),
      model: context.config.ai.agentModels?.deepResearcher ?? context.config.ai.model,
      maxTokens: 4096,
      temperature: 0.3,
    };

    const validateResponse = await this.aiProvider.complete(validateRequest);
    totalTokens += validateResponse.tokensUsed.input + validateResponse.tokensUsed.output;

    const parsed = await parseAIResponse(validateResponse.content, deepResearchSchema, {
      maxRetries: 1,
      aiProvider: this.aiProvider,
      originalRequest: validateRequest,
    });

    return {
      data: { ...parsed, searchUsed },
      tokensUsed: totalTokens,
    };
  }
}
