---
name: junflow-review
description: AI 코드 리뷰 (Claude Code 직접 실행)
triggers:
  - 리뷰
  - review
  - 코드 리뷰
  - 봐줘
  - 검토
  - jf review
  - jf r
---

# JunFlow Review

## 워크플로우

1. 인자 파싱:
   - `--staged` 또는 인자 없음 → staged diff
   - `--base [branch]` → 브랜치 diff
   - `--focus security,performance` → 특정 영역 집중
2. diff 수집:
   - staged → `junflow_get_staged_diff` MCP 도구
   - branch → `junflow_get_branch_diff` MCP 도구
   - 비어있으면 종료
3. `junflow_get_context` MCP 도구 호출 → 브랜치, 이슈 컨텍스트
4. 아래 기준으로 리뷰 수행
5. `junflow_session_record` 호출 → `{ agentName: "CodeReviewer", command: "review", success: true }`

## 리뷰 기준

| 영역 | 확인 항목 |
|------|-----------|
| **security** | 인증/인가 누락, SQL 인젝션, XSS, 민감정보 노출, 입력값 검증 |
| **performance** | N+1 쿼리, 불필요한 반복, 메모리 누수, 캐시 미활용 |
| **readability** | 함수 길이, 변수명, 중복 코드, 복잡도 |
| **testing** | 커버리지, 엣지케이스, 테스트 독립성 |

## Severity
- `critical` — 배포 전 반드시 수정 (보안, 데이터 손실)
- `warning` — 수정 권장 (성능, 유지보수)
- `suggestion` — 개선 아이디어
- `praise` — 잘 작성된 코드

## 종합 점수: 1-10점

## 출력 형식

```
## 코드 리뷰 (Score: N/10)
브랜치: {branch} | 변경 파일: N개

### Critical
- **file:line** — message → 수정 제안: suggestion

### Warning / Suggestion / Praise (해당 있는 것만)

요약: 전체 평가 1-2문장
```
