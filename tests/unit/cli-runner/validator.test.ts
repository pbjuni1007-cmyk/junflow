import { describe, it, expect } from 'vitest';
import { resolveBin } from '../../../src/cli-runner/validator.js';

describe('resolveBin', () => {
  it('should return custom bin when provided', () => {
    expect(resolveBin('codex', '/usr/local/bin/codex')).toBe('/usr/local/bin/codex');
  });

  it('should return cli name when no custom bin', () => {
    expect(resolveBin('codex')).toBe('codex');
    expect(resolveBin('gemini')).toBe('gemini');
  });
});
