import { describe, it, expect } from 'vitest';
import { detectSkill, KeywordRule } from '../../../src/hooks/keyword-detector.js';

const RULES: KeywordRule[] = [
  { pattern: '커밋|commit message|커밋 메시지', skill: 'junflow-commit', priority: 10 },
  { pattern: '리뷰|review|코드 봐|코드 확인', skill: 'junflow-review', priority: 10 },
  { pattern: '시작|start|이슈 분석|브랜치', skill: 'junflow-start', priority: 10 },
  { pattern: '상태|status|현황|토큰', skill: 'junflow-status', priority: 10 },
  { pattern: '계획|plan|플랜|태스크 분해|작업 분해', skill: 'junflow-plan', priority: 10 },
  { pattern: '꼼꼼히 리뷰|deep review|심층 리뷰|제대로 봐|깊이 리뷰', skill: 'junflow-deep-review', priority: 20 },
  { pattern: '꼼꼼히 커밋|deep commit|합의 커밋|심층 커밋', skill: 'junflow-deep-commit', priority: 20 },
  { pattern: 'autopilot|오토파일럿|전체 사이클|처음부터 끝까지', skill: 'junflow-autopilot', priority: 30 },
];

describe('keyword-detector', () => {
  // --- 기본 매칭 ---
  it('커밋 관련 프롬프트를 junflow-commit으로 라우팅', () => {
    const result = detectSkill('커밋 메시지 작성해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-commit');
  });

  it('리뷰 관련 프롬프트를 junflow-review로 라우팅', () => {
    const result = detectSkill('코드 review 해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-review');
  });

  it('시작 관련 프롬프트를 junflow-start로 라우팅', () => {
    const result = detectSkill('이슈 분석 시작해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-start');
  });

  it('상태 관련 프롬프트를 junflow-status로 라우팅', () => {
    const result = detectSkill('현재 status 보여줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-status');
  });

  it('계획 관련 프롬프트를 junflow-plan으로 라우팅', () => {
    const result = detectSkill('구현 계획 세워줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-plan');
  });

  // --- priority supersession ---
  it('deep review가 일반 review보다 우선한다', () => {
    const result = detectSkill('deep review 해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-deep-review');
    expect(result!.priority).toBe(20);
  });

  it('꼼꼼히 리뷰가 일반 리뷰보다 우선한다', () => {
    const result = detectSkill('꼼꼼히 리뷰해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-deep-review');
  });

  it('deep commit이 일반 commit보다 우선한다', () => {
    const result = detectSkill('합의 커밋 해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-deep-commit');
  });

  it('autopilot이 가장 높은 우선순위를 가진다', () => {
    const result = detectSkill('autopilot으로 전체 사이클 돌려', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-autopilot');
    expect(result!.priority).toBe(30);
  });

  // --- 매칭 없음 ---
  it('관련 없는 프롬프트는 null을 반환', () => {
    const result = detectSkill('오늘 날씨 어때?', RULES);
    expect(result).toBeNull();
  });

  it('빈 프롬프트는 null을 반환', () => {
    const result = detectSkill('', RULES);
    expect(result).toBeNull();
  });

  // --- 대소문자 ---
  it('대소문자 무관하게 매칭', () => {
    const result = detectSkill('REVIEW this code', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-review');
  });

  it('Deep Review 대문자도 매칭', () => {
    const result = detectSkill('Deep Review 부탁해', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-deep-review');
  });

  // --- confidence ---
  it('여러 패턴 매칭 시 confidence가 높아진다', () => {
    const result = detectSkill('커밋 메시지 commit message 작성', RULES);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('단일 패턴 매칭 시 confidence가 낮다', () => {
    const result = detectSkill('코드 봐줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThanOrEqual(0.5);
  });

  // --- 한국어 패턴 ---
  it('태스크 분해를 plan으로 라우팅', () => {
    const result = detectSkill('이 기능을 태스크 분해 해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-plan');
  });

  it('오토파일럿을 autopilot으로 라우팅', () => {
    const result = detectSkill('오토파일럿으로 해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-autopilot');
  });

  it('처음부터 끝까지를 autopilot으로 라우팅', () => {
    const result = detectSkill('이 이슈 처음부터 끝까지 해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-autopilot');
  });

  it('심층 커밋을 deep-commit으로 라우팅', () => {
    const result = detectSkill('심층 커밋 생성해줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.skill).toBe('junflow-deep-commit');
  });

  // --- 빈 rules ---
  it('규칙이 없으면 null을 반환', () => {
    const result = detectSkill('커밋 해줘', []);
    expect(result).toBeNull();
  });

  // --- matchedPattern ---
  it('matchedPattern 필드를 반환한다', () => {
    const result = detectSkill('plan 세워줘', RULES);
    expect(result).not.toBeNull();
    expect(result!.matchedPattern).toContain('plan');
  });
});
