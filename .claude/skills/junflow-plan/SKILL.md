---
name: junflow-plan
description: 이슈 분석 → 태스크 분해 → 구현 계획 (Claude Code 직접 실행)
triggers:
  - 계획
  - plan
  - 플랜
  - 태스크 분해
  - jf p
  - jf plan
---

# JunFlow Plan

## 워크플로우

1. 이슈 ID 있으면 `junflow_get_issue` 호출, 없으면 사용자에게 작업 설명 요청
2. `junflow_get_context` → 프로젝트 상태 확인
3. 이슈를 분석하여 subtask 목록 생성 (아래 기준)
4. subtask 간 의존성 → 그래프 타입 결정 → 실행 레벨 계산
5. 리스크 평가

## 태스크 분해 기준

- 각 subtask는 독립적으로 완료/검증 가능
- 1 subtask ≈ 1 커밋 크기
- 최소 2개, 최대 8개
- 각각: id, title, type, complexity(low|medium|high), dependsOn[]

## 의존성 그래프
- `independent` — 전부 병렬 가능
- `sequential` — 선형 체인
- `dag` — 일부 병렬, 일부 의존

## 리스크 평가
- 외부 API 의존성, DB 스키마 변경, 하위 호환성, 테스트 커버리지 부족

## 출력 형식

```
## 구현 계획: {이슈 제목}
타입: {type} | 규모: {small|medium|large} | 그래프: {type}

| ID | 제목 | 타입 | 복잡도 | 의존성 |
|----|------|------|--------|--------|
| T1 | ... | feat | low | — |
| T2 | ... | test | low | T1 |

실행 순서:
  Level 1 (병렬): T1, T3
  Level 2: T2

리스크:
  - {리스크}: {대응}
```

## 멀티 CLI 모드 (v0.6.0)

복잡한 이슈에서 Gemini CLI의 웹 검색 능력을 활용하여 계획을 보강할 수 있다.

### 절차
1. 이슈 분석 후 기술 리서치가 필요하다고 판단되면
2. `junflow_run_cli`를 호출 (cli: gemini, role: researcher):
   - prompt: "다음 기술 주제에 대해 최신 베스트 프랙티스와 라이브러리를 조사해주세요: [주제]"
   - timeout: 120
3. Gemini 리서치 결과를 계획에 반영
4. 태스크 분해 시 리서치 결과 기반의 기술 선택 근거 포함

### CLI 사용 불가 시
junflow_run_cli 호출이 실패하면 기존 방식(Claude 단독 계획)으로 수행한다.
