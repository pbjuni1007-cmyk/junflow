import { describe, it, expect } from 'vitest';
import { truncateDiff } from '../../../src/ai/diff-truncator.js';

function makeDiff(filename: string, lines: number): string {
  const changedLines = Array.from({ length: lines }, (_, i) => `+line ${i}`).join('\n');
  return `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n${changedLines}\n`;
}

describe('truncateDiff()', () => {
  it('짧은 diff는 truncation 없이 그대로 반환한다', () => {
    const diff = makeDiff('src/index.ts', 5);
    const result = truncateDiff(diff, 8000);
    expect(result.wasTruncated).toBe(false);
    expect(result.omittedFiles).toHaveLength(0);
    expect(result.truncatedDiff).toBe(diff);
  });

  it('package-lock.json 파일을 제거한다', () => {
    const lockDiff = makeDiff('package-lock.json', 1000);
    const srcDiff = makeDiff('src/index.ts', 5);
    const combined = lockDiff + srcDiff;

    const result = truncateDiff(combined, 8000);
    expect(result.omittedFiles).toContain('package-lock.json');
    expect(result.truncatedDiff).not.toContain('package-lock.json');
  });

  it('yarn.lock 파일을 제거한다', () => {
    const lockDiff = makeDiff('yarn.lock', 500);
    const result = truncateDiff(lockDiff + makeDiff('src/a.ts', 3), 8000);
    expect(result.omittedFiles).toContain('yarn.lock');
  });

  it('pnpm-lock.yaml 파일을 제거한다', () => {
    const lockDiff = makeDiff('pnpm-lock.yaml', 500);
    const result = truncateDiff(lockDiff + makeDiff('src/a.ts', 3), 8000);
    expect(result.omittedFiles).toContain('pnpm-lock.yaml');
  });

  it('.d.ts 파일을 제거한다', () => {
    const genDiff = makeDiff('dist/types.d.ts', 200);
    const result = truncateDiff(genDiff + makeDiff('src/a.ts', 3), 8000);
    expect(result.omittedFiles).toContain('dist/types.d.ts');
  });

  it('.map 파일을 제거한다', () => {
    const mapDiff = makeDiff('dist/bundle.map', 300);
    const result = truncateDiff(mapDiff + makeDiff('src/a.ts', 3), 8000);
    expect(result.omittedFiles).toContain('dist/bundle.map');
  });

  it('.min.js 파일을 제거한다', () => {
    const minDiff = makeDiff('dist/app.min.js', 400);
    const result = truncateDiff(minDiff + makeDiff('src/a.ts', 3), 8000);
    expect(result.omittedFiles).toContain('dist/app.min.js');
  });

  it('바이너리 파일 diff를 제거한다', () => {
    const binaryDiff =
      'diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n';
    const result = truncateDiff(binaryDiff + makeDiff('src/a.ts', 3), 8000);
    expect(result.omittedFiles).toContain('image.png');
  });

  it('토큰 제한 초과 시 변경 줄 수 기준으로 상위 파일을 우선 포함한다', () => {
    // big.ts: 80줄 × ~8자 + 헤더 ~60자 ≈ 700자 = ~175 토큰
    // small.ts: 5줄 × ~8자 + 헤더 ~60자 ≈ 100자 = ~25 토큰
    // maxTokens=200 → big.ts는 포함 가능(175), small.ts 추가 시 200 초과
    const bigFile = makeDiff('big.ts', 80);    // 많은 변경
    const smallFile = makeDiff('small.ts', 5); // 적은 변경
    const combined = smallFile + bigFile;

    const result = truncateDiff(combined, 200);
    expect(result.wasTruncated).toBe(true);
    // big.ts가 더 많은 변경 → 우선 포함
    expect(result.truncatedDiff).toContain('big.ts');
    expect(result.omittedFiles).toContain('small.ts');
  });

  it('omittedFiles 배열에 생략된 파일들이 포함된다', () => {
    const lockDiff = makeDiff('package-lock.json', 1000);
    const mapDiff = makeDiff('out.map', 200);
    const srcDiff = makeDiff('src/a.ts', 3);
    const combined = lockDiff + mapDiff + srcDiff;

    const result = truncateDiff(combined, 8000);
    expect(result.omittedFiles).toContain('package-lock.json');
    expect(result.omittedFiles).toContain('out.map');
  });

  it('"[N개 파일 생략됨]" 메시지가 포함된다', () => {
    // maxTokens를 매우 작게 설정해서 강제 truncation
    const diff1 = makeDiff('a.ts', 50);
    const diff2 = makeDiff('b.ts', 50);
    const diff3 = makeDiff('c.ts', 50);
    const combined = diff1 + diff2 + diff3;

    const result = truncateDiff(combined, 20); // 매우 작은 제한
    expect(result.wasTruncated).toBe(true);
    expect(result.truncatedDiff).toMatch(/\[\d+개 파일 생략됨\]/);
  });
});
