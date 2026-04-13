import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface KeywordRule {
  pattern: string;
  skill: string;
  priority: number;
}

export interface DetectionResult {
  skill: string;
  priority: number;
  confidence: number;
  matchedPattern: string;
}

/**
 * keyword-rules.json을 로드한다.
 * customPath가 주어지면 해당 경로를, 아니면 기본 keyword-rules.json을 사용.
 */
export function loadRules(customPath?: string): KeywordRule[] {
  const rulesPath = customPath ?? resolve(
    dirname(fileURLToPath(import.meta.url)),
    'keyword-rules.json',
  );

  const content = readFileSync(rulesPath, 'utf-8');
  const parsed = JSON.parse(content) as { rules: KeywordRule[] };
  return parsed.rules;
}

/**
 * 프롬프트에서 매칭되는 스킬을 감지한다.
 * priority가 높은 규칙이 낮은 규칙을 supersede한다.
 */
export function detectSkill(
  prompt: string,
  rules: KeywordRule[],
): DetectionResult | null {
  const normalized = prompt.toLowerCase().trim();
  const matches: DetectionResult[] = [];

  for (const rule of rules) {
    const patterns = rule.pattern.split('|');
    let matchCount = 0;

    for (const p of patterns) {
      if (normalized.includes(p.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const confidence = matchCount / patterns.length;
      matches.push({
        skill: rule.skill,
        priority: rule.priority,
        confidence,
        matchedPattern: rule.pattern,
      });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // priority 내림차순 → confidence 내림차순으로 정렬
  matches.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.confidence - a.confidence;
  });

  return matches[0]!;
}

/**
 * Claude Code UserPromptSubmit 훅 엔트리포인트.
 * stdin에서 프롬프트를 읽고 매칭된 스킬을 stdout으로 출력.
 */
export async function runAsHook(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString('utf-8');

  let prompt: string;
  try {
    const parsed = JSON.parse(input) as { prompt?: string; user_prompt?: string };
    prompt = parsed.prompt ?? parsed.user_prompt ?? input;
  } catch {
    prompt = input;
  }

  const rules = loadRules();
  const result = detectSkill(prompt, rules);

  if (result && result.confidence >= 0.3) {
    console.log(JSON.stringify({
      skill: result.skill,
      priority: result.priority,
      confidence: result.confidence,
    }));
  }
}

// CLI 직접 실행 시 훅 모드
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('keyword-detector.js') ||
  process.argv[1].endsWith('keyword-detector.ts')
);

if (isMainModule) {
  runAsHook().catch(console.error);
}
