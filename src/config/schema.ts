import { z } from 'zod';

const hookEventSchema = z.enum([
  'pre-start',
  'post-start',
  'pre-commit',
  'post-commit',
  'pre-review',
  'post-review',
]);

const hookDefinitionSchema = z.object({
  event: hookEventSchema,
  command: z.string(),
  description: z.string().optional(),
  continueOnError: z.boolean().optional(),
});

export const junFlowConfigSchema = z.object({
  ai: z.object({
    provider: z.enum(['claude', 'openai', 'gemini']).default('claude'),
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
    type: z.enum(['notion', 'github', 'jira', 'mock']),
    notion: z
      .object({
        apiKey: z.string().optional(),
        databaseId: z.string(),
      })
      .optional(),
    github: z
      .object({
        owner: z.string(),
        repo: z.string(),
        token: z.string().optional(),
      })
      .optional(),
    jira: z
      .object({
        domain: z.string(),
        email: z.string(),
        apiToken: z.string().optional(),
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
  hooks: z.array(hookDefinitionSchema).optional(),
});

export type JunFlowConfig = z.infer<typeof junFlowConfigSchema>;
