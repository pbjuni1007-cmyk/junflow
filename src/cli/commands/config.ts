import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../../config/loader.js';
import { DEFAULT_CONFIG, CONFIG_FILE } from '../../config/defaults.js';
import { handleCliError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

function maskSecret(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

function maskConfig(obj: unknown, secretKeys = ['apiKey']): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map((item) => maskConfig(item, secretKeys));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (secretKeys.includes(key) && typeof value === 'string') {
      result[key] = maskSecret(value);
    } else {
      result[key] = maskConfig(value, secretKeys);
    }
  }
  return result;
}

function setNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const keys = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (typeof cur[key] !== 'object' || cur[key] === null) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1]!;
  cur[lastKey] = value;
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== '') return num;
  return raw;
}

export const configCommand = new Command('config')
  .description('junflow 설정을 관리합니다');

configCommand
  .command('show')
  .description('현재 설정을 출력합니다')
  .action(async () => {
    try {
      const config = await loadConfig();
      const masked = maskConfig(config);
      console.log(chalk.bold.cyan('현재 설정:'));
      console.log(JSON.stringify(masked, null, 2));
    } catch (err) {
      handleCliError(err);
    }
  });

configCommand
  .command('set <key> <value>')
  .description('dot notation으로 설정 값을 변경합니다 (예: git.commitLanguage en)')
  .action(async (key: string, value: string) => {
    try {
      const config = await loadConfig();
      const parsed = parseValue(value);
      setNestedValue(config as unknown as Record<string, unknown>, key, parsed);
      await saveConfig(config);
      logger.success(`설정 변경: ${key} = ${String(parsed)}`);
    } catch (err) {
      handleCliError(err);
    }
  });

configCommand
  .command('reset')
  .description('설정을 기본값으로 초기화합니다')
  .action(async () => {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: chalk.yellow('설정을 기본값으로 초기화하시겠습니까?'),
        default: false,
      },
    ]);

    if (!confirmed) {
      logger.info('초기화가 취소되었습니다.');
      return;
    }

    try {
      await saveConfig(DEFAULT_CONFIG);
      logger.success('설정이 기본값으로 초기화되었습니다.');
    } catch (err) {
      handleCliError(err);
    }
  });

configCommand
  .command('path')
  .description('설정 파일 경로를 출력합니다')
  .action(() => {
    console.log(CONFIG_FILE);
  });
