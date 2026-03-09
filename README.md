# JunFlow

AI 기반 개발 워크플로우 자동화 CLI 도구

> 이슈 분석 → 브랜치 생성 → AI 커밋 메시지 → AI 코드 리뷰를 하나의 워크플로우로 자동화합니다.

## 주요 기능

- **이슈 자동 분석 + 브랜치 생성** (`junflow start`) - 이슈를 분석하여 개발 브랜치를 자동 생성
- **AI 커밋 메시지 생성** (`junflow commit`) - 코드 변경사항을 분석하여 Conventional Commits 형식의 메시지 자동 생성
- **AI 코드 리뷰** (`junflow review`) - diff를 분석하여 코드 품질, 보안, 성능 이슈를 자동 리뷰
- **작업 상태 대시보드** (`junflow status`) - 현재 브랜치, 활성 이슈, Git 상태, 토큰 사용량 한눈에 확인

## 빠른 시작

### 1. 설치

```bash
npm install -g junflow
```

또는 로컬 개발 모드:

```bash
git clone https://github.com/yourusername/junflow.git
cd junflow
npm install
npm link
```

### 2. 초기화

```bash
junflow init
```

대화형 위저드가 실행됩니다:
- ANTHROPIC_API_KEY 설정 (또는 환경변수 `ANTHROPIC_API_KEY` 사용)
- 이슈 트래커 선택 (Notion / Mock)
- Git 컨벤션 설정 (브랜치, 커밋)

설정은 `~/.junflow/config.yaml`에 저장됩니다.

### 3. 개발 시작

```bash
junflow start ISSUE-ID
```

예시:
```bash
junflow start PROJ-42
```

동작:
1. Notion 또는 Mock 트래커에서 이슈 조회
2. Claude AI가 이슈 분석 (타입, 복잡도, 요구사항, 접근방법)
3. 브랜치명 3개 후보 제시 (사용자 선택)
4. Git 브랜치 자동 생성
5. 분석 결과를 `.junflow/current-issue.json`에 저장

### 4. 코드 작성 및 커밋

```bash
# 변경사항 스테이징
git add src/features/profile.ts

# AI 커밋 메시지 생성
junflow commit

# 또는 자동 커밋
junflow commit --auto
```

### 5. 코드 리뷰

```bash
junflow review
```

또는 main 브랜치 대비만 리뷰:
```bash
junflow review --base main --focus security performance
```

### 6. 상태 확인

```bash
junflow status
```

현재 작업 상태, 토큰 사용량, 예상 비용 표시.

## 명령어 상세

### `junflow init`

프로젝트 초기 설정을 진행합니다.

```bash
junflow init
```

**생성되는 파일:**
- `~/.junflow/config.yaml` - 전역 설정

### `junflow start <issue-id>`

이슈 기반 개발을 시작합니다.

```bash
junflow start ISSUE-42
junflow start ISSUE-42 --dry-run          # 실제 실행 없이 결과만 표시
junflow start ISSUE-42 --no-branch        # 분석만 수행, 브랜치 생성 안 함
junflow start ISSUE-42 --tracker notion   # 트래커 타입 오버라이드
```

**출력 예시:**

```
┌─ Issue Analysis ──────────────────────────────┐
│ Issue Analysis                                 │
│ Title: 사용자 프로필 페이지 구현                │
│ Type: feature  Complexity: medium             │
│ Requirements:                                  │
│   - 프로필 조회 API 연동                       │
│   - 프로필 이미지 업로드                       │
│   - 반응형 레이아웃                            │
│ Suggested Approach:                            │
│   컴포넌트 분리 후 API 훅부터 구현 권장        │
│                                                │
│ Branch                                         │
│   > feature/PROJ-42-user-profile-page          │
│     feature/PROJ-42-implement-profile          │
│     feat/PROJ-42-profile                       │
└────────────────────────────────────────────────┘

? 브랜치를 선택하세요:
```

### `junflow commit`

Staged 변경사항을 분석하여 AI 커밋 메시지를 생성합니다.

```bash
junflow commit                           # 대화형 선택
junflow commit --auto                    # 첫 번째 추천 자동 사용
junflow commit --all                     # 모든 변경사항 stage 후 커밋
junflow commit --lang en                 # 커밋 언어 오버라이드 (ko/en)
junflow commit --convention conventional # 컨벤션 오버라이드
junflow commit --dry-run                 # 메시지만 출력, 실제 커밋 안 함
```

**출력 예시:**

