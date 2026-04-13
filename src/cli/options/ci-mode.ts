import { Command } from 'commander';

export type OutputFormat = 'text' | 'json';
export type CommentFormat = 'github-pr' | 'gitlab-mr' | 'plain';

export interface CiOptions {
  ci: boolean;
  output: OutputFormat;
  format: CommentFormat;
}

const CI_ENV_VARS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'JENKINS_URL',
  'CIRCLECI',
  'TRAVIS',
] as const;

export function isCI(): boolean {
  return CI_ENV_VARS.some((v) => !!process.env[v]);
}

export function detectCIProvider(): 'github' | 'gitlab' | 'jenkins' | 'circleci' | 'travis' | null {
  if (process.env['GITHUB_ACTIONS']) return 'github';
  if (process.env['GITLAB_CI']) return 'gitlab';
  if (process.env['JENKINS_URL']) return 'jenkins';
  if (process.env['CIRCLECI']) return 'circleci';
  if (process.env['TRAVIS']) return 'travis';
  return null;
}

export function addCiOptions(command: Command): Command {
  return command
    .option('--ci', 'CI 모드 (interactive 프롬프트 비활성화)')
    .option('--output <format>', '출력 포맷 (text, json)', 'text')
    .option('--format <type>', '코멘트 포맷 (github-pr, gitlab-mr, plain)', 'plain');
}

export function resolveCiOptions(options: Partial<CiOptions>): CiOptions {
  const ci = options.ci || isCI();
  return {
    ci,
    output: (options.output as OutputFormat) ?? 'text',
    format: (options.format as CommentFormat) ?? 'plain',
  };
}
