import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCI, detectCIProvider, resolveCiOptions } from '../../../../src/cli/options/ci-mode.js';

// 테스트 간 환경변수 오염 방지
const ENV_KEYS = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'CIRCLECI', 'TRAVIS'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

describe('isCI()', () => {
  it('환경변수 없으면 false', () => {
    expect(isCI()).toBe(false);
  });

  it('CI=true이면 true', () => {
    process.env['CI'] = 'true';
    expect(isCI()).toBe(true);
  });

  it('GITHUB_ACTIONS=true이면 true', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    expect(isCI()).toBe(true);
  });

  it('GITLAB_CI=true이면 true', () => {
    process.env['GITLAB_CI'] = 'true';
    expect(isCI()).toBe(true);
  });

  it('JENKINS_URL이 있으면 true', () => {
    process.env['JENKINS_URL'] = 'http://jenkins.example.com';
    expect(isCI()).toBe(true);
  });

  it('CIRCLECI=true이면 true', () => {
    process.env['CIRCLECI'] = 'true';
    expect(isCI()).toBe(true);
  });

  it('TRAVIS=true이면 true', () => {
    process.env['TRAVIS'] = 'true';
    expect(isCI()).toBe(true);
  });
});

describe('detectCIProvider()', () => {
  it('환경변수 없으면 null', () => {
    expect(detectCIProvider()).toBeNull();
  });

  it('GITHUB_ACTIONS → github', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    expect(detectCIProvider()).toBe('github');
  });

  it('GITLAB_CI → gitlab', () => {
    process.env['GITLAB_CI'] = 'true';
    expect(detectCIProvider()).toBe('gitlab');
  });

  it('JENKINS_URL → jenkins', () => {
    process.env['JENKINS_URL'] = 'http://jenkins.example.com';
    expect(detectCIProvider()).toBe('jenkins');
  });

  it('CIRCLECI → circleci', () => {
    process.env['CIRCLECI'] = 'true';
    expect(detectCIProvider()).toBe('circleci');
  });

  it('TRAVIS → travis', () => {
    process.env['TRAVIS'] = 'true';
    expect(detectCIProvider()).toBe('travis');
  });
});

describe('resolveCiOptions()', () => {
  it('기본값: ci=false, output=text, format=plain', () => {
    const opts = resolveCiOptions({});
    expect(opts).toEqual({ ci: false, output: 'text', format: 'plain' });
  });

  it('--ci 플래그로 강제 CI 모드', () => {
    const opts = resolveCiOptions({ ci: true });
    expect(opts.ci).toBe(true);
  });

  it('CI 환경변수가 있으면 자동 CI 모드', () => {
    process.env['CI'] = 'true';
    const opts = resolveCiOptions({});
    expect(opts.ci).toBe(true);
  });

  it('--output json 전달', () => {
    const opts = resolveCiOptions({ output: 'json' });
    expect(opts.output).toBe('json');
  });

  it('--format github-pr 전달', () => {
    const opts = resolveCiOptions({ format: 'github-pr' });
    expect(opts.format).toBe('github-pr');
  });

  it('모든 옵션 조합', () => {
    const opts = resolveCiOptions({ ci: true, output: 'json', format: 'gitlab-mr' });
    expect(opts).toEqual({ ci: true, output: 'json', format: 'gitlab-mr' });
  });
});
