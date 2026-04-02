import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Tier } from './types.js';
import type { CliName, TierInfo } from './types.js';

const execFileAsync = promisify(execFile);

const CLI_LIST: CliName[] = ['codex', 'gemini', 'claude'];

const PROVIDER_ENV_KEYS: Record<string, string> = {
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

/** CLI가 시스템에 설치되어 있는지 확인 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(which, [cmd], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** 환경변수에서 사용 가능한 API 프로바이더 이름 목록 반환 */
function detectProviders(): string[] {
  return Object.entries(PROVIDER_ENV_KEYS)
    .filter(([, envKey]) => !!process.env[envKey])
    .map(([name]) => name);
}

/**
 * 현재 환경의 실행 티어를 감지한다.
 *
 * - FULL (Tier 1): CLI 1개 이상 설치
 * - PARTIAL (Tier 2): CLI 없지만 API 키 2개 이상
 * - MINIMAL (Tier 3): 단일 프로바이더만
 */
export async function detectTier(): Promise<TierInfo> {
  const [cliResults, providers] = await Promise.all([
    Promise.all(CLI_LIST.map(async (cli) => ({ cli, exists: await commandExists(cli) }))),
    Promise.resolve(detectProviders()),
  ]);

  const availableClis = cliResults
    .filter((r) => r.exists)
    .map((r) => r.cli);

  if (availableClis.length > 0) {
    return { tier: Tier.FULL, availableClis, availableProviders: providers };
  }

  if (providers.length >= 2) {
    return { tier: Tier.PARTIAL, availableClis: [], availableProviders: providers };
  }

  return { tier: Tier.MINIMAL, availableClis: [], availableProviders: providers };
}

/** 특정 CLI 사용 가능 여부만 빠르게 확인 */
export async function isCliAvailable(cli: CliName): Promise<boolean> {
  return commandExists(cli);
}
