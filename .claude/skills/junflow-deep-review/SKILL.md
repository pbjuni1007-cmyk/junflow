---
name: junflow-deep-review
description: 멀티모델 합의 기반 심층 코드 리뷰
triggers:
  - 꼼꼼히 리뷰
  - deep review
  - 심층 리뷰
  - 제대로 봐
  - 깊이 리뷰
---

# JunFlow Deep Review

## 사용법
/junflow-deep-review [--staged] [--focus security,performance]

## 동작
1. 현재 변경사항의 diff 수집
2. `junflow review --deep` 실행 (DeepCodeReviewer)
3. 사용 가능한 모든 AI 모델로 독립 리뷰 → ConsensusRunner로 합의
4. 보안/성능/가독성 3관점 통합 결과 표시

## 실행
```bash
junflow review --deep --staged
```

## 일반 리뷰와의 차이
- 일반 `junflow review`: 단일 모델 리뷰
- Deep review: 멀티 프로바이더 병렬 리뷰 → 합의 합성 → 편향 없는 결과
- 단일 프로바이더만 있으면 자동으로 일반 모드로 폴백
