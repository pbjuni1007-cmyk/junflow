import chalk from 'chalk';
import { ZodError } from 'zod';
import type { AgentError } from '../../agents/types.js';

// AgentError 코드별 사용자 친화적 메시지
const AGENT_ERROR_MESSAGES: Record<AgentError['code'], string> = {
  AI_ERROR: 'AI 응답을 처리하는 데 실패했습니다. 다시 시도해주세요.',
  AI_PARSE_ERROR: 'AI 응답을 처리하는 데 실패했습니다. 다시 시도해주세요.',
  TRACKER_ERROR: 'Notion 데이터베이스에 접근할 수 없습니다. API 키 권한과 데이터베이스 공유 설정을 확인해주세요.',
  GIT_ERROR: '현재 디렉토리는 git 저장소가 아닙니다. git init을 실행하거나 git 저장소로 이동해주세요.',
  VALIDATION_ERROR: '입력값 검증에 실패했습니다.',
  CONFIG_ERROR: '설정 파일이 손상되었습니다. `junflow config reset`으로 초기화하거나 직접 수정해주세요.',
  NETWORK_ERROR: 'API 서버 응답이 지연되고 있습니다. 네트워크 연결을 확인해주세요.',
};

function isAgentError(error: unknown): error is { code: AgentError['code']; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as Record<string, unknown>)['code'] === 'string' &&
    'message' in error
  );
}

function isVerbose(): boolean {
  return process.env['JUNFLOW_VERBOSE'] === '1' || process.argv.includes('--verbose');
}

export function handleCliError(error: unknown): never {
  if (isAgentError(error)) {
    const friendlyMessage = AGENT_ERROR_MESSAGES[error.code as AgentError['code']];
    if (friendlyMessage) {
      console.error(`${chalk.red('✖')} ${friendlyMessage}`);
    } else {
      console.error(`${chalk.red('✖')} ${error.message}`);
    }
    if (isVerbose() && 'cause' in (error as Record<string, unknown>)) {
      console.error(chalk.dim('원인:'), (error as Record<string, unknown>)['cause']);
    }
    process.exit(1);
  }

  if (error instanceof ZodError) {
    console.error(`${chalk.red('✖')} 설정 파일이 손상되었습니다. \`junflow config reset\`으로 초기화하거나 직접 수정해주세요.`);
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

    // API 키 관련 에러 감지
    if (
      error.message.includes('401') ||
      error.message.includes('authentication') ||
      error.message.includes('API key')
    ) {
      console.error(`${chalk.red('✖')} ANTHROPIC_API_KEY가 설정되지 않았습니다. \`junflow init\`을 실행하거나 환경변수를 설정해주세요.`);
      process.exit(1);
    }

    // Notion 접근 권한 에러 감지
    if (
      error.message.includes('403') ||
      error.message.includes('404') ||
      error.message.includes('Notion')
    ) {
      console.error(`${chalk.red('✖')} Notion 데이터베이스에 접근할 수 없습니다. API 키 권한과 데이터베이스 공유 설정을 확인해주세요.`);
      process.exit(1);
    }

    console.error(`${chalk.red('✖')} ${error.message}`);
    process.exit(1);
  }

  console.error(`${chalk.red('✖')} 알 수 없는 오류가 발생했습니다.`);
  process.exit(1);
}

// 특정 에러 시나리오용 헬퍼
export const cliErrors = {
  missingApiKey(keyName: 'ANTHROPIC_API_KEY' | 'NOTION_API_KEY'): never {
    if (keyName === 'ANTHROPIC_API_KEY') {
      console.error(`${chalk.red('✖')} ANTHROPIC_API_KEY가 설정되지 않았습니다. \`junflow init\`을 실행하거나 환경변수를 설정해주세요.`);
    } else {
      console.error(`${chalk.red('✖')} NOTION_API_KEY가 설정되지 않았습니다. \`junflow init\`을 실행하거나 환경변수를 설정해주세요.`);
    }
    process.exit(1);
  },

  notGitRepo(): never {
    console.error(`${chalk.red('✖')} 현재 디렉토리는 git 저장소가 아닙니다. git init을 실행하거나 git 저장소로 이동해주세요.`);
    process.exit(1);
  },

  noStagedFiles(): never {
    console.error(`${chalk.red('✖')} staged 파일이 없습니다. \`git add\`로 파일을 추가한 후 다시 시도해주세요.`);
    process.exit(1);
  },

  configCorrupted(): never {
    console.error(`${chalk.red('✖')} 설정 파일이 손상되었습니다. \`junflow config reset\`으로 초기화하거나 직접 수정해주세요.`);
    process.exit(1);
  },
};
