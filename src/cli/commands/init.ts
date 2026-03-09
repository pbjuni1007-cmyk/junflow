import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig } from '../../config/loader.js';
import { DEFAULT_CONFIG } from '../../config/defaults.js';
import type { JunFlowConfig } from '../../config/schema.js';
import { handleCliError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export const initCommand = new Command('init')
  .description('대화형 위저드로 junflow 설정을 초기화합니다')
  .action(async () => {
    console.log(chalk.bold.cyan('\njunflow 초기화 위저드'));
    console.log(chalk.gray('설정 파일을 생성합니다. Enter를 눌러 기본값을 사용하세요.\n'));

    const hasAnthropicKey = Boolean(process.env['ANTHROPIC_API_KEY']);

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'aiProvider',
        message: 'AI 프로바이더를 선택하세요:',
        choices: [{ name: 'Claude (Anthropic)', value: 'claude' }],
        default: 'claude',
      },
      {
        type: 'password',
        name: 'anthropicApiKey',
        message: 'ANTHROPIC_API_KEY를 입력하세요:',
        when: !hasAnthropicKey,
        validate: (input: string) =>
          input.trim().length > 0 || 'API 키를 입력해야 합니다',
      },
      {
        type: 'list',
        name: 'trackerType',
        message: '이슈 트래커를 선택하세요:',
        choices: [
          { name: 'Notion', value: 'notion' },
          { name: 'Mock (테스트용)', value: 'mock' },
        ],
        default: 'mock',
      },
      {
        type: 'password',
        name: 'notionApiKey',
        message: 'NOTION_API_KEY를 입력하세요:',
        when: (ans: Record<string, string>) =>
          ans['trackerType'] === 'notion' && !process.env['NOTION_API_KEY'],
        validate: (input: string) =>
          input.trim().length > 0 || 'Notion API 키를 입력해야 합니다',
      },
      {
        type: 'input',
        name: 'notionDatabaseId',
        message: 'Notion 데이터베이스 ID를 입력하세요:',
        when: (ans: Record<string, string>) => ans['trackerType'] === 'notion',
        validate: (input: string) =>
          input.trim().length > 0 || '데이터베이스 ID를 입력해야 합니다',
      },
      {
        type: 'input',
        name: 'branchConvention',
        message: '브랜치 네이밍 컨벤션:',
        default: DEFAULT_CONFIG.git.branchConvention,
      },
      {
        type: 'list',
        name: 'commitConvention',
        message: '커밋 메시지 컨벤션:',
        choices: [
          { name: 'Conventional Commits', value: 'conventional' },
          { name: 'Gitmoji', value: 'gitmoji' },
        ],
        default: 'conventional',
      },
      {
        type: 'list',
        name: 'commitLanguage',
        message: '커밋 메시지 언어:',
        choices: [
          { name: '한국어', value: 'ko' },
          { name: 'English', value: 'en' },
        ],
        default: 'ko',
      },
    ]);

    const config: JunFlowConfig = {
      ai: {
        provider: 'claude',
        model: DEFAULT_CONFIG.ai.model,
        maxTokens: DEFAULT_CONFIG.ai.maxTokens,
        ...(answers['anthropicApiKey']
          ? { apiKey: answers['anthropicApiKey'] as string }
          : {}),
      },
      tracker: {
        type: answers['trackerType'] as 'notion' | 'mock',
        ...(answers['trackerType'] === 'notion'
          ? {
              notion: {
                databaseId: answers['notionDatabaseId'] as string,
                ...(answers['notionApiKey']
                  ? { apiKey: answers['notionApiKey'] as string }
                  : {}),
              },
            }
          : {}),
      },
      git: {
        branchConvention: answers['branchConvention'] as string,
        commitConvention: answers['commitConvention'] as 'conventional' | 'gitmoji',
        commitLanguage: answers['commitLanguage'] as 'ko' | 'en',
      },
      output: {
        color: DEFAULT_CONFIG.output.color,
        verbose: DEFAULT_CONFIG.output.verbose,
      },
    };

    const spinner = ora('설정 파일 저장 중...').start();
    try {
      await saveConfig(config);
      spinner.stop();
      logger.success('설정 파일이 저장되었습니다');
      logger.info('junflow를 사용할 준비가 되었습니다!');
    } catch (err) {
      spinner.stop();
      handleCliError(err);
    }
  });
