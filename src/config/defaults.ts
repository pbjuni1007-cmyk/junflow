import os from 'os';
import path from 'path';
import type { GitPilotConfig } from './schema.js';

export const CONFIG_DIR = path.join(os.homedir(), '.git-pilot');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml');

export const DEFAULT_CONFIG: GitPilotConfig = {
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
};
