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
  },
  output: {
    color: true,
    verbose: false,
  },
};
