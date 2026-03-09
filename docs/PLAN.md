# JunFlow CLI - AI 기반 개발 워크플로우 자동화 도구

**생성일:** 2026-03-08
**2차 개정일:** 2026-03-09
**상태:** 확정 대기
**프로젝트 경로:** `~/projects/junflow`

---

## 1. RALPLAN-DR

### Principles (핵심 원칙)

1. **단순함 우선 (Simplicity First)**: 과도한 추상화를 피하고, 직관적인 코드 구조를 유지한다. 포트폴리오에서 "읽기 쉬운 코드"가 "똑똑한 코드"보다 강력하다.
2. **에이전트 합성 가능성 (Agent Composability)**: 각 에이전트는 독립적으로 테스트 가능하고, 명령어 핸들러에서 직접 순차 조합 가능해야 한다. [개정 2차] 제네릭 파이프라인 프레임워크 없이 직접 호출 방식 채택.
3. **설정보다 관례 (Convention over Configuration)**: 기본값이 합리적이어야 하며, 설정 없이도 즉시 사용 가능해야 한다.
4. **점진적 확장 (Incremental Extension)**: Notion 단일 연동으로 시작하되, Jira/GitHub Issues 등 추가 트래커를 플러그인 패턴으로 확장 가능하게 설계한다.
5. **실제 사용 가능한 도구 (Dogfooding)**: Jun님 본인이 실제 개발 워크플로우에서 사용할 수 있는 수준의 완성도를 목표로 한다.

### Decision Drivers (결정 동인)

1. **포트폴리오 임팩트**: SI 백엔드/DevOps 타겟 면접에서 "직접 만들어 쓰는 CLI 도구"로 어필 가능해야 함
2. **2주 내 MVP 완성**: 핵심 기능(이슈 분석 -> 브랜치 생성 -> 커밋 메시지 생성)이 동작하는 데모 가능한 상태
3. **기술 깊이 증명**: TypeScript 타입 시스템, 에이전트 패턴, 테스트 전략 등 설계 역량을 보여줄 수 있어야 함

### Viable Options 분석

#### Option A: Monolithic CLI (선택됨)
- 단일 패키지, commander 기반, 에이전트는 함수 모듈로 분리
- **장점**: 빠른 개발, 간단한 배포(`npm link` 즉시 사용), 디버깅 용이
- **단점**: 규모 커지면 모듈 간 결합도 증가 가능
- **적합성**: 2주 MVP에 최적

#### Option B: 모노레포 멀티패키지 (기각)
- `@junflow/core`, `@junflow/cli`, `@junflow/agents` 등 분리
- **장점**: 관심사 분리 명확, 라이브러리 재사용 가능
- **단점**: 초기 설정 오버헤드 큼 (turborepo/nx 설정), 2주 내 MVP 달성 어려움
- **기각 사유**: MVP 단계에서 과도한 구조. 추후 성장 시 마이그레이션 가능

#### Option C: Plugin-based Architecture (기각)
- oclif 스타일의 플러그인 시스템
- **장점**: 확장성 극대화, 서드파티 기여 가능
- **단점**: 보일러플레이트 과다, 학습 곡선, 1인 프로젝트에 과잉 설계
- **기각 사유**: 사용자가 Jun님 본인뿐인 단계에서 불필요한 복잡성

### ADR (Architecture Decision Record)

| 항목 | 내용 |
|------|------|
| **Decision** | Monolithic CLI + 함수형 에이전트 패턴 |
| **Drivers** | 2주 MVP, 포트폴리오 가독성, 실사용 가능성 |
| **Alternatives** | 모노레포(과잉), 플러그인(과잉) |
| **Why Chosen** | 최소 구조로 핵심 가치(AI 에이전트 조합) 증명 가능 |
| **Consequences** | 규모 성장 시 모듈 분리 리팩토링 필요 |
| **Follow-ups** | v2에서 tracker 플러그인 인터페이스 분리 검토 |

### [개정 2차] ADR #2: Pipeline 제거, 직접 호출 방식 채택

| 항목 | 내용 |
|------|------|
| **Decision** | PipelineStep/Pipeline 제네릭 프레임워크 제거, 명령어 핸들러에서 에이전트 직접 순차 호출 |
| **Drivers** | YAGNI -- 에이전트 4개, 파이프라인 사용처 1곳(start)뿐 |
| **Alternatives** | 제네릭 Pipeline<TIn, TOut> 프레임워크 (1차 Plan) |
| **Why Chosen** | 제네릭 파이프라인은 추상화 비용(타입 복잡도, 디버깅 어려움)이 실익(재사용)보다 큼. start 핸들러에서 `analyzeIssue() -> nameBranch() -> createBranch()` 직접 호출이 더 읽기 쉽고, 에러 처리도 명시적 |
| **Consequences** | 에이전트 조합 패턴이 3개 이상 명령어에서 반복되면 공통 유틸 추출 검토 필요 |
| **Follow-ups** | v2에서 에이전트 조합이 복잡해질 경우 경량 파이프라인 재도입 검토 |

---

## 2. 프로젝트 디렉토리 구조

[개정 2차] `pipeline.ts` 제거, `tests/integration/pipeline.test.ts` -> `start-flow.test.ts`로 변경

