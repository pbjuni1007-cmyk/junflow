import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig } from '../../config/loader.js';
import { DEFAULT_CONFIG } from '../../config/defaults.js';
import type { JunFlowConfig } from '../../config/schema.js';
import { handleCliError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

async function registerClaudeCodeHooks(): Promise<void> {
  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');

  let settings: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // 파일이 없으면 새로 생성
  }

  // hooks 배열이 없으면 초기화
  if (!settings['hooks'] || !Array.isArray(settings['hooks'])) {
    settings['hooks'] = [];
  }

  const hooks = settings['hooks'] as Array<Record<string, unknown>>;

  // junflow keyword-detector 훅이 이미 있는지 확인
  const hookCommand = 'node node_modules/junflow/dist/hooks/keyword-detector.js';
  const existing = hooks.find(
    (h) => typeof h['command'] === 'string' && h['command'].includes('keyword-detector'),
  );

  if (existing) {
    logger.info('keyword-detector 훅이 이미 등록되어 있습니다.');
    return;
  }

  hooks.push({
    event: 'UserPromptSubmit',
    command: hookCommand,
    description: 'JunFlow 자연어 라우팅 — 프롬프트에서 스킬을 자동 감지',
  });

  settings['hooks'] = hooks;

  // 디렉토리 보장
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  logger.success(`Claude Code 훅 등록 완료: ${settingsPath}`);
}

export const initCommand = new Command('init')
  .description('대화형 위저드로 junflow 설정을 초기화합니다')
  .option('--hooks', 'Claude Code settings.json에 자연어 라우팅 훅을 등록합니다')
  .action(async (options: { hooks?: boolean }) => {
    // --hooks 전용 모드
    if (options.hooks) {
      const spinner = ora('Claude Code 훅 등록 중...').start();
      try {
        await registerClaudeCodeHooks();
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleCliError(err);
      }
      return;
    }

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
          { name: 'GitHub Issues', value: 'github' },
          { name: 'Jira', value: 'jira' },
          { name: 'Mock (테스트용)', value: 'mock' },
        ],
        default: 'mock',
      },
      // Notion
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
      // GitHub Issues
      {
        type: 'input',
        name: 'githubOwner',
        message: 'GitHub 저장소 owner (사용자명 또는 조직명):',
        when: (ans: Record<string, string>) => ans['trackerType'] === 'github',
        validate: (input: string) =>
          input.trim().length > 0 || 'owner를 입력해야 합니다',
      },
      {
        type: 'input',
        name: 'githubRepo',
        message: 'GitHub 저장소 이름:',
        when: (ans: Record<string, string>) => ans['trackerType'] === 'github',
        validate: (input: string) =>
          input.trim().length > 0 || '저장소 이름을 입력해야 합니다',
      },
      {
        type: 'password',
        name: 'githubToken',
        message: 'GitHub Personal Access Token (선택, 비공개 저장소):',
        when: (ans: Record<string, string>) =>
          ans['trackerType'] === 'github' && !process.env['GITHUB_TOKEN'],
      },
      // Jira
      {
        type: 'input',
        name: 'jiraDomain',
        message: 'Jira 도메인 (예: mycompany.atlassian.net):',
        when: (ans: Record<string, string>) => ans['trackerType'] === 'jira',
        validate: (input: string) =>
          input.trim().length > 0 || 'Jira 도메인을 입력해야 합니다',
      },
      {
        type: 'input',
        name: 'jiraEmail',
        message: 'Jira 계정 이메일:',
        when: (ans: Record<string, string>) => ans['trackerType'] === 'jira',
        validate: (input: string) =>
          input.trim().length > 0 || '이메일을 입력해야 합니다',
      },
      {
        type: 'password',
        name: 'jiraApiToken',
        message: 'Jira API Token:',
        when: (ans: Record<string, string>) =>
          ans['trackerType'] === 'jira' && !process.env['JIRA_API_TOKEN'],
        validate: (input: string) =>
          input.trim().length > 0 || 'Jira API Token을 입력해야 합니다',
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
        type: answers['trackerType'] as 'notion' | 'github' | 'jira' | 'mock',
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
        ...(answers['trackerType'] === 'github'
          ? {
              github: {
                owner: answers['githubOwner'] as string,
                repo: answers['githubRepo'] as string,
                ...(answers['githubToken']
                  ? { token: answers['githubToken'] as string }
                  : {}),
              },
            }
          : {}),
        ...(answers['trackerType'] === 'jira'
          ? {
              jira: {
                domain: answers['jiraDomain'] as string,
                email: answers['jiraEmail'] as string,
                ...(answers['jiraApiToken']
                  ? { apiToken: answers['jiraApiToken'] as string }
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
