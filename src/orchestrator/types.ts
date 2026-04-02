/**
 * 외부 CLI 워커 스폰 및 티어 시스템 타입 정의.
 */

/** 실행 환경 티어 */
export enum Tier {
  /** 모든 CLI + 병렬 실행 가능 */
  FULL = 1,
  /** API 호출만 (CLI 미설치) */
  PARTIAL = 2,
  /** 단일 provider만 */
  MINIMAL = 3,
}

/** 지원하는 외부 CLI 종류 */
export type CliName = 'codex' | 'gemini' | 'claude';

/** CLI 스폰 옵션 */
export interface SpawnOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/** CLI 워커 실행 결과 */
export interface WorkerResult {
  cli: CliName;
  output: string;
  exitCode: number;
  durationMs: number;
  timedOut?: boolean;
}

/** DAG 스텝에서 CLI 워커를 사용할 때의 설정 */
export interface CliWorkerConfig {
  type: 'cli-worker';
  cli: CliName;
  prompt: string;
  options?: SpawnOptions;
}

/** 티어 감지 결과 */
export interface TierInfo {
  tier: Tier;
  availableClis: CliName[];
  availableProviders: string[];
}
