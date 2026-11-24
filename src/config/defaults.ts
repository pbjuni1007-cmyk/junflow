import os from 'os';
import path from 'path';
import type { JunFlowConfig } from './schema.js';

export const CONFIG_DIR = path.join(os.homedir(), '.junflow');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

export const DEFAULT_CONFIG: JunFlowConfig = {
  ai: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
  },
  tracker: {
    type: 'mock',
  },
  git: {
    branchConvention: '{type}/{issueId}-{description}',
    commitConvention: 'conventional',
    commitLanguage: 'ko',
    defaultBaseBranch: 'main',
  },
  output: {
    color: true,
    verbose: false,
  },
  cli: {
    codex: {
      profiles: {
        implementation: 'codex53_high',
        review: 'codex53_low',
      },
    },
    gemini: {
      profiles: {
        search: 'gemini-3.1-pro-preview',
        design: 'gemini-3-flash-preview',
      },
    },
    roles: {
      executor: { cli: 'codex' as const, profile: 'implementation' },
      reviewer: { cli: 'codex' as const, profile: 'review' },
      researcher: { cli: 'gemini' as const, profile: 'search' },
      designer: { cli: 'gemini' as const, profile: 'design' },
    },
    outputMaxBytes: 51200,
    defaultTimeout: 300,
  },
};
