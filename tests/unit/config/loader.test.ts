import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// fs/promises 모킹
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// js-yaml 모킹
vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn(),
    dump: vi.fn(),
  },
}));

import fs from 'fs/promises';
import yaml from 'js-yaml';
import { loadConfig, saveConfig, ensureConfigDir } from '../../../src/config/loader.js';
import { DEFAULT_CONFIG } from '../../../src/config/defaults.js';

const mockReadFile = fs.readFile as Mock;
const mockWriteFile = fs.writeFile as Mock;
const mockMkdir = fs.mkdir as Mock;
const mockYamlLoad = yaml.load as Mock;
const mockYamlDump = yaml.dump as Mock;

const validYamlConfig = {
  ai: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
  },
  tracker: { type: 'mock' },
  git: {
    branchConvention: '{type}/{issueId}-{description}',
    commitConvention: 'conventional',
    commitLanguage: 'ko',
  },
  output: { color: true, verbose: false },
};

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['NOTION_API_KEY'];
  });

  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['NOTION_API_KEY'];
  });

  it('YAML 파일을 파싱하여 설정을 반환한다', async () => {
    mockReadFile.mockResolvedValue('yaml-content');
    mockYamlLoad.mockReturnValue(validYamlConfig);

    const config = await loadConfig();

    expect(config.ai.provider).toBe('claude');
    expect(config.tracker.type).toBe('mock');
    expect(config.git.commitLanguage).toBe('ko');
  });

  it('파일이 없으면 기본값을 반환한다', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(err);

    const config = await loadConfig();

    expect(config.ai.model).toBe(DEFAULT_CONFIG.ai.model);
    expect(config.tracker.type).toBe(DEFAULT_CONFIG.tracker.type);
    expect(config.output.color).toBe(DEFAULT_CONFIG.output.color);
  });

  it('파일 읽기 오류(ENOENT 외)는 throw한다', async () => {
    const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    mockReadFile.mockRejectedValue(err);

    await expect(loadConfig()).rejects.toThrow('Permission denied');
  });

  it('기본값과 파일 설정을 병합한다', async () => {
    mockReadFile.mockResolvedValue('yaml-content');
    mockYamlLoad.mockReturnValue({
      ai: { provider: 'claude', maxTokens: 4096 },
      tracker: { type: 'mock' },
      git: {},
      output: {},
    });

    const config = await loadConfig();

    expect(config.ai.maxTokens).toBe(4096);
    expect(config.ai.model).toBe(DEFAULT_CONFIG.ai.model);
    expect(config.git.commitConvention).toBe(DEFAULT_CONFIG.git.commitConvention);
  });

  it('ANTHROPIC_API_KEY 환경변수가 설정에 적용된다', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    mockReadFile.mockResolvedValue('yaml-content');
    mockYamlLoad.mockReturnValue(validYamlConfig);

    const config = await loadConfig();

    expect(config.ai.apiKey).toBe('sk-ant-test-key');
  });

  it('NOTION_API_KEY 환경변수가 notion 설정에 적용된다', async () => {
    process.env['NOTION_API_KEY'] = 'secret_notion_key';
    mockReadFile.mockResolvedValue('yaml-content');
    mockYamlLoad.mockReturnValue({
      ...validYamlConfig,
      tracker: {
        type: 'notion',
        notion: { databaseId: 'db-123' },
      },
    });

    const config = await loadConfig();

    expect(config.tracker.notion?.apiKey).toBe('secret_notion_key');
  });

  it('환경변수가 파일 설정보다 우선순위가 높다', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'env-key';
    mockReadFile.mockResolvedValue('yaml-content');
    mockYamlLoad.mockReturnValue({
      ...validYamlConfig,
      ai: { ...validYamlConfig.ai, apiKey: 'file-key' },
    });

    const config = await loadConfig();

    expect(config.ai.apiKey).toBe('env-key');
  });

  it('파일 없고 환경변수 있으면 기본값에 환경변수가 적용된다', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-default-env';
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(err);

    const config = await loadConfig();

    expect(config.ai.apiKey).toBe('sk-ant-default-env');
    expect(config.ai.model).toBe(DEFAULT_CONFIG.ai.model);
  });
});

describe('saveConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockYamlDump.mockReturnValue('yaml-output');
  });

  it('유효한 설정을 YAML로 저장한다', async () => {
    await saveConfig(DEFAULT_CONFIG);

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockYamlDump).toHaveBeenCalledWith(expect.objectContaining({
      ai: expect.objectContaining({ provider: 'claude' }),
    }), { indent: 2 });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('config.yaml'),
      'yaml-output',
      'utf-8',
    );
  });

  it('잘못된 설정 저장 시 throw한다', async () => {
    const invalid = { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, provider: 'invalid' as 'claude' } };
    await expect(saveConfig(invalid)).rejects.toThrow();
  });
});

describe('ensureConfigDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
  });

  it('~/.junflow 디렉토리를 생성한다', async () => {
    await ensureConfigDir();
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('.junflow'),
      { recursive: true },
    );
  });
});
