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

const cliProfileSchema = z.object({
  bin: z.string().optional(),
  defaultProfile: z.string().optional(),
  profiles: z.record(z.string(), z.string()).optional(),
  sandboxBypass: z.boolean().default(false),
});

const cliRoleSchema = z.object({
  cli: z.enum(['codex', 'gemini']),
  profile: z.string().optional(),
});

const cliSchema = z
  .object({
    codex: cliProfileSchema.optional(),
    gemini: cliProfileSchema.optional(),
    roles: z.record(z.string(), cliRoleSchema).optional(),
    outputMaxBytes: z.number().default(51200),
    defaultTimeout: z.number().default(300),
  })
  .optional();

export const junFlowConfigSchema = z.object({
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
    defaultBaseBranch: z.string().default('main'),
  }),
  output: z.object({
    color: z.boolean().default(true),
    verbose: z.boolean().default(false),
  }),
  hooks: z.array(hookDefinitionSchema).optional(),
  cli: cliSchema,
});

export type JunFlowConfig = z.infer<typeof junFlowConfigSchema>;