```
junflow/
├── src/
│   ├── cli/                      # CLI 진입점 및 명령어 정의
│   │   ├── index.ts              # 메인 엔트리 (#!/usr/bin/env node)
│   │   ├── commands/
│   │   │   ├── init.ts           # junflow init
│   │   │   ├── start.ts          # junflow start <issue-id>
│   │   │   ├── commit.ts         # junflow commit
│   │   │   ├── review.ts         # junflow review
│   │   │   ├── status.ts         # junflow status
│   │   │   └── config.ts         # junflow config
│   │   └── utils/
│   │       ├── logger.ts         # 컬러 로깅 (chalk)
│   │       ├── spinner.ts        # 진행 표시 (ora)
│   │       └── prompt.ts         # 대화형 입력 (inquirer)
│   │
│   ├── agents/                   # AI 에이전트 모듈
│   │   ├── types.ts              # 에이전트 공통 타입/인터페이스
│   │   ├── base-agent.ts         # 추상 베이스 에이전트
│   │   ├── issue-analyzer.ts     # 이슈 분석 에이전트
│   │   ├── branch-namer.ts       # 브랜치 네이밍 에이전트
│   │   ├── commit-writer.ts      # 커밋 메시지 생성 에이전트
│   │   └── code-reviewer.ts      # 코드 리뷰 에이전트
│   │
│   ├── trackers/                 # 이슈 트래커 어댑터
│   │   ├── types.ts              # 트래커 공통 인터페이스
│   │   ├── notion.ts             # Notion API 어댑터
│   │   └── mock.ts               # 테스트용 목 트래커
│   │
│   ├── git/                      # Git 연동
│   │   ├── operations.ts         # git 명령 래퍼 (simple-git)
│   │   └── diff-parser.ts        # diff 분석 유틸
│   │
│   ├── ai/                       # AI 프로바이더
│   │   ├── types.ts              # AI 호출 공통 인터페이스
│   │   ├── claude.ts             # Anthropic SDK 래퍼
│   │   ├── response-parser.ts    # [개정 2차] AI 응답 파싱 + 재시도 로직
│   │   └── prompts/              # 프롬프트 템플릿
│   │       ├── issue-analysis.ts
│   │       ├── branch-naming.ts
│   │       ├── commit-message.ts
│   │       └── code-review.ts
│   │
│   └── config/                   # 설정 관리
│       ├── schema.ts             # 설정 스키마 (zod)
│       ├── loader.ts             # YAML 로드/저장
│       └── defaults.ts           # 기본값 정의
│
├── tests/
│   ├── unit/
│   │   ├── agents/               # 에이전트 단위 테스트
│   │   ├── trackers/             # 트래커 어댑터 테스트
│   │   ├── git/                  # git 유틸 테스트
│   │   ├── ai/                   # [개정 2차] 응답 파싱 테스트
│   │   └── config/               # 설정 로더 테스트
│   ├── integration/
│   │   ├── start-flow.test.ts    # [개정 2차] start 명령어 전체 흐름 통합 (pipeline.test.ts에서 변경)
│   │   └── cli.test.ts           # CLI 명령어 E2E
│   └── fixtures/                 # 테스트 픽스처
│       ├── sample-diff.txt
│       ├── sample-issue.json
│       ├── notion-db-schema.json # [개정 2차] Notion DB 스키마 스냅샷
│       └── sample-config.yaml
│
├── package.json
├── tsconfig.json
├── tsup.config.ts                # 번들러 설정
├── vitest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── LICENSE
└── README.md
```

---

## 3. 에이전트 인터페이스 설계

### 3.1 핵심 타입 (`src/agents/types.ts`)

```typescript
// --- 에이전트 컨텍스트: 모든 에이전트가 공유하는 실행 환경 ---
export interface AgentContext {
  workingDir: string;
  config: JunFlowConfig;
  logger: Logger;
}

// --- 에이전트 결과: 성공/실패를 명시적으로 표현 ---
export type AgentResult<T> =
  | { success: true; data: T; metadata: AgentMetadata }
  | { success: false; error: AgentError; metadata: AgentMetadata };

export interface AgentMetadata {
  agentName: string;
  durationMs: number;
  tokensUsed?: number;
}

export interface AgentError {
  code: 'AI_ERROR' | 'AI_PARSE_ERROR' | 'TRACKER_ERROR' | 'GIT_ERROR' | 'VALIDATION_ERROR' | 'CONFIG_ERROR' | 'NETWORK_ERROR';
  // [개정 2차] AI_PARSE_ERROR, NETWORK_ERROR 코드 추가
  message: string;
  cause?: unknown;
}

// --- 에이전트 인터페이스: 모든 에이전트가 구현하는 계약 ---
export interface Agent<TInput, TOutput> {
  name: string;
  description: string;
  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}
```

### 3.2 개별 에이전트 입출력 타입

```typescript
// --- Issue Analyzer ---
export interface IssueAnalyzerInput {
  issueId: string;
  trackerType: 'notion' | 'mock';
}

export interface IssueAnalysis {
  title: string;
  summary: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'chore' | 'docs';
  complexity: 'low' | 'medium' | 'high';
  keyRequirements: string[];
  suggestedApproach: string;
}

// --- Branch Namer ---
export interface BranchNamerInput {
  analysis: IssueAnalysis;
  issueId: string;
  convention?: string; // e.g., 'type/issue-id/description'
}

export interface BranchNameResult {
  branchName: string;
  alternatives: string[]; // 2-3개 대안 제시
}

// --- Commit Writer ---
export interface CommitWriterInput {
  diff: string;
  issueAnalysis?: IssueAnalysis;
  convention?: 'conventional' | 'gitmoji';
  language?: 'ko' | 'en';
}

export interface CommitMessageResult {
  message: string;
  alternatives: string[];
  scope?: string;
  breakingChange: boolean;
}

// --- Code Reviewer ---
export interface CodeReviewerInput {
  diff: string;
  issueAnalysis?: IssueAnalysis;
  focusAreas?: ('security' | 'performance' | 'readability' | 'testing')[];
}

export interface CodeReviewResult {
  summary: string;
  findings: ReviewFinding[];
  overallScore: number; // 1-10
}

export interface ReviewFinding {
  severity: 'critical' | 'warning' | 'suggestion' | 'praise';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}
```

