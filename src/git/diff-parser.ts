export interface DiffFile {
  filePath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  chunks: string;
}

export interface ParsedDiff {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  summary: string;
}

export function parseDiff(rawDiff: string): ParsedDiff {
  if (!rawDiff || rawDiff.trim() === '') {
    return {
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      summary: '0 files changed',
    };
  }

  const files: DiffFile[] = [];

  // Split into per-file sections by "diff --git" header
  // Normalize line endings (CRLF -> LF, then strip stray CR)
  const normalized = rawDiff.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const fileSections = normalized.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split('\n');

    // First line: "a/path b/path"
    const headerLine = lines[0];
    const headerMatch = headerLine.match(/^a\/(.+) b\/(.+)$/);
    if (!headerMatch) continue;

    const aPath = headerMatch[1];
    const bPath = headerMatch[2];

    let status: DiffFile['status'] = 'modified';
    let filePath = bPath;

    // Detect status from extended headers
    const fullSection = lines.join('\n');
    if (/^new file mode/m.test(fullSection)) {
      status = 'added';
    } else if (/^deleted file mode/m.test(fullSection)) {
      status = 'deleted';
      filePath = aPath;
    } else if (/^similarity index/m.test(fullSection)) {
      status = 'renamed';
    }

    // Count additions and deletions from diff lines
    let additions = 0;
    let deletions = 0;
    const chunkLines: string[] = [];
    let inChunk = false;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inChunk = true;
      }
      if (inChunk) {
        chunkLines.push(line);
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
        }
      }
    }

    files.push({
      filePath,
      status,
      additions,
      deletions,
      chunks: chunkLines.join('\n'),
    });
  }

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const summary = buildSummary(files.length, totalAdditions, totalDeletions);

  return { files, totalAdditions, totalDeletions, summary };
}

function buildSummary(
  fileCount: number,
  additions: number,
  deletions: number,
): string {
  if (fileCount === 0) {
    return '0 files changed';
  }

  const filePart = `${fileCount} file${fileCount === 1 ? '' : 's'} changed`;
  const parts: string[] = [filePart];

  if (additions > 0) {
    parts.push(`${additions} insertion${additions === 1 ? '' : 's'}(+)`);
  }
  if (deletions > 0) {
    parts.push(`${deletions} deletion${deletions === 1 ? '' : 's'}(-)`);
  }

  return parts.join(', ');
}
