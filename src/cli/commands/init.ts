import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig } from '../../config/loader.js';
import { DEFAULT_CONFIG } from '../../config/defaults.js';
import type { GitPilotConfig } from '../../config/schema.js';
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

  if (!settings['hooks'] || !Array.isArray(settings['hooks'])) {
    settings['hooks'] = [];
  }

  const hooks = settings['hooks'] as Array<Record<string, unknown>>;

  const hookCommand = 'node node_modules/git-pilot/dist/hooks/keyword-detector.js';
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
    description: 'Git Pilot 자연어 라우팅 — 프롬프트에서 스킬을 자동 감지',
  });

  settings['hooks'] = hooks;

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  logger.success(`Claude Code 훅 등록 완료: ${settingsPath}`);
}

async function checkGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes('.git-pilot')) {
      logger.warn('.git-pilot/를 .gitignore에 추가하세요: echo ".git-pilot/" >> .gitignore');
    }
  } catch {
    logger.warn('.gitignore 파일이 없습니다. .git-pilot/ 디렉토리가 커밋되지 않도록 주의하세요.');
  }
}

export const initCommand = new Command('init')
  .description('대화형 위저드로 git-pilot 설정을 초기화합니다')
  .option('--hooks', 'Claude Code settings.json에 자연어 라우팅 훅을 등록합니다')
  .option('--local', '프로젝트 로컬 설정 파일(.git-pilot.yaml)을 생성합니다')
  .action(async (options: { hooks?: boolean; local?: boolean }) => {
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

    const isLocal = options.local === true;
    console.log(chalk.bold.cyan(`\nGit Pilot 초기화 위저드 ${isLocal ? '(프로젝트 로컬)' : '(글로벌)'}`));
    console.log(chalk.gray(isLocal
      ? '이 프로젝트의 .git-pilot.yaml을 생성합니다. Enter를 눌러 기본값을 사용하세요.\n'
      : 'Git 워크플로우 자동화 도구를 설정합니다. Enter를 눌러 기본값을 사용하세요.\n',
    ));

    const answers = await inquirer.prompt([
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
      {
        type: 'input',
        name: 'defaultBaseBranch',
        message: '기본 비교 브랜치:',
        default: 'main',
      },
    ]);

    const config: GitPilotConfig = {
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
        defaultBaseBranch: answers['defaultBaseBranch'] as string,
      },
      output: {
        color: DEFAULT_CONFIG.output.color,
        verbose: DEFAULT_CONFIG.output.verbose,
      },
    };

    const spinner = ora('설정 파일 저장 중...').start();
    try {
      await saveConfig(config, isLocal ? { local: true } : undefined);
      spinner.stop();

      if (isLocal) {
        logger.success('프로젝트 로컬 설정 파일(.git-pilot.yaml)이 저장되었습니다.');
        await checkGitignore(process.cwd());
        console.log(chalk.bold.cyan('\n다음 단계:'));
        console.log(`  ${chalk.green('이슈 시작:')} /git-pilot-start <issue-id>`);
        console.log(`  ${chalk.green('커밋:')} /git-pilot-commit`);
        console.log(chalk.gray('\n  Tip: API 토큰은 환경변수로 설정하면 config에 포함되지 않아 안전합니다.\n'));
      } else {
        logger.success('글로벌 설정 파일이 저장되었습니다.');
        await checkGitignore(process.cwd());
        console.log(chalk.bold.cyan('\n다음 단계:'));
        console.log(`  ${chalk.green('프로젝트별 설정:')} git-pilot init --local`);
        console.log(`  ${chalk.green('상태 확인:')} git-pilot status`);
        console.log(`  ${chalk.green('훅 등록:')} git-pilot init --hooks\n`);
      }
    } catch (err) {
      spinner.stop();
      handleCliError(err);
    }
  });