### 3.3 [개정 2차] 에이전트 직접 호출 패턴 (pipeline.ts 제거)

> **변경 사유**: Agent 4개, 파이프라인 사용처 1곳(start)뿐이므로 제네릭 PipelineStep/Pipeline은 YAGNI. 명령어 핸들러에서 직접 순차 호출하는 것이 더 명시적이고 디버깅이 용이함.

```typescript
// src/cli/commands/start.ts 내부에서 직접 호출
// (별도 pipeline.ts 파일 없음)

export async function handleStart(issueId: string, options: StartOptions, context: AgentContext) {
  // 1. 이슈 분석
  const analysisResult = await issueAnalyzer.execute({ issueId, trackerType: context.config.tracker.type }, context);
  if (!analysisResult.success) {
    return handleError(analysisResult.error);
  }

  // 2. 브랜치 네이밍
  const branchResult = await branchNamer.execute({
    analysis: analysisResult.data,
    issueId,
    convention: context.config.git.branchConvention,
  }, context);
  if (!branchResult.success) {
    return handleError(branchResult.error);
  }

  // 3. 브랜치 생성 (--no-branch가 아닌 경우)
  if (!options.noBranch && !options.dryRun) {
    await gitOps.createBranch(branchResult.data.branchName);
  }

  // 4. 컨텍스트 저장
  await saveCurrentIssue(analysisResult.data, branchResult.data);
}
```

### 3.4 트래커 인터페이스 (`src/trackers/types.ts`)

[개정 2차] TrackerIssue 인터페이스는 Task 0 (Notion DB 스키마 확인) 완료 후 최종 확정. 아래는 초안이며, 실제 Notion DB 속성에 맞춰 필드를 조정한다.

```typescript
export interface TrackerIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  labels: string[];
  assignee?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  url?: string;
  raw: Record<string, unknown>; // 원본 데이터 보존
  // [개정 2차] Task 0 완료 후 Notion DB 스키마에 맞춰 추가 필드 확정
  // 예: dueDate?, category?, customFields?
}

export interface IssueTracker {
  name: string;
  getIssue(issueId: string): Promise<TrackerIssue>;
  updateIssueStatus?(issueId: string, status: string): Promise<void>;
  listIssues?(filter?: Record<string, unknown>): Promise<TrackerIssue[]>;
}
```

### 3.5 AI 프로바이더 인터페이스 (`src/ai/types.ts`)

```typescript
export interface AIProvider {
  name: string;
  complete(request: AIRequest): Promise<AIResponse>;
}

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
}
```

### 3.6 설정 스키마 (`src/config/schema.ts`)

```typescript
// zod 스키마로 런타임 검증
export interface JunFlowConfig {
  ai: {
    provider: 'claude';
    model: string;           // default: 'claude-sonnet-4-20250514'
    apiKey?: string;          // 환경변수 ANTHROPIC_API_KEY 우선
    maxTokens: number;        // default: 2048
    // [개정 3차] 에이전트별 모델 오버라이드 (OMC 티어 라우팅 참고)
    agentModels?: {
      issueAnalyzer?: string;   // default: ai.model (복잡한 분석 → opus 추천)
      branchNamer?: string;     // default: ai.model (간단 → haiku로 비용 절감 가능)
      commitWriter?: string;    // default: ai.model
      codeReviewer?: string;    // default: ai.model (심층 리뷰 → opus 추천)
    };
  };
  tracker: {
    type: 'notion' | 'mock';
    notion?: {
      apiKey?: string;        // 환경변수 NOTION_API_KEY 우선
      databaseId: string;
    };
  };
  git: {
    branchConvention: string;  // default: '{type}/{issueId}-{description}'
    commitConvention: 'conventional' | 'gitmoji'; // default: 'conventional'
    commitLanguage: 'ko' | 'en'; // default: 'ko'
  };
  output: {
    color: boolean;            // default: true
    verbose: boolean;          // default: false
  };
}
```

---

## 4. 명령어 체계 상세

### 4.1 `junflow init`
```
설명: 프로젝트 초기 설정 (대화형 위저드)
동작:
  1. ~/.junflow/ 디렉토리 생성
  2. ANTHROPIC_API_KEY 확인 (환경변수 또는 직접 입력)
  3. 트래커 선택 (Notion / Mock)
  4. Notion 선택 시 API Key + Database ID 입력
  5. Git 컨벤션 설정 (기본값 제시)
  6. ~/.junflow/config.yaml 생성
출력: "JunFlow initialized successfully!" + 설정 요약
```

### 4.2 `junflow start <issue-id>`
```
설명: 이슈 기반 개발 시작 (핵심 명령어)
옵션:
  --tracker, -t   트래커 타입 오버라이드 (default: config)
  --no-branch     브랜치 생성 건너뛰기
  --dry-run       실제 실행 없이 결과만 표시

동작 (에이전트 직접 순차 호출): [개정 2차]
  1. [IssueAnalyzer] 트래커에서 이슈 조회 + AI 분석
     -> IssueAnalysis 출력 (타입, 복잡도, 요구사항, 접근방법)
  2. [BranchNamer] 분석 결과 기반 브랜치명 생성
     -> 3개 후보 제시, 사용자 선택 또는 자동 선택
  3. git checkout -b <selected-branch>
  4. 분석 결과를 .junflow/current-issue.json 에 저장 (이후 commit에서 활용)

출력 예시:
  ┌─ Issue Analysis ─────────────────────────────┐
  │ Title: 사용자 프로필 페이지 구현              │
  │ Type: feature | Complexity: medium            │
  │ Requirements:                                 │
  │   - 프로필 조회 API 연동                      │
  │   - 프로필 이미지 업로드                      │
  │   - 반응형 레이아웃                           │
  │ Suggested Approach:                           │
  │   컴포넌트 분리 후 API 훅부터 구현 권장       │
  ├─ Branch ─────────────────────────────────────┤
  │ > feature/PROJ-42-user-profile-page           │
  │   feature/PROJ-42-implement-profile           │
  │   feat/PROJ-42-profile                        │
  └──────────────────────────────────────────────┘
```

