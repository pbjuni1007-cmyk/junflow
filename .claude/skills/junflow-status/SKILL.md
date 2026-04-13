---
name: junflow-status
description: 현재 작업 상태 + Git 정보 확인
triggers:
  - 상태
  - status
  - 현재 상태
  - jf status
  - jf st
---

# JunFlow Status

## 워크플로우

1. `junflow_status` MCP 도구 호출
2. `junflow_get_context` MCP 도구 호출
3. 수집된 데이터를 정리하여 표시

## 출력 형식

```
## JunFlow 상태

브랜치: {branch}
마지막 커밋: {hash} — {message}

이슈: {currentIssue.id} {currentIssue.title} (없으면 생략)

Git 변경사항:
  Staged: N files
  Modified: N files
  Untracked: N files

컨벤션: {commitConvention} ({commitLanguage})
```
