import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { CONFIG_DIR, CONFIG_FILE, DEFAULT_CONFIG } from '../../../src/config/defaults.js';

describe('config/defaults', () => {
  it('CONFIG_DIR은 homedir/.junflow이다', () => {
    expect(CONFIG_DIR).toBe(path.join(os.homedir(), '.junflow'));
  });

  it('CONFIG_FILE은 CONFIG_DIR/config.yaml이다', () => {
    expect(CONFIG_FILE).toBe(path.join(os.homedir(), '.junflow', 'config.yaml'));
  });

  it('DEFAULT_CONFIG.ai.provider가 claude이다', () => {
    expect(DEFAULT_CONFIG.ai.provider).toBe('claude');
  });

  it('DEFAULT_CONFIG.ai.model이 설정되어 있다', () => {
    expect(DEFAULT_CONFIG.ai.model).toBe('claude-sonnet-4-20250514');
  });

  it('DEFAULT_CONFIG.ai.maxTokens가 2048이다', () => {
    expect(DEFAULT_CONFIG.ai.maxTokens).toBe(2048);
  });

  it('DEFAULT_CONFIG.tracker.type이 mock이다', () => {
    expect(DEFAULT_CONFIG.tracker.type).toBe('mock');
  });

  it('DEFAULT_CONFIG.git.commitConvention이 conventional이다', () => {
    expect(DEFAULT_CONFIG.git.commitConvention).toBe('conventional');
  });

  it('DEFAULT_CONFIG.git.commitLanguage가 ko이다', () => {
    expect(DEFAULT_CONFIG.git.commitLanguage).toBe('ko');
  });

  it('DEFAULT_CONFIG.git.branchConvention 패턴이 설정되어 있다', () => {
    expect(DEFAULT_CONFIG.git.branchConvention).toContain('{type}');
    expect(DEFAULT_CONFIG.git.branchConvention).toContain('{issueId}');
    expect(DEFAULT_CONFIG.git.branchConvention).toContain('{description}');
  });

  it('DEFAULT_CONFIG.output.color가 true이다', () => {
    expect(DEFAULT_CONFIG.output.color).toBe(true);
  });

  it('DEFAULT_CONFIG.output.verbose가 false이다', () => {
    expect(DEFAULT_CONFIG.output.verbose).toBe(false);
  });
});
