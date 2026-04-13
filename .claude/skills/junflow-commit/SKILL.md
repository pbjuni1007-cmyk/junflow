---
name: junflow-commit
description: AI 기반 커밋 메시지 생성 (Claude Code 직접 실행)
triggers:
  - 커밋
  - commit
  - 커밋 메시지
  - jf commit
  - jf c
---

# JunFlow Commit

## 워크플로우

1. `junflow_get_commit_convention` MCP 도구 호출 → `{ commitConvention, commitLanguage }` 확인
2. `junflow_get_staged_diff` MCP 도구 호출 → `{ diff, wasTruncated, omittedFiles }` 확인
   - diff가 비어있으면: "staged 변경사항이 없습니다. `git add`로 파일을 스테이지하세요." 출력 후 종료
3. `junflow_get_context` MCP 도구 호출 → 현재 브랜치, currentIssue 참조
4. diff와 컨텍스트를 분석하여 커밋 메시지 후보 3개 생성 (아래 규칙 적용)
5. 후보 3개를 번호와 함께 제시, 사용자에게 선택 요청
6. 사용자가 선택하면 `junflow_commit` MCP 도구 호출 → `{ message }` 전달
7. `junflow_session_record` MCP 도구 호출 → `{ agentName: "CommitWriter", command: "commit", success: true }`

## 커밋 메시지 규칙

### Conventional Commits (`commitConvention: "conventional"`)
```
type(scope): description
```
- **type**: feat | fix | refactor | chore | docs | test | style | perf
- **scope**: 변경된 모듈/영역 (선택, 소문자)
- **description**: 명령형 현재 시제, 72자 이하, 마침표 없음
- **body** (선택): 변경 이유, 빈 줄로 구분

### Gitmoji (`commitConvention: "gitmoji"`)
feat→✨, fix→🐛, refactor→♻️, chore→🔧, docs→📝, test→✅, style→💄, perf→⚡

### 언어
- `commitLanguage: "ko"` → 한국어 (기본)
- `commitLanguage: "en"` → 영어

### 후보 3개 전략
- **1**: 간결한 핵심 요약 (한 줄)
- **2**: scope 포함, 구체적 표현
- **3**: body 포함, 변경 이유/맥락 설명