### 4.3 `junflow commit`
```
설명: staged 변경사항 기반 AI 커밋 메시지 생성
옵션:
  --all, -a       모든 변경사항 stage 후 커밋
  --lang, -l      커밋 언어 오버라이드 (ko/en)
  --convention    커밋 컨벤션 오버라이드
  --auto          대화형 선택 없이 첫 번째 추천 자동 사용
  --dry-run       메시지만 출력, 커밋하지 않음

동작:
  1. git diff --staged 로 변경사항 수집
  2. .junflow/current-issue.json 있으면 이슈 컨텍스트 포함
  3. [CommitWriter] AI가 diff + 컨텍스트 분석 -> 커밋 메시지 3개 후보 생성
  4. 사용자가 선택 또는 수정
  5. git commit -m "<selected-message>" 실행

출력 예시:
  ┌─ Commit Message Suggestions ──────────────────┐
  │ 1. feat(profile): 사용자 프로필 조회 API 연동 │
  │ 2. feat: 프로필 페이지 컴포넌트 및 API 구현   │
  │ 3. feat(user): add profile page with API hook  │
  ├──────────────────────────────────────────────── │
  │ [1-3] 선택 / [e] 직접 수정 / [q] 취소         │
  └──────────────────────────────────────────────── ┘
```

### 4.4 `junflow review`
```
설명: 현재 변경사항에 대한 AI 코드 리뷰
옵션:
  --staged        staged 변경만 리뷰 (default: all changes)
  --focus, -f     집중 영역 (security, performance, readability, testing)
  --base, -b      비교 대상 브랜치 (default: main)

동작:
  1. git diff <base>..HEAD 수집
  2. [CodeReviewer] AI가 diff 분석
  3. 결과를 severity별로 정렬하여 출력

출력 예시:
  ┌─ Code Review (Score: 7/10) ──────────────────┐
  │ CRITICAL (1)                                  │
  │   src/api/profile.ts:23                       │
  │   SQL injection 가능성 - parameterized query  │
  │   사용 권장                                   │
  │                                               │
  │ WARNING (2)                                   │
  │   src/components/Profile.tsx:45               │
  │   useEffect 의존성 배열 누락                  │
  │                                               │
  │ SUGGESTION (3)                                │
  │   ...                                         │
  │                                               │
  │ PRAISE (1)                                    │
  │   에러 핸들링이 잘 구성되어 있음              │
  └──────────────────────────────────────────────┘
```

### 4.5 `junflow status`
```
설명: 현재 작업 상태 표시
동작:
  1. 현재 브랜치 정보
  2. .junflow/current-issue.json 에서 활성 이슈 표시
  3. git status 요약 (staged, modified, untracked 개수)
  4. 마지막 커밋 정보
  5. [개정 3차] 세션 토큰 사용량 & 예상 비용 요약 (TFX 비용 리포팅 참고)

출력 예시:
  ┌─ Session Token Usage ──────────────────────────┐
  │ Agent           │ Calls │ Tokens  │ Est. Cost  │
  │ IssueAnalyzer   │   1   │  2,340  │   $0.007   │
  │ CommitWriter    │   3   │  5,120  │   $0.015   │
  │ CodeReviewer    │   1   │  8,900  │   $0.027   │
  ├─────────────────┼───────┼─────────┼────────────┤
  │ Total           │   5   │ 16,360  │   $0.049   │
  └────────────────────────────────────────────────┘
```

### 4.6 `junflow config`
```
설명: 설정 관리
하위 명령:
  junflow config show          현재 설정 표시
  junflow config set <key> <value>  설정 값 변경
  junflow config reset         기본값으로 초기화
  junflow config path          설정 파일 경로 표시
```

---

## 5. [개정 2차] 프롬프트 전략

> **추가 사유 (Critical 2)**: CommitWriter/CodeReviewer의 품질이 프롬프트에 전적으로 의존하는데, 출력 포맷 강제, diff 크기 제한, 파싱 실패 처리 등 전략이 없었음.

### 5.1 출력 포맷 강제

각 에이전트의 system prompt에 JSON schema를 명시하여 구조화된 출력을 강제한다.

```typescript
// src/ai/prompts/commit-message.ts 예시
export const COMMIT_WRITER_SYSTEM = `
You are a commit message generator. You MUST respond with ONLY valid JSON matching this schema:
{
  "message": "string - conventional commit format",
  "alternatives": ["string", "string"],
  "scope": "string or null",
  "breakingChange": false
}
Do NOT include any text outside the JSON object.
`;
```

**에이전트별 전략:**
| 에이전트 | 출력 포맷 | 강제 방법 |
|---------|----------|----------|
| IssueAnalyzer | JSON (IssueAnalysis) | system prompt에 schema 명시 + "respond with ONLY valid JSON" |
| BranchNamer | JSON (BranchNameResult) | 동일 |
| CommitWriter | JSON (CommitMessageResult) | 동일 |
| CodeReviewer | JSON (CodeReviewResult) | 동일 |

### 5.2 Diff 크기 제한 전략

Claude의 입력 토큰 제한(약 200K)과 비용을 고려한 diff 전처리:

