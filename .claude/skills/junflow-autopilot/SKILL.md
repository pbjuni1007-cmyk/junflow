---
name: junflow-autopilot
description: 이슈 분석부터 검증까지 전체 개발 사이클 자동 실행
triggers:
  - autopilot
  - 오토파일럿
  - 전체 사이클
  - 처음부터 끝까지
---

# JunFlow Autopilot

## 사용법
/junflow-autopilot --issue <ISSUE-ID>

## 동작
1. 이슈 분석 (IssueAnalyzer)
2. 브랜치 생성 (BranchNamer)
3. 커밋 메시지 생성 (CommitWriter)
4. 코드 리뷰 (CodeReviewer) — 선택적
5. 품질 검증 (Verifier) — 선택적

DAG 기반 워크플로우로 단계별 자동 실행.

## 실행
```bash
junflow autopilot --issue ISSUE-123
```

## 특징
- 비필수 단계(review, verify) 실패 시 건너뛰고 계속 진행
- 각 단계 결과가 다음 단계 입력으로 자동 전달
- 전체 진행 상태를 세션에 기록
