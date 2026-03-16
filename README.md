# JunFlow

AI 기반 개발 워크플로우 자동화 CLI 도구

> 이슈 분석 → 브랜치 생성 → AI 커밋 메시지 → AI 코드 리뷰를 하나의 워크플로우로 자동화하며, 멀티 AI 프로바이더, 에이전트 라우팅, 자동 폴백, 병렬 팀 실행을 지원합니다.

## 주요 기능

### 핵심 워크플로우
- **이슈 자동 분석 + 브랜치 생성** (`junflow start`) - 이슈를 분석하여 개발 브랜치를 자동 생성
- **AI 커밋 메시지 생성** (`junflow commit`) - 코드 변경사항을 분석하여 Conventional Commits 형식의 메시지 자동 생성
- **AI 코드 리뷰** (`junflow review`) - diff를 분석하여 코드 품질, 보안, 성능 이슈를 자동 리뷰
- **문서 리뷰** (`junflow review-doc`) - 마크다운/기술 문서의 정확성, 일관성 자동 리뷰
- **작업 상태 대시보드** (`junflow status`) - 현재 브랜치, 활성 이슈, Git 상태, 토큰 사용량 한눈에 확인

### 멀티 AI 오케스트레이션
- **멀티 AI 프로바이더** - Claude, OpenAI, Gemini 지원 (provider-factory 패턴)
- **에이전트별 프로바이더 라우팅** - 에이전트마다 다른 AI 프로바이더/모델/타임아웃 지정
- **쿼터 초과 자동 폴백** - rate limit 감지 시 다른 프로바이더로 자동 전환
- **멀티프로바이더 합의(Consensus)** - 여러 AI의 응답을 병렬 수집 후 합성

### 확장 기능
- **트래커 플러그인** - Notion, GitHub Issues, Jira 어댑터 (IssueTracker 인터페이스)
- **세션 관리** - 작업 세션 추적, 중단/재개, 토큰 사용량 기록
- **Hook 시스템** - pre/post 이벤트 기반 확장 (pre-start, post-commit 등)
- **DAG 태스크 분해** - 복잡한 이슈를 서브태스크 DAG로 자동 분해
- **Agent Teams** - 워크플로우 프리셋 기반 멀티에이전트 병렬 협업
- **MCP 서버** - Claude Code 통합 (Claude AI가 junflow 명령어 자동 실행)

## 빠른 시작

### 1. 설치

```bash
npm install -g junflow
```

또는 로컬 개발 모드:

```bash
git clone https://github.com/pbjuni1007-cmyk/junflow.git
cd junflow
npm install
npm link
```

### 2. 초기화

```bash
junflow init
```

대화형 위저드가 실행됩니다:
- AI 프로바이더 선택 (Claude / OpenAI / Gemini, 기본값: Claude)
- API 키 설정 (환경변수 또는 직접 입력)
- 이슈 트래커 선택 (Notion / GitHub Issues / Jira / Mock)
- 트래커별 인증 정보 설정 (Database ID, Token 등)
- Git 컨벤션 설정 (브랜치, 커밋)

설정은 `~/.junflow/config.yaml`에 저장됩니다.

### 3. 개발 시작

```bash
junflow start ISSUE-42
```

동작:
1. 설정된 트래커에서 이슈 조회
2. AI 프로바이더로 이슈 분석 (타입, 복잡도, 요구사항, 접근방법)
3. 브랜치명 3개 후보 제시 (사용자 선택)
4. Git 브랜치 자동 생성
5. 분석 결과를 `.junflow/current-issue.json`에 저장

### 4. 코드 작성 및 커밋

```bash
git add src/features/profile.ts
junflow commit              # 대화형 선택
junflow commit --auto       # 첫 번째 추천 자동 사용
junflow commit --all        # 모든 변경사항 stage 후 커밋
junflow commit --consensus  # 멀티 AI 합의 모드
```

### 5. 코드 리뷰

```bash
junflow review                                # 현재 브랜치 vs main
junflow review --base develop                 # develop 브랜치 대비
junflow review --focus security performance   # 특정 영역 집중
junflow review --consensus                    # 멀티 AI 합의 리뷰
junflow review --verify                       # AI 자동 검증 루프 포함
```

### 6. 상태 확인

```bash
junflow status
```

## 명령어 요약

| 명령어 | 설명 | 주요 옵션 |
|--------|------|----------|
| `junflow init` | 프로젝트 초기 설정 | |
| `junflow start <id>` | 이슈 분석 + 브랜치 생성 | `--dry-run`, `--no-branch`, `--decompose` |
| `junflow commit` | AI 커밋 메시지 생성 | `--auto`, `--all`, `--lang`, `--consensus` |
| `junflow review` | AI 코드 리뷰 | `--staged`, `--base`, `--focus`, `--consensus`, `--verify` |
| `junflow review-doc` | 문서 리뷰 | `--consensus` |
| `junflow status` | 작업 상태 대시보드 | |
| `junflow config` | 설정 관리 | `show`, `set`, `reset`, `path` |
| `junflow session` | 세션 관리 | `list`, `show`, `resume`, `end` |
| `junflow team` | Agent Teams 실행 | `--list`, 프리셋명 |
| `junflow hooks` | Hook 목록 표시 | |

