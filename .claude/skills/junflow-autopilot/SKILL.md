---
name: junflow-autopilot
description: 이슈 분석부터 검증까지 전체 개발 사이클 자동 실행 (Claude Code 직접 실행)
triggers:
  - autopilot
  - 오토파일럿
  - 전체 사이클
  - jf auto
  - jf autopilot
---

# JunFlow Autopilot

전체 워크플로우를 단계별로 자동 실행합니다.

## Phase 1 — 이슈 분석 + 브랜치 생성

1. 이슈 ID 확인 (`--issue <ID>` 또는 사용자에게 질문)
2. `junflow_get_issue` → 이슈 데이터 수집
3. `junflow_get_commit_convention` → 컨벤션 확인
4. 이슈 분석 (타입, 복잡도, 요구사항)
5. 브랜치 후보 3개 → 사용자 선택 → `junflow_create_branch`

완료 후: "코드 작업 후 다시 호출하세요."

## Phase 2 — 커밋 (staged 변경이 있을 때)

1. `junflow_get_staged_diff` → diff 확인
2. 커밋 메시지 후보 3개 생성 (Conventional Commits)
3. 사용자 선택 → `junflow_commit`

## Phase 3 — 리뷰 (커밋 후 자동)

1. `junflow_get_branch_diff` → 전체 변경 diff
2. security/performance/readability/testing 4관점 리뷰
3. critical이 있으면 수정 권장, 없으면 완료

## 단계 건너뜀 규칙
- Phase 3 실패 → 경고만 표시, 중단하지 않음
- 각 단계 결과를 `junflow_session_record`로 기록

## 멀티 CLI 모드 (v0.6.0)

Phase 2(구현)에서 Codex CLI에 구현 작업을 위임할 수 있다.

### 절차
1. Phase 1(이슈 분석)은 Claude가 직접 수행
2. Phase 2(구현)에서 `junflow_run_cli`를 호출 (cli: codex, role: executor):
   - prompt: 이슈 분석 결과 + 구현 요구사항
   - context: 관련 파일 내용
   - timeout: 600 (구현 작업은 시간이 더 필요)
3. Phase 3(리뷰)에서 `junflow_run_cli`를 호출 (cli: gemini, role: researcher):
   - prompt: 구현 결과에 대한 보안/성능 리뷰
   - context: 구현된 코드 diff
4. Claude가 최종 검증 + 커밋

### CLI 사용 불가 시
junflow_run_cli 호출이 실패하면 기존 방식(Claude 단독 전체 사이클)으로 수행한다.