1. **토큰 추정**: diff 문자열 길이 / 4 로 대략적 토큰 수 추정
2. **제한 기준**: diff가 8,000 토큰(약 32,000자) 초과 시 truncation 적용
3. **Truncation 우선순위**:
   - lock 파일 (package-lock.json, yarn.lock 등) 제거
   - 생성된 파일 (.d.ts, .map 등) 제거
   - 바이너리 파일 diff 제거
   - 나머지 파일은 변경 줄 수 기준 내림차순 정렬, 상위 파일 우선 포함
   - 제한 초과 시 하위 파일 제거 + "[N개 파일 생략됨]" 메시지 추가
4. **사용자 알림**: truncation 발생 시 CLI에 경고 메시지 표시

```typescript
// src/ai/diff-truncator.ts
export function truncateDiff(diff: string, maxTokens: number = 8000): {
  truncatedDiff: string;
  omittedFiles: string[];
  wasTrancated: boolean;
}
```

### 5.3 AI 응답 파싱 및 재시도 전략

`src/ai/response-parser.ts`에서 통합 관리:

```typescript
export async function parseAIResponse<T>(
  response: string,
  schema: ZodSchema<T>,
  options?: { maxRetries?: number; aiProvider?: AIProvider; originalRequest?: AIRequest }
): Promise<T>
```

**파싱 실패 처리 흐름:**
1. JSON.parse 시도
2. 실패 시: 응답에서 ```json ... ``` 코드 블록 추출 후 재시도
3. 여전히 실패 시: AI에게 "이전 응답이 유효한 JSON이 아닙니다. JSON만 반환해주세요" 재요청 (최대 1회 재시도)
4. 재시도도 실패 시: `AI_PARSE_ERROR` 코드로 AgentError 반환
5. JSON 파싱 성공 후 zod schema 검증 -- 실패 시 동일한 재시도 흐름

**재시도 정책:**
- 네트워크 에러 (timeout, connection refused): 최대 2회, exponential backoff (1s, 3s)
- AI 파싱 에러: 최대 1회, 수정된 프롬프트로 재요청
- Notion API 에러: 최대 1회, rate limit 시 Retry-After 헤더 존중
- 기타 에러: 재시도 없음, 즉시 에러 반환

### 5.4 프롬프트 반복 개선 일정

프롬프트 품질은 반복 테스트를 통해서만 개선 가능하므로, Task 2.2/2.3/2.4 각각에 프롬프트 튜닝 시간을 반영:
- 각 에이전트 구현 시 기본 프롬프트 작성 (포함됨)
- Task 2.5에서 실제 데이터로 프롬프트 품질 검증 + 개선 (1-2시간 추가)

---

## 6. 태스크 분할

### [개정 2차] Week 1: DB 매핑 확정 + 기반 구축

#### Task 0: Notion DB 스키마 확인 및 필드 매핑 확정 [개정 2차 추가]
**예상 소요:** 1-2시간
**선행 조건:** 없음 (Week 1 최선두 태스크)

> **추가 사유 (Critical 1)**: Notion DB 속성 매핑이 전체 설계의 핵심 복잡도인데, 미해결 상태에서 TrackerIssue 인터페이스를 확정할 수 없음.

- [ ] Jun님의 이슈 트래커용 Notion DB 선정 (기존 경험정리 DB `311739cc-9a3f-8140-a758-e4c8c7145b49` 활용 또는 신규 생성)
- [ ] Notion API (`mcp__notion-personal__`)로 선정된 DB의 속성(properties) 스키마 조회
- [ ] DB 속성 -> TrackerIssue 필드 매핑 테이블 작성:
  - 어떤 Notion 속성이 title, status, priority, labels, assignee에 매핑되는지
  - 매핑 불가 속성은 `raw` 필드로 보존
  - Notion 속성 타입별 변환 로직 정의 (select -> string, multi_select -> string[], rich_text -> string 등)
- [ ] TrackerIssue 인터페이스 최종 확정
- [ ] `tests/fixtures/notion-db-schema.json`에 실제 DB 스키마 스냅샷 저장

**수락 기준:**
- Notion DB 속성 -> TrackerIssue 필드 매핑 테이블이 문서화되어 있다
- TrackerIssue 인터페이스가 실제 DB 구조를 정확히 반영한다
- fixture에 DB 스키마 스냅샷이 저장되어 이후 테스트에 활용 가능하다
- 매핑 불가능한 속성에 대한 처리 방침이 결정되어 있다

---

#### Task 1.1: 프로젝트 초기화 및 개발 환경 구성
**예상 소요:** 2-3시간

- [ ] `npm init` + TypeScript + ESLint + Prettier 설정
- [ ] tsup (번들러) + vitest (테스트) 설정
- [ ] package.json `bin` 필드 설정 (`junflow` 명령어)
- [ ] commander 기본 CLI 스캐폴딩 (help, version)
- [ ] chalk + ora + inquirer 의존성 설치
- [ ] `npm link`로 로컬 CLI 실행 확인

**수락 기준:**
- `junflow --help`가 명령어 목록을 출력한다
- `junflow --version`이 package.json 버전을 출력한다
- `npm test`가 vitest를 실행한다 (빈 테스트 1개 통과)
- ESLint + Prettier가 동작한다

#### Task 1.2: 설정 시스템 구현
**예상 소요:** 3-4시간

- [ ] zod 스키마 정의 (`src/config/schema.ts`)
- [ ] YAML 로더/세이버 구현 (`js-yaml` 사용)
- [ ] 기본값 정의 + 환경변수 오버라이드 로직
- [ ] `junflow init` 대화형 위저드 구현
- [ ] `junflow config show/set/reset/path` 구현
- [ ] 단위 테스트: 스키마 검증, 기본값 병합, YAML 파싱

