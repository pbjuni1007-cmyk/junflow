import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZodError, ZodIssueCode } from 'zod';

// process.exit mock
const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
  throw new Error(`process.exit(${_code})`);
});

// console mocks
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env['JUNFLOW_VERBOSE'];
});

// dynamic import to allow spy setup before module load
async function getHandler() {
  const mod = await import('../../../src/cli/utils/error-handler.js');
  return mod;
}

describe('handleCliError()', () => {
  it('AgentError(AI_PARSE_ERROR) → AI 응답 처리 실패 메시지 출력 후 exit(1)', async () => {
    const { handleCliError } = await getHandler();
    const err = { code: 'AI_PARSE_ERROR', message: 'bad json' };

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    expect(errorSpy).toHaveBeenCalledOnce();
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('AI 응답을 처리하는 데 실패했습니다');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('AgentError(AI_ERROR) → AI 응답 처리 실패 메시지', async () => {
    const { handleCliError } = await getHandler();
    const err = { code: 'AI_ERROR', message: 'api error' };

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('AI 응답을 처리하는 데 실패했습니다');
  });

  it('AgentError(TRACKER_ERROR) → Notion 접근 불가 메시지', async () => {
    const { handleCliError } = await getHandler();
    const err = { code: 'TRACKER_ERROR', message: 'forbidden' };

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('Notion 데이터베이스에 접근할 수 없습니다');
  });

  it('AgentError(GIT_ERROR) → git 저장소 아님 메시지', async () => {
    const { handleCliError } = await getHandler();
    const err = { code: 'GIT_ERROR', message: 'not a git repo' };

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('git 저장소가 아닙니다');
  });

  it('AgentError(NETWORK_ERROR) → 네트워크 오류 메시지', async () => {
    const { handleCliError } = await getHandler();
    const err = { code: 'NETWORK_ERROR', message: 'timeout' };

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('네트워크 연결을 확인해주세요');
  });

  it('AgentError(CONFIG_ERROR) → 설정 파일 손상 메시지', async () => {
    const { handleCliError } = await getHandler();
    const err = { code: 'CONFIG_ERROR', message: 'bad config' };

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('설정 파일이 손상되었습니다');
  });

  it('ZodError → 설정 파일 손상 메시지', async () => {
    const { handleCliError } = await getHandler();
    const zodErr = new ZodError([
      { code: ZodIssueCode.invalid_type, expected: 'string', received: 'number', path: ['ai', 'apiKey'], message: 'Expected string' },
    ]);

    expect(() => handleCliError(zodErr)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('설정 파일이 손상되었습니다');
  });

  it('ECONNREFUSED Error → 네트워크 오류 메시지', async () => {
    const { handleCliError } = await getHandler();
    const networkErr = new Error('ECONNREFUSED connect failed');

    expect(() => handleCliError(networkErr)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('네트워크 연결을 확인해주세요');
  });

  it('스택트레이스를 노출하지 않는다', async () => {
    const { handleCliError } = await getHandler();
    const err = { code: 'AI_ERROR', message: 'some error', cause: new Error('internal cause') };

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    // verbose 모드 아닐 때 cause 노출 없음 - errorSpy가 한 번만 호출됨
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('일반 Error → 메시지만 출력', async () => {
    const { handleCliError } = await getHandler();
    const err = new Error('something went wrong');

    expect(() => handleCliError(err)).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('something went wrong');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('cliErrors.*', () => {
  it('missingApiKey(ANTHROPIC_API_KEY) → 적절한 메시지 + exit(1)', async () => {
    const { cliErrors } = await getHandler();

    expect(() => cliErrors.missingApiKey('ANTHROPIC_API_KEY')).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('ANTHROPIC_API_KEY');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('missingApiKey(NOTION_API_KEY) → 적절한 메시지 + exit(1)', async () => {
    const { cliErrors } = await getHandler();

    expect(() => cliErrors.missingApiKey('NOTION_API_KEY')).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('NOTION_API_KEY');
  });

  it('notGitRepo() → git 저장소 메시지 + exit(1)', async () => {
    const { cliErrors } = await getHandler();

    expect(() => cliErrors.notGitRepo()).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('git 저장소가 아닙니다');
  });

  it('noStagedFiles() → staged 파일 없음 메시지 + exit(1)', async () => {
    const { cliErrors } = await getHandler();

    expect(() => cliErrors.noStagedFiles()).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('staged 파일이 없습니다');
  });

  it('configCorrupted() → 설정 파일 손상 메시지 + exit(1)', async () => {
    const { cliErrors } = await getHandler();

    expect(() => cliErrors.configCorrupted()).toThrow('process.exit(1)');
    const output = errorSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('설정 파일이 손상되었습니다');
  });
});
