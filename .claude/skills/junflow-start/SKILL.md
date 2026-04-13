---
name: junflow-start
description: 이슈 기반 개발 시작 - 이슈 분석 후 브랜치 생성 (Claude Code 직접 실행)
triggers:
  - 시작
  - start
  - 이슈 시작
  - 개발 시작
  - jf start
  - jf s
---

# JunFlow Start

## 워크플로우

1. 이슈 ID 확인 (인자에서 추출, 없으면 사용자에게 질문)
2. `junflow_get_issue` MCP 도구 호출 → `{ id, title, description, status, labels, priority }`
3. `junflow_get_commit_convention` MCP 도구 호출 → `{ branchConvention }`
4. 이슈 분석: 타입, 복잡도, 핵심 요구사항, 제안 접근법
5. 브랜치 이름 후보 3개 생성 → 사용자 선택
6. `junflow_create_branch` MCP 도구 호출
7. `junflow_session_record` 호출

## 이슈 타입 → 브랜치 prefix

| 타입 | prefix | 판단 기준 |
|------|--------|-----------|
| feature | `feature/` | 새 기능, labels에 "feature"/"enhancement" |
| bugfix | `fix/` | 버그, labels에 "bug" |
| refactor | `refactor/` | 구조 개선 |
| chore | `chore/` | 설정/빌드 |
| docs | `docs/` | 문서 |

## 브랜치 이름 규칙
- 소문자, 하이픈 구분, 최대 60자
- branchConvention 템플릿 우선: `{type}/{issueId}-{description}`
- 이슈 번호 포함 권장

## 출력 형식

```
이슈 분석:
- 제목: {title}
- 타입: {type} | 복잡도: {low|medium|high}
- 핵심 요구사항: ...
- 제안 접근법: ...

브랜치 후보:
1. feature/PROJ-42-add-login
2. feature/PROJ-42-implement-user-auth
3. feature/login-session

번호를 선택하세요:
```
