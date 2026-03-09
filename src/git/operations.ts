import simpleGit from 'simple-git';

export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'GIT_ERROR',
  ) {
    super(message);
    this.name = 'GitError';
  }
}

function git(dir: string) {
  return simpleGit(dir);
}

export async function ensureGitRepo(dir: string): Promise<void> {
  try {
    const isRepo = await git(dir).checkIsRepo();
    if (!isRepo) {
      throw new GitError(`Not a git repository: ${dir}`, 'GIT_ERROR');
    }
  } catch (err) {
    if (err instanceof GitError) throw err;
    throw new GitError(`Not a git repository: ${dir}`, 'GIT_ERROR');
  }
}

export async function getCurrentBranch(dir: string): Promise<string> {
  try {
    const result = await git(dir).revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  } catch (err) {
    throw new GitError(
      `Failed to get current branch: ${(err as Error).message}`,
      'GIT_ERROR',
    );
  }
}

export async function getStagedDiff(dir: string): Promise<string> {
  try {
    const result = await git(dir).diff(['--staged']);
    return result;
  } catch (err) {
    throw new GitError(
      `Failed to get staged diff: ${(err as Error).message}`,
      'GIT_ERROR',
    );
  }
}

export async function createBranch(dir: string, branchName: string): Promise<void> {
  const exists = await branchExists(dir, branchName);
  if (exists) {
    throw new GitError(
      `Branch already exists: ${branchName}`,
      'GIT_ERROR',
    );
  }
  try {
    await git(dir).checkoutLocalBranch(branchName);
  } catch (err) {
    throw new GitError(
      `Failed to create branch '${branchName}': ${(err as Error).message}`,
      'GIT_ERROR',
    );
  }
}

export async function commit(dir: string, message: string): Promise<string> {
  try {
    const result = await git(dir).commit(message);
    return result.commit;
  } catch (err) {
    throw new GitError(
      `Failed to commit: ${(err as Error).message}`,
      'GIT_ERROR',
    );
  }
}

export async function getLastCommit(
  dir: string,
): Promise<{ hash: string; message: string; date: string }> {
  try {
    const log = await git(dir).log({ maxCount: 1 });
    const latest = log.latest;
    if (!latest) {
      throw new GitError('No commits found in repository', 'GIT_ERROR');
    }
    return {
      hash: latest.hash,
      message: latest.message,
      date: latest.date,
    };
  } catch (err) {
    if (err instanceof GitError) throw err;
    throw new GitError(
      `Failed to get last commit: ${(err as Error).message}`,
      'GIT_ERROR',
    );
  }
}

export async function getStatus(dir: string): Promise<{
  staged: string[];
  modified: string[];
  untracked: string[];
}> {
  try {
    const status = await git(dir).status();
    const staged = status.files
      .filter((f) => f.index !== ' ' && f.index !== '?' && f.index !== '')
      .map((f) => f.path);
    return {
      staged,
      modified: status.modified,
      untracked: status.not_added,
    };
  } catch (err) {
    throw new GitError(
      `Failed to get status: ${(err as Error).message}`,
      'GIT_ERROR',
    );
  }
}

export async function branchExists(dir: string, branchName: string): Promise<boolean> {
  try {
    const branches = await git(dir).branchLocal();
    return branches.all.includes(branchName);
  } catch (err) {
    throw new GitError(
      `Failed to check branch existence: ${(err as Error).message}`,
      'GIT_ERROR',
    );
  }
}
