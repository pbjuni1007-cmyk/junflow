# Git Pilot

> Git workflow automation with issue tracker integration

이슈 트래커(GitHub/Jira/Notion) 연동 + 컨벤션 기반 커밋 자동화에 집중하는 Claude Code MCP 도구입니다.

## Quick Start

### 1. 설치

```bash
# git-pilot 빌드
cd ~/projects/git-pilot
npm install && npm run build
```

### 2. MCP 서버 등록 (`~/.mcp.json`)

```json
{
  "mcpServers": {
    "git-pilot": {
      "command": "node",
      "args": ["C:/Users/SSAFY/projects/git-pilot/dist/mcp/index.js"]
    }
  }
}
```

### 3. 프로젝트 설정

프로젝트 루트에 `.git-pilot.yaml` 생성:

```yaml
tracker:
  type: github          # github | jira | notion | mock
  github:
    owner: my-org
    repo: my-project
git:
  defaultBaseBranch: main
  commitConvention: conventional   # conventional | gitmoji
  commitLanguage: ko               # ko | en
```

### 4. 환경변수

`~/.env` 또는 시스템 환경변수에 토큰 설정:

```bash
GITHUB_TOKEN=ghp_xxx        # GitHub 트래커 사용 시
JIRA_API_TOKEN=xxx           # Jira 트래커 사용 시
NOTION_API_KEY=ntn_xxx       # Notion 트래커 사용 시
```

---

## 사용법

### 전체 흐름

```
이슈 선택 → gp s → 코딩 → git add → gp c → 끝!
```

### Step 1: 이슈 시작 (`gp s`)

```
나: "gp s 42"
```

Git Pilot이 하는 일:

1. GitHub/Jira에서 이슈 #42 조회
2. 이슈 분석 (타입, 복잡도, 핵심 요구사항)
3. 브랜치 이름 후보 3개 제안

```
이슈 분석:
- 제목: 로그인 세션 만료 처리
- 타입: feature | 복잡도: medium
- 핵심: 세션 타임아웃 시 리다이렉트 + 토스트 알림

브랜치 후보:
  1. feature/42-login-session-expiry
  2. feature/42-handle-session-timeout
  3. feature/42-session-redirect

번호를 선택하세요:
```

"1번" 선택 → 브랜치 생성 + 체크아웃 완료!

### Step 2: 코딩

평소대로 코딩합니다. Git Pilot은 이 단계에서 관여하지 않습니다.

### Step 3: 스테이징

```bash
git add src/auth/session.ts src/components/Toast.tsx
```

### Step 4: 커밋 (`gp c`)

```
나: "gp c"
```

Git Pilot이 하는 일:

1. staged diff 수집
2. 현재 브랜치 + 이슈 컨텍스트 참조
3. 컨벤션에 맞는 커밋 메시지 후보 3개 생성

```
커밋 후보:
  1. feat(auth): 세션 만료 시 로그인 리다이렉트 추가
  2. feat(auth/session): 타임아웃 감지 및 토스트 알림 구현
  3. feat(auth): 세션 만료 처리 로직 구현

     세션 타임아웃 감지 인터셉터를 추가하고,
     만료 시 로그인 페이지로 리다이렉트하며 토스트 알림 표시

번호를 선택하세요:
```

"2번" 선택 → 커밋 완료!

---

## 스킬 (Claude Code Skills)

| 단축키 | 스킬 | 용도 |
|--------|------|------|
| `gp s` | git-pilot-start | 이슈 조회 → 분석 → 브랜치 생성 |
| `gp c` | git-pilot-commit | staged diff → 커밋 메시지 3후보 → 선택 → 커밋 |
| `gp dc` | git-pilot-deep-commit | 3관점(명확성/상세함/컨벤션) 심층 커밋 메시지 생성 |
| `gp st` | git-pilot-status | 브랜치/git 상태/세션 대시보드 |

---

## MCP 도구 (9개)

### Context 수집

| 도구 | 설명 |
|------|------|
| `gp_get_issue` | 이슈 트래커에서 이슈 데이터 조회 |
| `gp_get_commit_convention` | 커밋/브랜치 컨벤션 설정 반환 |
| `gp_get_staged_diff` | staged 변경사항 diff 수집 (auto-truncation) |
| `gp_get_branch_diff` | base 브랜치 대비 전체 diff |
| `gp_get_context` | 브랜치/이슈/상태/컨벤션 일괄 조회 |

### Action 실행

| 도구 | 설명 |
|------|------|
| `gp_create_branch` | 브랜치 생성 + 체크아웃 |
| `gp_commit` | 커밋 메시지로 git commit 실행 |
| `gp_status` | git-pilot 작업 상태 조회 |
| `gp_session_record` | 세션에 에이전트 호출 기록 추가 |

---

## Config 우선순위

1. **프로젝트 로컬**: `./.git-pilot.yaml` (cwd 기준)
2. **글로벌**: `~/.git-pilot/config.yaml`
3. **환경변수**: `GITHUB_TOKEN`, `JIRA_API_TOKEN`, `NOTION_API_KEY`
4. **기본값**: conventional / ko / main

---

## 기술 스택

- TypeScript + ESM
- MCP SDK (`@modelcontextprotocol/sdk`)
- simple-git
- Zod (validation)
- tsup (bundling)
- vitest (testing)

## License

MIT