## 설정 파일

`~/.junflow/config.yaml`:

```yaml
ai:
  provider: claude                           # claude, openai, gemini
  model: claude-sonnet-4-20250514
  maxTokens: 2048

  # 에이전트별 프로바이더 라우팅 (v2.1)
  agentRouting:
    issueAnalyzer:
      provider: claude
      model: claude-opus-4-20250805
      timeout: 60
    codeReviewer:
      provider: openai
      model: gpt-4o
      timeout: 90
    commitWriter:
      provider: gemini
      model: gemini-2.0-flash
      timeout: 15
    branchNamer:
      provider: claude
      model: claude-haiku-4-20250514

  # 또는 단순 모델 오버라이드 (하위호환)
  # agentModels:
  #   issueAnalyzer: claude-opus-4-20250805
  #   codeReviewer: claude-opus-4-20250805

tracker:
  type: notion                                # notion, github, jira, mock
  notion:
    databaseId: abc123...
  github:
    owner: username
    repo: repo-name
  jira:
    host: https://your-jira.atlassian.net
    projectKey: PROJ

git:
  branchConvention: '{type}/{issueId}-{description}'
  commitConvention: conventional              # conventional, gitmoji
  commitLanguage: ko                          # ko, en

hooks:
  pre-start:
    - command: "echo 'Starting issue analysis...'"
      continueOnError: true
  post-commit:
    - command: "npm run lint"
      description: "Run linter after commit"

output:
  color: true
  verbose: false
```

**환경변수 우선순위:**
1. 환경변수 (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `NOTION_API_KEY`, `GITHUB_TOKEN`, `JIRA_API_TOKEN`)
2. 설정 파일 (`~/.junflow/config.yaml`)
3. 기본값

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                            │
│  start/ | commit/ | review | review-doc | status | team     │
└────────┬──────────────────────────────────────────┬─────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────────────┐            ┌──────────────────────┐
│    Orchestration        │            │  Session Manager     │
│  Team Runner (parallel) │            │  Hook Runner         │
│  DAG Topology           │            │  Token Tracker       │
│  Consensus Runner       │            │                      │
└────────┬────────────────┘            └──────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Agent Layer                             │
│  IssueAnalyzer | BranchNamer | CommitWriter | CodeReviewer  │
│  DocumentReviewer | DeepResearcher | TaskDecomposer         │
│  Verifier (auto-verify loop)                                │
└────────┬──────────────────────────────────────────┬─────────┘
         │                                          │
         ▼                                          ▼
