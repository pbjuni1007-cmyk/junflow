export interface TruncationResult {
  truncatedDiff: string;
  omittedFiles: string[];
  wasTruncated: boolean;
}

const DEFAULT_MAX_TOKENS = 8000;
const CHARS_PER_TOKEN = 4;

const LOCK_FILE_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

const GENERATED_FILE_PATTERNS = [
  /\.d\.ts$/,
  /\.map$/,
  /\.min\.js$/,
];

const BINARY_DIFF_PATTERN = /^Binary files/m;

interface FileDiff {
  header: string;
  filename: string;
  content: string;
  changedLines: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function splitIntoDiffs(diff: string): FileDiff[] {
  const parts = diff.split(/(?=^diff --git )/m).filter(Boolean);
  return parts.map((part) => {
    const headerMatch = part.match(/^diff --git a\/(.*?) b\//m);
    const filename = headerMatch ? headerMatch[1] : 'unknown';
    const changedLines = (part.match(/^[+-][^+-]/gm) ?? []).length;
    return { header: part.split('\n')[0] ?? '', filename, content: part, changedLines };
  });
}

function isLockFile(filename: string): boolean {
  return LOCK_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function isGeneratedFile(filename: string): boolean {
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function isBinaryDiff(content: string): boolean {
  return BINARY_DIFF_PATTERN.test(content);
}

export function truncateDiff(diff: string, maxTokens?: number): TruncationResult {
  const limit = maxTokens ?? DEFAULT_MAX_TOKENS;

  let files = splitIntoDiffs(diff);
  const omittedFiles: string[] = [];

  // Step 1: Always remove lock files (regardless of token limit)
  files = files.filter((f) => {
    if (isLockFile(f.filename)) {
      omittedFiles.push(f.filename);
      return false;
    }
    return true;
  });

  // Step 2: Always remove generated files
  files = files.filter((f) => {
    if (isGeneratedFile(f.filename)) {
      omittedFiles.push(f.filename);
      return false;
    }
    return true;
  });

  // Step 3: Always remove binary diffs
  files = files.filter((f) => {
    if (isBinaryDiff(f.content)) {
      omittedFiles.push(f.filename);
      return false;
    }
    return true;
  });

  const afterFilterDiff = files.map((f) => f.content).join('');

  // If nothing was omitted and within limit, return original
  if (omittedFiles.length === 0 && estimateTokens(afterFilterDiff) <= limit) {
    return { truncatedDiff: diff, omittedFiles: [], wasTruncated: false };
  }

  // If after filtering we're within limit, return filtered result
  if (estimateTokens(afterFilterDiff) <= limit) {
    const suffix = `\n[${omittedFiles.length}개 파일 생략됨]`;
    return {
      truncatedDiff: afterFilterDiff + suffix,
      omittedFiles,
      wasTruncated: true,
    };
  }

  // Step 4: Sort by changed lines descending, include top files within limit
  files.sort((a, b) => b.changedLines - a.changedLines);

  const includedFiles: FileDiff[] = [];
  let currentTokens = 0;

  for (const file of files) {
    const fileTokens = estimateTokens(file.content);
    if (currentTokens + fileTokens <= limit) {
      includedFiles.push(file);
      currentTokens += fileTokens;
    } else {
      omittedFiles.push(file.filename);
    }
  }

  const omittedCount = omittedFiles.length;
  const truncatedDiff =
    includedFiles.map((f) => f.content).join('') +
    (omittedCount > 0 ? `\n[${omittedCount}개 파일 생략됨]` : '');

  return {
    truncatedDiff,
    omittedFiles,
    wasTruncated: true,
  };
}
