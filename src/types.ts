// 공유 타입 정의 — formatters, trackers 등에서 사용

/** 코드 리뷰 결과 (Claude Code가 생성, 포맷터가 소비) */
export interface ReviewFinding {
  severity: 'critical' | 'warning' | 'suggestion' | 'praise';
  file: string;
  line?: number | null;
  message: string;
  suggestion?: string | null;
}

export interface CodeReviewResult {
  summary: string;
  findings: ReviewFinding[];
  overallScore: number;
}

/** 문서 리뷰 결과 */
export interface DocumentReviewResult {
  summary: string;
  overallScore: number;
  findings: ReviewFinding[];
  missingTopics: string[];
  keyQuestions: string[];
}

/** 트래커 에러 */
export interface TrackerError {
  code: 'TRACKER_ERROR' | 'CONFIG_ERROR' | 'NETWORK_ERROR' | 'RATE_LIMIT_ERROR' | 'AUTH_ERROR';
  message: string;
  cause?: unknown;
}
