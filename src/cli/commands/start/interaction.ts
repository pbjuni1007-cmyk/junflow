import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { branchExists, createBranch } from '../../../git/operations.js';
import { logger } from '../../utils/logger.js';
import { handleCliError } from '../../utils/error-handler.js';

export async function selectBranch(
  branchCandidates: string[],
  branchName: string,
  dryRun: boolean,
): Promise<string> {
  if (dryRun) {
    return branchCandidates[0] ?? branchName;
  }

  const choices = branchCandidates.map((b, i) => ({
    name: i === 0 ? `${chalk.cyan('>')} ${b} ${chalk.dim('(추천)')}` : `  ${b}`,
    value: b,
    short: b,
  }));
  choices.push({ name: chalk.dim('  직접 입력...'), value: '__custom__', short: '직접 입력' });

  const { chosenBranch } = await inquirer.prompt<{ chosenBranch: string }>([
    {
      type: 'list',
      name: 'chosenBranch',
      message: '브랜치를 선택하세요:',
      choices,
      default: branchCandidates[0],
    },
  ]);

  if (chosenBranch === '__custom__') {
    const { customBranch } = await inquirer.prompt<{ customBranch: string }>([
      {
        type: 'input',
        name: 'customBranch',
        message: '브랜치 이름을 입력하세요:',
        default: branchCandidates[0],
        validate: (input: string) => input.trim().length > 0 || '브랜치 이름을 입력해야 합니다',
      },
    ]);
    return customBranch.trim();
  }

  return chosenBranch;
}

export async function createBranchIfNeeded(
  cwd: string,
  selectedBranch: string,
  shouldCreate: boolean,
  dryRun: boolean,
): Promise<void> {
  if (!shouldCreate || dryRun) return;

  const exists = await branchExists(cwd, selectedBranch);
  if (exists) {
    logger.warn(`브랜치 '${selectedBranch}'가 이미 존재합니다.`);
    return;
  }

  const branchCreateSpinner = ora(`브랜치 '${selectedBranch}' 생성 중...`).start();
  try {
    await createBranch(cwd, selectedBranch);
    branchCreateSpinner.stop();
    logger.success(`브랜치 '${selectedBranch}' 생성 완료`);
  } catch (err) {
    branchCreateSpinner.stop();
    handleCliError(err);
  }
}
