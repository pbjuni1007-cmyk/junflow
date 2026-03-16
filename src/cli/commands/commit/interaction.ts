import inquirer from 'inquirer';
import { logger } from '../../utils/logger.js';

export async function selectMessage(
  candidates: string[],
  auto: boolean,
): Promise<string> {
  if (auto) {
    const selected = candidates[0]!;
    logger.success(`자동 선택: ${selected}`);
    return selected;
  }

  const { choice } = await inquirer.prompt<{ choice: string }>([
    {
      type: 'input',
      name: 'choice',
      message: '선택 [1-3/e/q]:',
      default: '1',
    },
  ]);

  const trimmed = choice.trim().toLowerCase();

  if (trimmed === 'q') {
    logger.info('취소되었습니다.');
    process.exit(0);
  }

  if (trimmed === 'e') {
    const { customMessage } = await inquirer.prompt<{ customMessage: string }>([
      {
        type: 'input',
        name: 'customMessage',
        message: '커밋 메시지를 입력하세요:',
        default: candidates[0],
        validate: (input: string) =>
          input.trim().length > 0 || '메시지를 입력해야 합니다',
      },
    ]);
    return customMessage.trim();
  }

  const idx = parseInt(trimmed, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
    return candidates[0]!;
  }
  return candidates[idx]!;
}
