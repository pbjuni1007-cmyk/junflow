import type { TeamWorkflow } from './types.js';

// 전체 개발 플로우: 이슈 분석 → 브랜치 → 코드 리뷰
export const fullDevWorkflow: TeamWorkflow = {
  name: 'full-dev',
  description: '이슈 분석부터 코드 리뷰까지 전체 개발 플로우',
  steps: [
    {
      id: 'analyze',
      agentName: 'IssueAnalyzer',
      description: '이슈 분석',
    },
    {
      id: 'branch',
      agentName: 'BranchNamer',
      description: '브랜치 생성',
      dependsOn: ['analyze'],
      inputMapping: { analysis: 'analyze.data' },
    },
    {
      id: 'review',
      agentName: 'CodeReviewer',
      description: '코드 리뷰',
      dependsOn: ['branch'],
      optional: true,
    },
  ],
};

// 빠른 커밋 플로우: 커밋 메시지 → 리뷰
export const quickCommitWorkflow: TeamWorkflow = {
  name: 'quick-commit',
  description: '커밋 메시지 생성 + 자동 코드 리뷰',
  steps: [
    {
      id: 'commit',
      agentName: 'CommitWriter',
      description: '커밋 메시지 생성',
    },
    {
      id: 'review',
      agentName: 'CodeReviewer',
      description: '코드 리뷰',
      optional: true,
    },
  ],
};

// 리뷰 강화 플로우: 보안 + 성능 + 가독성 리뷰
export const deepReviewWorkflow: TeamWorkflow = {
  name: 'deep-review',
  description: '다관점 심층 코드 리뷰',
  steps: [
    {
      id: 'security',
      agentName: 'CodeReviewer',
      description: '보안 리뷰',
      inputMapping: { focusAreas: '["security"]' },
    },
    {
      id: 'performance',
      agentName: 'CodeReviewer',
      description: '성능 리뷰',
      inputMapping: { focusAreas: '["performance"]' },
    },
    {
      id: 'readability',
      agentName: 'CodeReviewer',
      description: '가독성 리뷰',
      inputMapping: { focusAreas: '["readability"]' },
    },
  ],
};

export const PRESETS: Record<string, TeamWorkflow> = {
  'full-dev': fullDevWorkflow,
  'quick-commit': quickCommitWorkflow,
  'deep-review': deepReviewWorkflow,
};
