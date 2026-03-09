import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import simpleGit from 'simple-git';
import {
  ensureGitRepo,
  getCurrentBranch,
  createBranch,
  branchExists,
  getStagedDiff,
  commit,
  getStatus,
  getLastCommit,
  GitError,
} from '../../../src/git/operations.js';

let tmpDir: string;

async function initRepo(dir: string) {
  const sg = simpleGit(dir);
  await sg.init();
  await sg.addConfig('user.email', 'test@test.com');
  await sg.addConfig('user.name', 'Test User');
}

async function makeInitialCommit(dir: string) {
  const sg = simpleGit(dir);
  await writeFile(join(dir, 'init.txt'), 'init');
  await sg.add('init.txt');
  await sg.commit('initial commit');
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'junflow-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('ensureGitRepo', () => {
  it('git repo 아닌 디렉토리에서 에러를 던진다', async () => {
    await expect(ensureGitRepo(tmpDir)).rejects.toThrow(GitError);
  });

  it('정상 git repo에서 에러 없이 통과한다', async () => {
    await initRepo(tmpDir);
    await expect(ensureGitRepo(tmpDir)).resolves.toBeUndefined();
  });
});

describe('getCurrentBranch', () => {
  it('초기 브랜치명을 반환한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    const branch = await getCurrentBranch(tmpDir);
    expect(typeof branch).toBe('string');
    expect(branch.length).toBeGreaterThan(0);
  });
});

describe('createBranch', () => {
  it('새 브랜치를 생성하고 checkout한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    await createBranch(tmpDir, 'feature/test');
    const branch = await getCurrentBranch(tmpDir);
    expect(branch).toBe('feature/test');
  });

  it('이미 존재하는 브랜치명이면 에러를 던진다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    await createBranch(tmpDir, 'feature/test');
    // 다시 main으로 돌아가서 같은 이름으로 시도
    const sg = simpleGit(tmpDir);
    const branches = await sg.branchLocal();
    const defaultBranch = branches.all.find((b) => b !== 'feature/test') ?? 'main';
    await sg.checkout(defaultBranch);
    await expect(createBranch(tmpDir, 'feature/test')).rejects.toThrow(GitError);
  });
});

describe('branchExists', () => {
  it('존재하는 브랜치에 대해 true를 반환한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    await createBranch(tmpDir, 'feature/exists');
    const result = await branchExists(tmpDir, 'feature/exists');
    expect(result).toBe(true);
  });

  it('존재하지 않는 브랜치에 대해 false를 반환한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    const result = await branchExists(tmpDir, 'feature/does-not-exist');
    expect(result).toBe(false);
  });
});

describe('getStagedDiff', () => {
  it('staged 파일의 diff를 반환한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    await writeFile(join(tmpDir, 'newfile.ts'), 'export const x = 1;\n');
    const sg = simpleGit(tmpDir);
    await sg.add('newfile.ts');
    const diff = await getStagedDiff(tmpDir);
    expect(diff).toContain('newfile.ts');
    expect(diff.length).toBeGreaterThan(0);
  });

  it('staged 파일이 없으면 빈 문자열을 반환한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    const diff = await getStagedDiff(tmpDir);
    expect(diff).toBe('');
  });
});

describe('commit', () => {
  it('커밋을 생성하고 hash를 반환한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    await writeFile(join(tmpDir, 'file.ts'), 'export const a = 1;\n');
    const sg = simpleGit(tmpDir);
    await sg.add('file.ts');
    const hash = await commit(tmpDir, 'test commit');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe('getStatus', () => {
  it('staged/modified/untracked 파일을 분류한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);

    const sg = simpleGit(tmpDir);

    // modified 파일 (커밋 후 수정)
    await writeFile(join(tmpDir, 'modified.ts'), 'original\n');
    await sg.add('modified.ts');
    await sg.commit('add modified');
    await writeFile(join(tmpDir, 'modified.ts'), 'changed\n');

    // staged 파일 (modified commit 이후에 add)
    await writeFile(join(tmpDir, 'staged.ts'), 'staged\n');
    await sg.add('staged.ts');

    // untracked 파일
    await writeFile(join(tmpDir, 'untracked.ts'), 'untracked\n');

    const status = await getStatus(tmpDir);
    expect(status.staged).toContain('staged.ts');
    expect(status.modified).toContain('modified.ts');
    expect(status.untracked).toContain('untracked.ts');
  });
});

describe('getLastCommit', () => {
  it('마지막 커밋의 hash, message, date를 반환한다', async () => {
    await initRepo(tmpDir);
    await makeInitialCommit(tmpDir);
    const info = await getLastCommit(tmpDir);
    expect(typeof info.hash).toBe('string');
    expect(info.hash.length).toBeGreaterThan(0);
    expect(info.message).toBe('initial commit');
    expect(typeof info.date).toBe('string');
  });
});
