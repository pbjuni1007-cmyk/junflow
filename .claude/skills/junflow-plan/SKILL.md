---
name: junflow-plan
description: 이슈 분석 → 태스크 분해 → 구현 계획
triggers:
  - 계획
  - plan
  - 플랜
  - 태스크 분해
  - 작업 분해
---

# JunFlow Plan

## 사용법
/junflow-plan <이슈 제목 또는 설명>

## 동작
1. 이슈/작업 설명을 PlanAgent에 전달
2. AI가 요구사항 분석 → 태스크 분해 → 의존성 파악 → 리스크 평가
3. 실행 가능한 구현 계획 출력

## 실행
```bash
junflow plan --title "인증 시스템 리팩토링" --description "JWT → 세션 기반으로 전환"
```

## 출력 예시
- summary: 전체 접근 방식 요약
- tasks: ID, 제목, 설명, 타입, 우선순위, 복잡도, 의존성
- risks: 잠재적 위험 요소
- estimatedScope: small / medium / large