**수락 기준:**
- `junflow init`이 대화형으로 `~/.junflow/config.yaml` 생성한다
- `junflow config show`가 현재 설정을 보여준다
- 잘못된 설정값에 대해 zod 에러 메시지가 출력된다
- 환경변수 `ANTHROPIC_API_KEY`가 config 파일보다 우선한다

#### Task 1.3: AI 프로바이더 + 에이전트 프레임워크
**예상 소요:** 4-5시간

[개정 2차] 파이프라인 오케스트레이터 제거, 응답 파싱/재시도 모듈 추가

- [ ] AI 프로바이더 인터페이스 + Claude 구현체 (`@anthropic-ai/sdk`)
- [ ] 에이전트 베이스 클래스 (로깅, 타이밍, 에러 핸들링 공통화)
- [ ] AgentResult 타입 + 유틸 함수 (succeed, fail)
- [ ] 프롬프트 템플릿 시스템 (문자열 보간 기반, 템플릿 리터럴)
- [ ] [개정 2차] AI 응답 파서 (`src/ai/response-parser.ts`): JSON 파싱 + zod 검증 + 재시도 로직
- [ ] [개정 2차] diff truncation 유틸 (`src/ai/diff-truncator.ts`)
- [ ] 단위 테스트: mock AI 프로바이더로 에이전트 실행/실패 테스트 + 응답 파싱 실패/재시도 테스트

**수락 기준:**
- mock AI로 에이전트가 실행되고 AgentResult를 반환한다
- 에이전트 실패 시 AgentResult.success === false + 에러 코드 반환
- [개정 2차] 잘못된 JSON 응답에 대해 재시도 후 AI_PARSE_ERROR를 반환한다
- [개정 2차] 큰 diff가 지정된 토큰 제한 내로 truncation된다
- 실행 시간(durationMs)이 메타데이터에 기록된다

#### Task 1.4: Git 연동 모듈
**예상 소요:** 2-3시간

- [ ] simple-git 래퍼 구현 (getCurrentBranch, getStagedDiff, createBranch, commit)
- [ ] diff-parser: staged diff를 구조화된 데이터로 변환
- [ ] 단위 테스트: 임시 git 저장소에서 각 연산 검증

**수락 기준:**
- 테스트용 임시 git repo에서 브랜치 생성/전환이 동작한다
- staged diff가 파일별로 파싱된다
- git 저장소가 아닌 디렉토리에서 명확한 에러를 던진다

---

### Week 2: 핵심 명령어 + 트래커 연동

#### Task 2.1: Notion 트래커 어댑터
**예상 소요:** 3-4시간
**선행 조건:** Task 0 완료 (필드 매핑 확정 상태)

- [ ] `@notionhq/client` 기반 Notion API 어댑터 구현
- [ ] [개정 2차] Task 0에서 확정된 매핑 테이블 기반 Notion 페이지 -> TrackerIssue 변환 로직
- [ ] Mock 트래커 구현 (테스트/데모용, JSON 파일 기반)
- [ ] 단위 테스트: mock 응답으로 변환 로직 검증 (notion-db-schema.json fixture 활용)

**수락 기준:**
- Notion 데이터베이스에서 이슈를 조회하여 TrackerIssue로 반환한다
- [개정 2차] 변환 로직이 Task 0의 매핑 테이블과 일치한다
- Mock 트래커가 fixtures/sample-issue.json을 반환한다
- Notion API 키 없을 때 명확한 에러 메시지를 표시한다

#### Task 2.2: `junflow start` 구현
**예상 소요:** 4-5시간

[개정 2차] 파이프라인 대신 직접 순차 호출 방식으로 구현

- [ ] IssueAnalyzer 에이전트 구현 + 프롬프트 작성 (JSON schema 명시)
- [ ] BranchNamer 에이전트 구현 + 프롬프트 작성 (JSON schema 명시)
- [ ] [개정 2차] start 명령어 핸들러: 에이전트 직접 순차 호출 (분석 -> 네이밍 -> 브랜치 생성)
- [ ] 대화형 브랜치 선택 UI (inquirer)
- [ ] .junflow/current-issue.json 저장 로직
- [ ] --dry-run, --no-branch 옵션 처리
- [ ] [개정 2차] 통합 테스트: `tests/integration/start-flow.test.ts` -- mock 트래커 + mock AI로 전체 플로우 검증

**수락 기준:**
- `junflow start ISSUE-1` (mock)이 이슈 분석 -> 브랜치 생성까지 완료한다
- --dry-run 시 git 변경 없이 분석 결과만 출력한다
- .junflow/current-issue.json에 분석 결과가 저장된다
- 이미 같은 이름의 브랜치가 있으면 경고한다

#### Task 2.3: `junflow commit` 구현
**예상 소요:** 3-4시간

- [ ] CommitWriter 에이전트 구현 + 프롬프트 작성 (JSON schema 명시)
- [ ] commit 명령어: diff 수집 -> [개정 2차] diff truncation -> AI 분석 -> 메시지 생성 -> 선택 -> 커밋
- [ ] current-issue.json 컨텍스트 활용
- [ ] --auto, --lang, --dry-run 옵션 처리
- [ ] 통합 테스트: 임시 repo에서 실제 커밋 생성 검증

**수락 기준:**
- staged 변경사항으로 커밋 메시지 3개 후보가 생성된다
- 대화형 선택 후 실제 git commit이 실행된다
- --auto 시 첫 번째 후보로 자동 커밋한다
- staged 파일이 없으면 안내 메시지를 출력한다

#### Task 2.4: `junflow review` + `junflow status` 구현
**예상 소요:** 3-4시간

