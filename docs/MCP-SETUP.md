# junflow MCP 서버 설정 가이드

junflow의 기능을 MCP(Model Context Protocol) 서버로 노출하여,
Claude Code 등 MCP 클라이언트에서 직접 사용할 수 있습니다.

## 빌드 및 설치

```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 전역 설치 (선택)
npm install -g .
```

## Claude Code에서 MCP 서버 등록

`~/.mcp.json` 파일에 아래 내용을 추가합니다:

```json
{
  "mcpServers": {
    "junflow": {
      "command": "junflow-mcp",
      "args": []
    }
  }
}
```

전역 설치 없이 로컬 빌드를 직접 사용하려면:

```json
{
  "mcpServers": {
    "junflow": {
      "command": "node",
      "args": ["/absolute/path/to/junflow/dist/mcp/index.js"]
    }
  }
}
```

## 환경 변수

AI 제공자에 따라 아래 환경 변수를 설정하세요:

```bash
# Claude (기본값)
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...

# Gemini
export GEMINI_API_KEY=...

# Notion 트래커 사용 시
export NOTION_API_KEY=secret_...
```

## 제공 도구 목록

| 도구명 | 설명 |
|--------|------|
| `junflow_get_issue` | 이슈 트래커에서 이슈 조회 |
| `junflow_analyze_issue` | AI로 이슈 분석 (타입, 복잡도, 요구사항 추출) |
| `junflow_suggest_branch` | 이슈 분석 기반 브랜치 이름 제안 |
| `junflow_generate_commit` | staged diff 기반 AI 커밋 메시지 생성 |
| `junflow_review_code` | diff 기반 AI 코드 리뷰 |
| `junflow_status` | 현재 junflow 작업 상태 조회 |

## 사용 예시

Claude Code에서 MCP 서버가 등록된 후, 다음과 같이 사용합니다:

```
# 이슈 조회
junflow_get_issue(issueId: "ISSUE-1")

# 이슈 분석
junflow_analyze_issue(issueId: "ISSUE-1")

# 브랜치 이름 제안
junflow_suggest_branch(issueId: "ISSUE-1")

# 커밋 메시지 생성 (staged 변경사항 자동 수집)
junflow_generate_commit()

# 코드 리뷰
junflow_review_code(focusAreas: ["security", "performance"])

# 현재 상태 확인
junflow_status()
```
