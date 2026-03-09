import { readFile } from 'fs/promises';
import { join } from 'path';
import { parseDiff } from '../../../src/git/diff-parser.js';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures');

describe('parseDiff', () => {
  it('빈 diff를 처리한다', () => {
    const result = parseDiff('');
    expect(result.files).toHaveLength(0);
    expect(result.totalAdditions).toBe(0);
    expect(result.totalDeletions).toBe(0);
    expect(result.summary).toBe('0 files changed');
  });

  it('단일 파일 수정 diff를 파싱한다', () => {
    const raw = `diff --git a/src/hello.ts b/src/hello.ts
index 1234567..abcdefg 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,5 +1,8 @@
 export function hello() {
-  return 'hello';
+  return 'hello world';
+}
+
+export function greet(name: string) {
+  return \`Hello, \${name}!\`;
 }
`;
    const result = parseDiff(raw);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].filePath).toBe('src/hello.ts');
    expect(result.files[0].status).toBe('modified');
    expect(result.files[0].additions).toBe(5);
    expect(result.files[0].deletions).toBe(1);
  });

  it('여러 파일 diff를 파싱한다 (added, modified, deleted)', async () => {
    const raw = await readFile(join(fixturesDir, 'sample-diff.txt'), 'utf-8');
    const result = parseDiff(raw);

    expect(result.files).toHaveLength(3);

    const modified = result.files.find((f) => f.filePath === 'src/hello.ts');
    expect(modified?.status).toBe('modified');

    const added = result.files.find((f) => f.filePath === 'src/new-file.ts');
    expect(added?.status).toBe('added');

    const deleted = result.files.find((f) => f.filePath === 'src/old-file.ts');
    expect(deleted?.status).toBe('deleted');
  });

  it('additions/deletions 카운트가 정확하다', async () => {
    const raw = await readFile(join(fixturesDir, 'sample-diff.txt'), 'utf-8');
    const result = parseDiff(raw);

    // hello.ts: +5, -1 / new-file.ts: +3, -0 / old-file.ts: +0, -4
    expect(result.totalAdditions).toBe(8);
    expect(result.totalDeletions).toBe(5);
  });

  it('요약 문자열이 정확하다', async () => {
    const raw = await readFile(join(fixturesDir, 'sample-diff.txt'), 'utf-8');
    const result = parseDiff(raw);
    expect(result.summary).toBe('3 files changed, 8 insertions(+), 5 deletions(-)');
  });

  it('chunks에 실제 diff 내용이 포함된다', () => {
    const raw = `diff --git a/src/a.ts b/src/a.ts
index 0000000..1111111 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
 const z = 3;
`;
    const result = parseDiff(raw);
    expect(result.files[0].chunks).toContain('@@');
    expect(result.files[0].chunks).toContain('+const y = 2;');
  });
});
