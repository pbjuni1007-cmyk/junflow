import { z } from 'zod';

export const junFlowConfigSchema = z.object({
  ai: z.object({
    provider: z.literal('claude'),
    model: z.string().default('claude-sonnet-4-20250514'),
    apiKey: z.string().optional(),
    maxTokens: z.number().int().positive().default(2048),
    agentModels: z
      .object({
        issueAnalyzer: z.string().optional(),
        branchNamer: z.string().optional(),
        commitWriter: z.string().optional(),
        codeReviewer: z.string().optional(),
      })
      .optional(),
  }),
  tracker: z.object({
    type: z.enum(['notion', 'mock']),
    notion: z
      .object({
        apiKey: z.string().optional(),
        databaseId: z.string(),
      })
      .optional(),
  }),
  git: z.object({
    branchConvention: z.string().default('{type}/{issueId}-{description}'),
    commitConvention: z.enum(['conventional', 'gitmoji']).default('conventional'),
    commitLanguage: z.enum(['ko', 'en']).default('ko'),
  }),
  output: z.object({
    color: z.boolean().default(true),
    verbose: z.boolean().default(false),
  }),
});

export type JunFlowConfig = z.infer<typeof junFlowConfigSchema>;
