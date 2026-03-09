import { describe, it, expect } from 'vitest';
import { junFlowConfigSchema } from '../../../src/config/schema.js';

const validConfig = {
  ai: {
    provider: 'claude' as const,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
  },
  tracker: {
    type: 'mock' as const,
  },
  git: {
    branchConvention: '{type}/{issueId}-{description}',
    commitConvention: 'conventional' as const,
    commitLanguage: 'ko' as const,
  },
  output: {
    color: true,
    verbose: false,
  },
};

describe('junFlowConfigSchema', () => {
  describe('유효한 설정 파싱', () => {
    it('완전한 유효 설정을 파싱한다', () => {
      const result = junFlowConfigSchema.parse(validConfig);
      expect(result.ai.provider).toBe('claude');
      expect(result.ai.model).toBe('claude-sonnet-4-20250514');
      expect(result.ai.maxTokens).toBe(2048);
      expect(result.tracker.type).toBe('mock');
      expect(result.git.commitConvention).toBe('conventional');
      expect(result.git.commitLanguage).toBe('ko');
      expect(result.output.color).toBe(true);
    });

    it('기본값이 적용된다', () => {
      const minimal = {
        ai: { provider: 'claude' },
        tracker: { type: 'mock' },
        git: {},
        output: {},
      };
      const result = junFlowConfigSchema.parse(minimal);
      expect(result.ai.model).toBe('claude-sonnet-4-20250514');
      expect(result.ai.maxTokens).toBe(2048);
      expect(result.git.branchConvention).toBe('{type}/{issueId}-{description}');
      expect(result.git.commitConvention).toBe('conventional');
      expect(result.git.commitLanguage).toBe('ko');
      expect(result.output.color).toBe(true);
      expect(result.output.verbose).toBe(false);
    });

    it('notion 트래커 설정을 파싱한다', () => {
      const config = {
        ...validConfig,
        tracker: {
          type: 'notion' as const,
          notion: {
            apiKey: 'secret_key',
            databaseId: 'db-id-123',
          },
        },
      };
      const result = junFlowConfigSchema.parse(config);
      expect(result.tracker.type).toBe('notion');
      expect(result.tracker.notion?.databaseId).toBe('db-id-123');
    });

    it('agentModels 선택 필드를 파싱한다', () => {
      const config = {
        ...validConfig,
        ai: {
          ...validConfig.ai,
          agentModels: {
            commitWriter: 'claude-haiku-4',
          },
        },
      };
      const result = junFlowConfigSchema.parse(config);
      expect(result.ai.agentModels?.commitWriter).toBe('claude-haiku-4');
    });

    it('gitmoji commitConvention을 파싱한다', () => {
      const config = {
        ...validConfig,
        git: { ...validConfig.git, commitConvention: 'gitmoji' as const },
      };
      const result = junFlowConfigSchema.parse(config);
      expect(result.git.commitConvention).toBe('gitmoji');
    });

    it('en commitLanguage를 파싱한다', () => {
      const config = {
        ...validConfig,
        git: { ...validConfig.git, commitLanguage: 'en' as const },
      };
      const result = junFlowConfigSchema.parse(config);
      expect(result.git.commitLanguage).toBe('en');
    });
  });

  describe('필수 필드 누락 시 zod 에러', () => {
    it('ai.provider 누락 시 에러', () => {
      const config = {
        ...validConfig,
        ai: { model: 'claude-sonnet-4-20250514', maxTokens: 2048 },
      };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });

    it('tracker.type 누락 시 에러', () => {
      const config = { ...validConfig, tracker: {} };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });

    it('notion 선택 시 databaseId 누락하면 에러', () => {
      const config = {
        ...validConfig,
        tracker: { type: 'notion' as const, notion: { apiKey: 'key' } },
      };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });
  });

  describe('잘못된 타입 값 검증', () => {
    it('잘못된 provider 값은 에러', () => {
      const config = { ...validConfig, ai: { ...validConfig.ai, provider: 'openai' } };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });

    it('잘못된 tracker.type 값은 에러', () => {
      const config = { ...validConfig, tracker: { type: 'jira' } };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });

    it('잘못된 commitConvention 값은 에러', () => {
      const config = {
        ...validConfig,
        git: { ...validConfig.git, commitConvention: 'angular' },
      };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });

    it('잘못된 commitLanguage 값은 에러', () => {
      const config = {
        ...validConfig,
        git: { ...validConfig.git, commitLanguage: 'jp' },
      };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });

    it('maxTokens가 음수면 에러', () => {
      const config = { ...validConfig, ai: { ...validConfig.ai, maxTokens: -1 } };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });

    it('output.color가 문자열이면 에러', () => {
      const config = { ...validConfig, output: { color: 'yes', verbose: false } };
      expect(() => junFlowConfigSchema.parse(config)).toThrow();
    });
  });
});
