---
name: junflow-deep-review
description: 3관점 심층 코드 리뷰 (Claude Code 직접 실행)
triggers:
  - 꼼꼼히 리뷰
  - deep review
  - 심층 리뷰
  - jf dr
  - jf deep-review
---

# JunFlow Deep Review

## 워크플로우

1. diff 수집: `junflow_get_staged_diff` 또는 `junflow_get_branch_diff` MCP 도구
2. `junflow_get_context` → 브랜치, 이슈 컨텍스트
3. **3관점 독립 분석** (동일 diff를 각 관점에서):
   - **Security**: 인증/인가, XSS, SQL 인젝션, 민감정보, 입력값 검증
   - **Performance**: N+1 쿼리, 메모리 누수, 캐시, 알고리즘 복잡도
   - **Readability**: 함수 분리, 명명, 중복, 깊은 중첩, 일관성
4. 3관점 findings 통합, 중복 제거, 우선순위 정렬
5. `junflow_session_record` 기록

## Severity
- `critical` — 즉시 수정 (보안 취약점, 심각한 성능)
- `warning` — 수정 권장
- `suggestion` — 개선 아이디어
- `praise` — 우수한 코드

## 출력 형식

```
## 심층 코드 리뷰 (Score: N/10)
Security: N/10 | Performance: N/10 | Readability: N/10

### [Security] Critical
- **file:line** — message → suggestion

### [Performance] Warning
...

일반 리뷰 대비 추가 발견: N건
```

## 멀티 CLI 모드 (v0.6.0)

CLI가 사용 가능한 환경에서는 `junflow_run_consensus`를 활용하여 더 깊은 리뷰를 수행할 수 있다.

### 절차
1. `junflow_get_staged_diff` 또는 `junflow_get_branch_diff`로 diff 확보
2. `junflow_run_consensus`를 호출:
   - prompt: "다음 코드 변경사항을 리뷰해주세요. 버그, 보안 취약점, 성능 이슈, 코드 품질을 중심으로 분석하세요."
   - context: diff 내용
3. Codex 결과 (구현 품질) + Gemini 결과 (보안/성능) + Claude 자체 분석을 종합
4. 최종 리뷰를 3관점(Security/Performance/Readability) 형식으로 출력

### CLI 사용 불가 시
junflow_run_consensus 호출이 실패하면 기존 방식(Claude 단독 3관점)으로 수행한다.
멀티 CLI는 품질 향상 수단이지, 필수 의존성이 아니다.