```
┌─ Commit Message Suggestions ──────────────────┐
│  1. feat(profile): 사용자 프로필 조회 API 연동 │
│  2. feat: 프로필 페이지 컴포넌트 및 API 구현   │
│  3. feat(user): add profile page with API hook│
│                                               │
│  [1-3] 선택 / [e] 직접 수정 / [q] 취소        │
└───────────────────────────────────────────────┘

선택 [1-3/e/q]: 1
```

### `junflow review`

현재 브랜치의 변경사항을 분석하여 코드 리뷰를 수행합니다.

```bash
junflow review                                      # 현재 브랜치 vs main
junflow review --staged                             # Staged 변경만 리뷰
junflow review --base develop                       # develop 브랜치 대비
junflow review --focus security performance         # 특정 영역에 집중
junflow review --focus security,performance,testing # 여러 영역 지정
```

**출력 예시:**

```
┌─ Code Review (Score: 7/10) ──────────────────┐
│ 프로필 페이지 구현의 일반적인 구조는 좋지만,
│ 몇 가지 보안 및 성능 개선 사항이 있습니다.
│
│ CRITICAL (1)
│   src/api/profile.ts:23
│   SQL injection 가능성 - parameterized query
│   사용 권장
│
│ WARNING (2)
│   src/components/Profile.tsx:45
│   useEffect 의존성 배열 누락
│
│ SUGGESTION (3)
│   ...
│
│ PRAISE (1)
│   에러 핸들링이 잘 구성되어 있습니다.
└────────────────────────────────────────────┘
```

### `junflow status`

현재 작업 상태를 표시합니다.

```bash
junflow status
```

**출력 예시:**

```
Current Branch: feature/PROJ-42-user-profile-page
Active Issue: PROJ-42 (사용자 프로필 페이지 구현)
Git Status:
  Staged: 3 files
  Modified: 1 file
  Untracked: 0 files

┌─ Session Token Usage ──────────────────────────┐
│ Agent           │ Calls │ Tokens  │ Est. Cost  │
│ IssueAnalyzer   │   1   │  2,340  │   $0.007   │
│ CommitWriter    │   3   │  5,120  │   $0.015   │
│ CodeReviewer    │   1   │  8,900  │   $0.027   │
├─────────────────┼───────┼─────────┼────────────┤
│ Total           │   5   │ 16,360  │   $0.049   │
└────────────────────────────────────────────────┘
```

### `junflow config`

설정을 관리합니다.

```bash
junflow config show                           # 현재 설정 표시
junflow config set ai.model claude-opus      # 설정값 변경
junflow config reset                          # 기본값으로 초기화
junflow config path                           # 설정 파일 경로 표시
```

## 설정 파일

`~/.junflow/config.yaml`:

```yaml
ai:
  provider: claude
  model: claude-sonnet-4-20250514
  maxTokens: 2048
  # apiKey: sk-...  # 또는 ANTHROPIC_API_KEY 환경변수 사용

tracker:
  type: notion  # 또는 mock
  notion:
    databaseId: abc123...
    # apiKey: ...  # 또는 NOTION_API_KEY 환경변수 사용

git:
  branchConvention: '{type}/{issueId}-{description}'
  commitConvention: conventional  # 또는 gitmoji
  commitLanguage: ko  # 또는 en

output:
  color: true
  verbose: false
```

**환경변수 우선순위:**
1. 환경변수 (`ANTHROPIC_API_KEY`, `NOTION_API_KEY`)
2. 설정 파일 (`~/.junflow/config.yaml`)
3. 기본값

## 아키텍처