- [ ] CodeReviewer 에이전트 구현 + 프롬프트 작성 (JSON schema 명시)
- [ ] review 명령어: diff 수집 -> [개정 2차] diff truncation -> AI 분석 -> severity별 출력
- [ ] status 명령어: 현재 브랜치 + 이슈 + git 상태 표시
- [ ] 통합 테스트

**수락 기준:**
- `junflow review`가 변경사항을 분석하여 severity별로 출력한다
- --focus 옵션으로 특정 영역에 집중된 리뷰가 가능하다
- `junflow status`가 현재 작업 상태를 한눈에 보여준다

#### Task 2.5: 마무리 및 품질 개선
**예상 소요:** 4-5시간 [개정 2차] 프롬프트 튜닝 시간 반영으로 1시간 추가

[개정 2차] 에러 시나리오 구체화 -- "모든 에러"를 구체적 목록으로 명시

- [ ] 에러 핸들링 통합 검토 -- 아래 구체적 시나리오 각각에 대해 사용자 친화적 메시지 확인:
  - **API 키 미설정**: `ANTHROPIC_API_KEY` 또는 `NOTION_API_KEY` 환경변수/config 없음
  - **네트워크 타임아웃**: AI API 또는 Notion API 응답 지연 (30초 타임아웃)
  - **Notion 접근 불가**: DB가 공유되지 않았거나 API 키 권한 부족 (403/404)
  - **git repo 아닌 디렉토리**: `junflow start/commit/review`를 git 저장소 밖에서 실행
  - **staged 파일 없음**: `junflow commit` 실행 시 staged 변경사항이 없는 경우
  - **AI 파싱 실패**: AI 응답이 유효한 JSON이 아닌 경우 (재시도 후에도 실패)
  - **설정 파일 손상**: `~/.junflow/config.yaml`이 잘못된 YAML이거나 스키마 불일치
- [ ] 전체 CLI 출력 포맷 통일 (박스, 색상, 아이콘)
- [ ] [개정 2차] 프롬프트 품질 검증 및 튜닝: 실제 diff/이슈 데이터로 각 에이전트 프롬프트 테스트 + 개선
- [ ] README.md 작성 (설치 방법, 사용 예시, 아키텍처 다이어그램)
- [ ] npm publish 준비 (package.json 메타데이터, .npmignore)
- [ ] 데모 시나리오 정리 (Mock 트래커로 전체 플로우 시연 가능)

**수락 기준:**
- mock 모드로 `init -> start -> (코드 수정) -> commit -> review` 전체 플로우가 동작한다
- [개정 2차] 위 7개 에러 시나리오 각각에서 사용자 친화적 메시지가 출력된다 (스택트레이스 노출 없음, exit code 1)
- README에 GIF 또는 스크린샷 기반 데모가 포함된다

---

## 7. 테스트 전략

### 7.1 단위 테스트 (Unit)
**도구:** vitest
**범위:** 에이전트, 트래커 어댑터, 설정 로더, Git 유틸, diff 파서, AI 응답 파서

```
핵심 테스트 케이스:
- 에이전트: 정상 응답 처리, AI 에러 처리, 입력 검증 실패, 타임아웃
- 설정: YAML 파싱, 스키마 검증, 기본값 병합, 환경변수 오버라이드
- Git: diff 파싱 정확도, 브랜치명 유효성 검증
- 트래커: Notion 응답 -> TrackerIssue 변환, 필드 누락 처리
- [개정 2차] AI 응답 파서: 유효 JSON, 잘못된 JSON, 코드블록 내 JSON, zod 검증 실패, 재시도 성공/실패
- [개정 2차] diff truncator: 토큰 제한 초과 시 파일 우선순위별 truncation, lock 파일 제거
```

**Mock 전략:**
- AI 프로바이더: 고정된 응답을 반환하는 mock 구현체
- Notion API: 녹화된 응답(fixtures) 사용
- Git: 테스트마다 임시 저장소 생성/삭제 (beforeEach/afterEach)

### 7.2 통합 테스트 (Integration)
**범위:** start 명령어 전체 흐름, CLI 명령어 E2E

```
핵심 테스트 케이스:
- [개정 2차] start 플로우 (start-flow.test.ts): mock 트래커 -> 이슈 분석 -> 브랜치 생성 (mock AI)
- commit 플로우: 실제 git repo -> diff 수집 -> 메시지 생성 (mock AI)
- 에러 전파: 에이전트 호출 중간 실패 시 적절한 에러 반환
```

### 7.3 [개정 2차] 테스트 커버리지 목표 (현실적 조정)

> **변경 사유 (Warning)**: 전체 80% 목표는 비현실적. 핵심 모듈에 집중하고 CLI 핸들러는 주요 경로만 커버.

- **핵심 모듈 80% 이상**: 에이전트 타입 검증, 설정 스키마(zod), diff 파서, Notion 데이터 변환, AI 응답 파서
- **CLI 핸들러: 주요 경로만** -- happy path + 주요 에러 경로 (staged 없음, API 키 없음 등)
- AI 프롬프트: 출력 파싱 로직만 테스트 (AI 응답 자체는 테스트하지 않음)

### 7.4 테스트 실행 명령어
```bash
npm test              # 전체 테스트
npm run test:unit     # 단위 테스트만
npm run test:int      # 통합 테스트만
npm run test:cov      # 커버리지 리포트
```

---

## 8. 의존성 목록

### Production
| 패키지 | 용도 | 비고 |
|--------|------|------|
| commander | CLI 프레임워크 | 명령어 파싱 |
| @anthropic-ai/sdk | Claude API | AI 호출 |
| @notionhq/client | Notion API | 이슈 트래커 |
| simple-git | Git 연산 | 브랜치/커밋/diff |
| js-yaml | YAML 파싱 | 설정 파일 |
| zod | 스키마 검증 | 설정 + 입력 검증 + [개정 2차] AI 응답 검증 |
| chalk | 컬러 출력 | 터미널 UI |
| ora | 스피너 | 로딩 표시 |
| inquirer | 대화형 입력 | 선택/확인 |
| boxen | 박스 그리기 | 결과 출력 포맷 |

