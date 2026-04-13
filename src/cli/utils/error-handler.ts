import chalk from 'chalk';
import { ZodError } from 'zod';

function isVerbose(): boolean {
  return process.env['GIT_PILOT_VERBOSE'] === '1' || process.argv.includes('--verbose');
}

export function handleCliError(error: unknown): never {
  if (error instanceof ZodError) {
    console.error(`${chalk.red('✖')} 설정 파일이 손상되었습니다. \`git-pilot config reset\`으로 초기화하거나 직접 수정해주세요.`);
    if (isVerbose()) {
      console.error(chalk.dim('상세:'), error.message);
    }
    process.exit(1);
  }

  if (error instanceof Error) {
    // 네트워크 관련 에러 감지
    if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('ENOTFOUND')
    ) {
      console.error(`${chalk.red('✖')} API 서버 응답이 지연되고 있습니다. 네트워크 연결을 확인해주세요.`);
      process.exit(1);
    }

    console.error(`${chalk.red('✖')} ${error.message}`);
    process.exit(1);
  }

  console.error(`${chalk.red('✖')} 알 수 없는 오류가 발생했습니다.`);
  process.exit(1);
}

export const cliErrors = {
  notGitRepo(): never {
    console.error(`${chalk.red('✖')} 현재 디렉토리는 git 저장소가 아닙니다. git init을 실행하거나 git 저장소로 이동해주세요.`);
    process.exit(1);
  },

  configCorrupted(): never {
    console.error(`${chalk.red('✖')} 설정 파일이 손상되었습니다. \`git-pilot config reset\`으로 초기화하거나 직접 수정해주세요.`);
    process.exit(1);
  },
};
