import fs from 'fs/promises';
import yaml from 'js-yaml';
import { junFlowConfigSchema, type JunFlowConfig } from './schema.js';
import { CONFIG_DIR, CONFIG_FILE, DEFAULT_CONFIG } from './defaults.js';

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

function applyEnvOverrides(config: JunFlowConfig): JunFlowConfig {
  const result = structuredClone(config);

  if (result.ai.provider === 'claude' && process.env['ANTHROPIC_API_KEY']) {
    result.ai.apiKey = process.env['ANTHROPIC_API_KEY'];
  } else if (result.ai.provider === 'openai' && process.env['OPENAI_API_KEY']) {
    result.ai.apiKey = process.env['OPENAI_API_KEY'];
  } else if (result.ai.provider === 'gemini' && process.env['GEMINI_API_KEY']) {
    result.ai.apiKey = process.env['GEMINI_API_KEY'];
  }

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

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(): Promise<JunFlowConfig> {
  let raw: unknown;

  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    raw = yaml.load(content);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return applyEnvOverrides(DEFAULT_CONFIG);
    }
    throw err;
  }

  const merged = deepMerge(DEFAULT_CONFIG as Record<string, unknown>, (raw ?? {}) as Record<string, unknown>);
  const parsed = junFlowConfigSchema.parse(merged);
  return applyEnvOverrides(parsed);
}

export async function saveConfig(config: JunFlowConfig): Promise<void> {
  const validated = junFlowConfigSchema.parse(config);
  await ensureConfigDir();
  const content = yaml.dump(validated, { indent: 2 });
  await fs.writeFile(CONFIG_FILE, content, 'utf-8');
}

export { CONFIG_FILE, CONFIG_DIR };