### Development
| 패키지 | 용도 |
|--------|------|
| typescript | 타입 시스템 |
| tsup | 번들러 (esbuild 기반) |
| vitest | 테스트 러너 |
| @types/inquirer | 타입 정의 |
| eslint + prettier | 코드 품질 |
| @typescript-eslint/* | TS 린팅 |

---

## 9. Guardrails

### Must Have
- 모든 에이전트는 Agent<TInput, TOutput> 인터페이스를 구현
- API 키는 절대 코드에 하드코딩하지 않음 (환경변수 또는 config)
- 모든 외부 호출(AI, Notion, Git)에 타임아웃 설정
- CLI 에러 시 exit code 1 반환 + 사용자 친화적 메시지
- [개정 2차] AI 응답은 반드시 JSON 파싱 + zod 검증 후 사용
- [개정 2차] diff 크기가 토큰 제한 초과 시 자동 truncation

### Must NOT Have
- 프롬프트 내에 사용자의 API 키나 개인 정보 포함
- AI 응답을 검증 없이 직접 git 명령에 전달 (브랜치명 sanitize 필수)
- node_modules나 빌드 산출물의 git 커밋
- 동기적 파일 I/O (모든 파일 연산은 async)
- [개정 2차] 제네릭 파이프라인 프레임워크 (pipeline.ts 등 YAGNI 추상화)

---

## 10. Success Criteria

1. **동작하는 데모**: mock 모드로 `junflow init -> start -> commit -> review` 전체 사이클이 에러 없이 실행된다
2. **테스트 통과**: `npm test` 전체 통과, [개정 2차] 핵심 모듈(에이전트 타입 검증, 설정 스키마, diff 파서, Notion 변환, AI 응답 파서) 커버리지 80% 이상
3. **코드 품질**: ESLint 경고 0개, TypeScript strict 모드 컴파일 통과
4. **실사용 가능**: 실제 프로젝트에서 Notion 이슈 연동 + Claude API로 커밋 메시지 생성이 동작한다
5. **포트폴리오 가치**: README에 아키텍처 다이어그램 + 사용 데모가 포함된다
6. **[개정 2차] 에러 복원력**: 7개 에러 시나리오 각각에서 graceful degradation + 사용자 친화적 메시지 출력

---

## 11. v2 로드맵 (MVP 이후)

> OMC, TFX, 짐코딩 강의에서 영감을 받은 확장 아이디어. MVP에서는 구현하지 않되, 구조적으로 확장 가능하도록 인터페이스를 설계한다.

| 우선순위 | 기능 | 참고 출처 | 설명 |
|---------|------|----------|------|
| 높음 | 멀티 AI 프로바이더 | TFX cli-route.sh | OpenAI, Gemini 등 AIProvider 구현체 추가 |
| 높음 | 세션 상태 관리 | OMC `.omc/state/` | 작업 세션 추적, 중단/재개 지원 |
| 중간 | Hook 시스템 | OMC hooks, 강의 섹션 16 | 이벤트 기반 확장 (pre-commit, post-start 등) |
| 중간 | Claude Code 스킬로 배포 | 강의 섹션 27 | junflow를 Claude Code 플러그인/스킬로 패키징 |
| 중간 | MCP Tool Search 활용 | 강의 섹션 28 | 도구 동적 로딩으로 컨텍스트 절약 |
| 낮음 | DAG 기반 태스크 분해 | TFX Phase 2b | 복잡한 이슈를 서브태스크로 자동 분해 |
| 낮음 | Agent Teams 협업 | OMC team, 강의 섹션 29 | 멀티에이전트 병렬 작업 |
| 낮음 | 트래커 플러그인 (Jira, GitHub Issues) | PLAN 원칙 4 | IssueTracker 인터페이스 기반 확장 |

---

## 부록: 2차 개정 변경 이력

| # | 분류 | 변경 내용 | 영향 범위 |
|---|------|----------|----------|
| 1 | Critical | Task 0 (Notion DB 스키마 확인) 추가, TrackerIssue 인터페이스 확정을 Task 0 이후로 연기 | 섹션 3.4, 6 (Task 0, 2.1) |
| 2 | Critical | 프롬프트 전략 섹션 신설 (출력 포맷 강제, diff truncation, 파싱 재시도) | 섹션 5 신설, Task 1.3/2.2/2.3/2.4/2.5 |
| 3 | Critical | Pipeline 프레임워크 제거, 직접 호출 방식 채택 + ADR #2 추가 | 섹션 1 (ADR), 2 (구조), 3.3, Task 1.3/2.2 |
| 4 | Warning | 테스트 커버리지 목표: 전체 80% -> 핵심 모듈 80% + CLI 주요 경로 | 섹션 7.3, 10 |
| 5 | Suggestion | Task 2.5 에러 시나리오 7개 구체적 목록화 | 섹션 6 (Task 2.5) |

### 3차 개정 변경 이력

| # | 분류 | 변경 내용 | 영향 범위 |
|---|------|----------|----------|
| 1 | Enhancement | 에이전트별 모델 오버라이드 설정 추가 (OMC 티어 라우팅 참고) | 섹션 3.6 (설정 스키마) |
| 2 | Enhancement | `junflow status`에 세션 토큰 사용량 & 비용 리포팅 추가 (TFX 참고) | 섹션 4.5 |
| 3 | New | v2 로드맵 섹션 신설 (OMC, TFX, 짐코딩 강의 기반 확장 아이디어) | 섹션 11 |