┌──────────────────────────┐         ┌──────────────────────┐
│   AI Provider Layer      │         │  Tracker Layer       │
│  Provider Routing Table  │         │  Notion/GitHub/Jira  │
│  Fallback Chain (auto)   │         │  Error Classification│
│  Claude/OpenAI/Gemini    │         │  + Auto Recovery     │
│  Retry (exp. backoff)    │         │                      │
└──────────────────────────┘         └──────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Git Layer                              │
│  Branch Creation | Diff Parsing | Commit Operations         │
└─────────────────────────────────────────────────────────────┘
```

### 핵심 모듈

| 모듈 | 역할 | 파일 |
|------|------|------|
| **CLI Commands** | start, commit, review, status, init, config, session, team, hooks | `src/cli/commands/` |
| **Agents** | IssueAnalyzer, BranchNamer, CommitWriter, CodeReviewer, DocumentReviewer, DeepResearcher, TaskDecomposer, Verifier | `src/agents/` |
| **AI Providers** | Provider factory, routing table, fallback chain, consensus runner | `src/ai/` |
| **Trackers** | Notion, GitHub, Jira, Mock 어댑터 (에러 분류 + 자동 복구) | `src/trackers/` |
| **Session** | 작업 세션 추적, 상태 저장/로드, 토큰 추적 | `src/session/` |
| **Hooks** | pre/post 이벤트 기반 확장 | `src/hooks/` |
| **DAG** | 복잡한 태스크 분해, 사이클 감지, 레벨별 위상 정렬 | `src/dag/` |
| **Teams** | 워크플로우 프리셋, 레벨별 병렬 실행 (Promise.all) | `src/teams/` |
| **MCP Server** | Claude Code 통합 (6개 도구) | `src/mcp/` |

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

### 멀티 AI 오케스트레이션

**에이전트별 프로바이더 라우팅:**
```typescript
// 설정으로 에이전트마다 다른 AI 프로바이더 지정
const provider = createProviderForAgent(config, 'codeReviewer');
// → config.ai.agentRouting.codeReviewer.provider가 'openai'이면
//   OpenAI 인스턴스 생성, 아니면 기본 프로바이더 사용
```

**쿼터 초과 자동 폴백:**
```typescript
// rate limit 감지 시 다음 프로바이더로 자동 전환
const result = await withFallbackRetry(request, primaryProvider, {
  fallbackProviders: [openaiProvider, geminiProvider],
  onFallback: (event) => console.log(`${event.from} → ${event.to}`),
});
```

**팀 병렬 실행:**
```typescript
// DAG 위상 정렬 → 같은 레벨 스텝은 Promise.all()로 병렬 실행
// Level 0: [analyze, research]  ← 병렬
// Level 1: [plan]               ← 순차 (의존성)
// Level 2: [implement, test]    ← 병렬
```

## 디렉토리 구조

```
junflow/
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── start/                 # 리팩토링: 5개 모듈로 분리
│   │   │   │   ├── index.ts           #   메인 커맨드 (173 LOC)
│   │   │   │   ├── rendering.ts       #   출력 포맷팅
│   │   │   │   ├── interaction.ts     #   사용자 인터랙션
│   │   │   │   ├── decomposition.ts   #   DAG 태스크 분해
│   │   │   │   └── session-tracking.ts#   세션 추적
│   │   │   ├── commit/                # 리팩토링: 4개 모듈로 분리
│   │   │   │   ├── index.ts           #   메인 커맨드 (153 LOC)
│   │   │   │   ├── generators.ts      #   메시지 생성 로직
│   │   │   │   ├── interaction.ts     #   사용자 인터랙션
│   │   │   │   └── rendering.ts       #   출력 포맷팅
│   │   │   ├── review.ts, review-doc.ts
│   │   │   ├── status.ts, config.ts
│   │   │   ├── session.ts, team.ts, hooks.ts
│   │   │   └── ...
│   │   └── utils/
│   │       ├── error-handler.ts       # 에러 분류 + 사용자 친화적 메시지
│   │       └── ...
│   ├── agents/                        # 10개 에이전트
│   ├── ai/
│   │   ├── types.ts                   # AIProvider, FallbackChain 타입
│   │   ├── provider-factory.ts        # 팩토리 + 에이전트 라우팅 테이블
│   │   ├── retry.ts                   # withRetry + withFallbackRetry
│   │   ├── multi-provider.ts          # getAvailableProviders + createFallbackChain
│   │   ├── consensus.ts              # ConsensusRunner (멀티프로바이더 합의)
│   │   ├── claude.ts, openai.ts, gemini.ts
│   │   └── response-parser.ts
│   ├── trackers/                      # 에러 분류 + safeFetch 패턴
│   │   ├── notion.ts, github.ts, jira.ts, mock.ts
│   │   └── ...
│   ├── teams/
│   │   ├── runner.ts                  # 레벨별 병렬 실행 (Promise.all)
│   │   ├── presets.ts                 # full-dev, quick-commit, deep-review
│   │   └── ...
│   ├── dag/                           # 사이클 감지, 레벨별 위상 정렬
│   ├── session/                       # 세션 관리, 토큰 추적
│   ├── hooks/                         # pre/post 이벤트 훅
│   ├── mcp/                           # Claude Code MCP 서버
│   ├── git/                           # Git 유틸리티
│   └── config/
│       ├── schema.ts                  # Zod 스키마 (agentRouting 포함)
│       ├── loader.ts
│       └── defaults.ts
├── tests/
│   ├── unit/                          # 479 테스트
│   ├── integration/
│   └── fixtures/
├── eslint.config.js                   # ESLint v10 flat config
├── vitest.config.ts                   # v8 coverage provider
├── package.json
└── tsconfig.json
```

## 기술 스택

| 분류 | 기술 |
|------|------|
| **런타임** | Node.js 20+ / TypeScript (ESM) |
| **CLI** | Commander.js |
| **AI** | @anthropic-ai/sdk, openai, @google/generative-ai |
| **트래커** | @notionhq/client, @octokit/rest, jira.js |
| **MCP** | @modelcontextprotocol/sdk |
| **Git** | simple-git |
| **설정** | js-yaml + Zod |
| **UI** | chalk, ora, inquirer, boxen |
| **테스트** | Vitest (v8 coverage) |
| **번들링** | tsup (esbuild, 2 entry points) |
| **린트** | ESLint v10 (flat config) + Prettier |

## 개발

```bash
npm install          # 의존성 설치
npm run build        # 빌드
npm run dev          # watch 모드
npm test             # 전체 테스트 (479 tests, 42 files)
npm run test:cov     # 커버리지 리포트 (90%+)
npm run lint         # ESLint 검사
npm run format       # Prettier 포맷팅
```

## 환경변수

| 변수 | 설명 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 (Claude 사용 시) |
| `OPENAI_API_KEY` | OpenAI API 키 (OpenAI 사용 시) |
| `GEMINI_API_KEY` | Gemini API 키 (Gemini 사용 시) |
| `NOTION_API_KEY` | Notion API 키 (Notion 트래커 사용 시) |
| `GITHUB_TOKEN` | GitHub 토큰 (GitHub 트래커 사용 시) |
| `JIRA_API_TOKEN` | Jira API 토큰 (Jira 트래커 사용 시) |
| `JUNFLOW_CONFIG_DIR` | 설정 디렉토리 (기본: `~/.junflow`) |

## 라이센스

MIT

## 작가

Made by Jun
