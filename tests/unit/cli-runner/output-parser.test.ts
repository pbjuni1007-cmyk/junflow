import { describe, it, expect } from 'vitest';
import { parseCliOutput } from '../../../src/cli-runner/output-parser.js';

describe('parseCliOutput', () => {
  it('should strip ANSI escape codes', () => {
    const raw = '\x1b[32mSuccess\x1b[0m: all tests passed';
    const { output } = parseCliOutput(raw);
    expect(output).toBe('Success: all tests passed');
  });

  it('should remove box-drawing characters', () => {
    const raw = '╭──────╮\n│ hello │\n╰──────╯';
    const { output } = parseCliOutput(raw);
    expect(output).not.toContain('╭');
    expect(output).not.toContain('│');
    expect(output).toContain('hello');
  });

  it('should extract text from NDJSON lines', () => {
    const raw = [
      '{"text": "line one"}',
      '{"text": "line two"}',
      '{"content": "line three"}',
      '{"text": "line four"}',
    ].join('\n');
    const { output } = parseCliOutput(raw);
    expect(output).toContain('line one');
    expect(output).toContain('line two');
    expect(output).toContain('line three');
  });

  it('should pass through non-JSON lines', () => {
    const raw = 'plain text output\nanother line';
    const { output } = parseCliOutput(raw);
    expect(output).toBe('plain text output\nanother line');
  });

  it('should truncate output exceeding maxBytes', () => {
    const raw = 'a'.repeat(60000);
    const { output, truncated } = parseCliOutput(raw, 1000);
    expect(truncated).toBe(true);
    expect(output).toContain('[... output truncated]');
    expect(Buffer.byteLength(output, 'utf-8')).toBeLessThanOrEqual(1100);
  });

  it('should not truncate output within maxBytes', () => {
    const raw = 'short output';
    const { output, truncated } = parseCliOutput(raw);
    expect(truncated).toBe(false);
    expect(output).toBe('short output');
  });

  it('should remove spinner characters', () => {
    const raw = '⠋ Loading...\n⠙ Still loading...\nDone!';
    const { output } = parseCliOutput(raw);
    expect(output).not.toContain('⠋');
    expect(output).toContain('Done!');
  });

  it('should collapse excessive blank lines', () => {
    const raw = 'line1\n\n\n\n\nline2';
    const { output } = parseCliOutput(raw);
    expect(output).toBe('line1\n\nline2');
  });

  it('should handle empty input', () => {
    const { output, truncated } = parseCliOutput('');
    expect(output).toBe('');
    expect(truncated).toBe(false);
  });
});