### 계층 구조

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  CLI Layer  │────▶│  Agent Layer │────▶│  AI Layer   │
│  (commands) │     │  (BaseAgent) │     │  (Claude)   │
└──────┬──────┘     └──────┬───────┘     └─────────────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌──────────────┐
│  Git Layer  │     │  Tracker     │
│ (simple-git)│     │ (Notion/Mock)│
└─────────────┘     └──────────────┘
```

### 핵심 모듈

| 모듈 | 역할 |
|------|------|
| **CLI Commands** | `start`, `commit`, `review`, `status`, `init`, `config` |
| **Agents** | `IssueAnalyzer`, `BranchNamer`, `CommitWriter`, `CodeReviewer` |
| **AI Provider** | Claude API 래퍼, 응답 파싱 및 재시도 로직 |
| **Trackers** | Notion API 어댑터, Mock (테스트용) |
| **Git Operations** | simple-git 래퍼, diff 분석 |
| **Config** | YAML 로더, Zod 스키마 검증 |

### 에이전트 패턴

모든 에이전트는 `Agent<TInput, TOutput>` 인터페이스를 구현합니다:

```typescript
interface Agent<TInput, TOutput> {
  name: string;
  description: string;
  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

type AgentResult<T> =
  | { success: true; data: T; metadata: AgentMetadata }
  | { success: false; error: AgentError; metadata: AgentMetadata };
```

**특징:**
- 명시적 성공/실패 처리 (에러 코드, 메시지)
- 실행 시간 및 토큰 사용량 추적
- 컨텍스트 기반 실행 (설정, 로거, 작업 디렉토리)

## 디렉토리 구조

```
junflow/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI 엔트리포인트
│   │   ├── commands/             # start, commit, review, status, init, config
│   │   └── utils/                # logger, spinner, prompt, token-tracker
│   ├── agents/                   # AI 에이전트
│   │   ├── types.ts              # Agent 인터페이스
│   │   ├── base-agent.ts         # 베이스 클래스
│   │   ├── issue-analyzer.ts     # 이슈 분석
│   │   ├── branch-namer.ts       # 브랜치 네이밍
│   │   ├── commit-writer.ts      # 커밋 메시지 생성
│   │   └── code-reviewer.ts      # 코드 리뷰
│   ├── trackers/                 # 이슈 트래커 어댑터
│   │   ├── types.ts              # TrackerIssue 인터페이스
│   │   ├── notion.ts             # Notion API
│   │   └── mock.ts               # 테스트용 Mock
│   ├── ai/                       # AI 프로바이더
│   │   ├── claude.ts             # Claude API 래퍼
│   │   ├── response-parser.ts    # JSON 파싱 + 재시도 로직
│   │   └── prompts/              # 프롬프트 템플릿
│   ├── git/                      # Git 연동
│   │   ├── operations.ts         # 브랜치, 커밋, diff 연산
│   │   └── diff-parser.ts        # diff 분석
│   └── config/                   # 설정 관리
│       ├── schema.ts             # Zod 스키마
│       ├── loader.ts             # YAML 로드/저장
│       └── defaults.ts           # 기본값
├── tests/
│   ├── unit/                     # 단위 테스트
│   ├── integration/              # 통합 테스트
│   └── fixtures/                 # 테스트 데이터
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## 기술 스택

| 분류 | 기술 |
|------|------|
| **런타임** | Node.js + TypeScript |
| **CLI 프레임워크** | Commander.js |
| **AI API** | Anthropic Claude SDK |
| **이슈 트래커** | Notion API |
| **Git 연동** | simple-git |
| **설정 관리** | js-yaml + Zod |
| **터미널 UI** | chalk, ora, inquirer, boxen |
| **테스트** | Vitest |
| **번들링** | tsup (esbuild) |
| **코드 품질** | ESLint + Prettier |

## 개발

### 설치

```bash
npm install
```

### 빌드

```bash
npm run build
```

### 개발 모드 (watch)

```bash
npm run dev
```

### 테스트

```bash
npm test           # 전체 테스트
npm run test:unit  # 단위 테스트만
npm run test:int   # 통합 테스트만
npm run test:cov   # 커버리지 리포트
```

### 코드 품질 검사

```bash
npm run lint       # ESLint 검사
npm run format     # Prettier 포맷팅
```

### 로컬 테스트

```bash
npm link
junflow init
junflow start ISSUE-1  # Mock 트래커로 테스트
```

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Claude API 키 | 필수 |
| `NOTION_API_KEY` | Notion API 키 (Notion 트래커 사용 시) | 선택 |
| `JUNFLOW_CONFIG_DIR` | 설정 디렉토리 | `~/.junflow` |

## 에러 처리

JunFlow는 다음 상황을 우아하게 처리합니다:

| 상황 | 메시지 | 해결 방법 |
|------|--------|----------|
| API 키 미설정 | `ANTHROPIC_API_KEY가 설정되지 않았습니다.` | 환경변수 또는 `junflow init` 실행 |
| Git 저장소 아님 | `Git 저장소가 아닙니다.` | 프로젝트 루트에서 `git init` 실행 |
| Staged 파일 없음 | `스테이징된 변경사항이 없습니다.` | `git add` 또는 `--all` 옵션 사용 |
| Notion 접근 불가 | `Notion 트래커 초기화 실패` | API 키, Database ID 확인 |
| AI 응답 파싱 실패 | `AI 응답이 유효하지 않습니다.` | 프롬프트 재시도 (자동으로 수행됨) |
| 설정 파일 손상 | `설정 로드 실패` | `junflow init` 재실행 |

## 라이센스

MIT

## 기여

이슈 및 PR은 언제든 환영합니다!

## 작가

Made by Jun
