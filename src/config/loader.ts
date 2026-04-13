import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { gitPilotConfigSchema, type GitPilotConfig } from './schema.js';
import { CONFIG_DIR, CONFIG_FILE, LOCAL_CONFIG_FILE, DEFAULT_CONFIG } from './defaults.js';

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

function applyEnvOverrides(config: GitPilotConfig): GitPilotConfig {
  const result = structuredClone(config);

  if (process.env['NOTION_API_KEY'] && result.tracker.notion) {
    result.tracker.notion.apiKey = process.env['NOTION_API_KEY'];
  }

  if (process.env['GITHUB_TOKEN'] && result.tracker.github) {
    result.tracker.github.token = process.env['GITHUB_TOKEN'];
  }

  if (process.env['JIRA_API_TOKEN'] && result.tracker.jira) {
    result.tracker.jira.apiToken = process.env['JIRA_API_TOKEN'];
  }

  return result;
}

async function loadYaml(filePath: string): Promise<unknown | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return yaml.load(content);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function stripLegacyKeys(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  delete obj['ai'];
  delete obj['cli'];
  return obj;
}

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

/**
 * Config 로딩 우선순위:
 * 1. 프로젝트 로컬: ./.git-pilot.yaml (cwd 기준)
 * 2. 글로벌: ~/.git-pilot/config.yaml
 * 3. 환경변수: GITHUB_TOKEN, JIRA_API_TOKEN 등
 * 4. 기본값: DEFAULT_CONFIG
 *
 * 로컬이 글로벌을 오버라이드, 글로벌이 기본값을 오버라이드.
 */
export async function loadConfig(cwd?: string): Promise<GitPilotConfig> {
  const workDir = cwd ?? process.cwd();

  // 1. 기본값에서 시작
  let merged = DEFAULT_CONFIG as Record<string, unknown>;

  // 2. 글로벌 config 머지
  const globalRaw = await loadYaml(CONFIG_FILE);
  if (globalRaw) {
    merged = deepMerge(merged, stripLegacyKeys(globalRaw));
  }

  // 3. 로컬 config 머지 (글로벌을 오버라이드)
  const localPath = path.join(workDir, LOCAL_CONFIG_FILE);
  const localRaw = await loadYaml(localPath);
  if (localRaw) {
    merged = deepMerge(merged, stripLegacyKeys(localRaw));
  }

  // 4. 파싱 + 환경변수 오버라이드
  const parsed = gitPilotConfigSchema.parse(merged);
  return applyEnvOverrides(parsed);
}

export async function saveConfig(config: GitPilotConfig, options?: { local?: boolean; cwd?: string }): Promise<void> {
  const validated = gitPilotConfigSchema.parse(config);
  const content = yaml.dump(validated, { indent: 2 });

  if (options?.local) {
    const workDir = options.cwd ?? process.cwd();
    const localPath = path.join(workDir, LOCAL_CONFIG_FILE);
    await fs.writeFile(localPath, content, 'utf-8');
  } else {
    await ensureConfigDir();
    await fs.writeFile(CONFIG_FILE, content, 'utf-8');
  }
}

export { CONFIG_FILE, CONFIG_DIR, LOCAL_CONFIG_FILE };
