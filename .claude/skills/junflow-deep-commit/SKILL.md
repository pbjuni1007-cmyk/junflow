---
name: junflow-deep-commit
description: 멀티모델 합의 기반 커밋 메시지 생성
triggers:
  - 꼼꼼히 커밋
  - deep commit
  - 합의 커밋
  - 심층 커밋
---

# JunFlow Deep Commit

## 사용법
/junflow-deep-commit

## 동작
1. staged 변경사항의 diff 수집
2. `junflow commit --deep` 실행 (DeepCommitWriter)
3. 사용 가능한 모든 AI 모델로 독립 생성 → ConsensusRunner로 합의
4. 최적 커밋 메시지 + 대안 표시

## 실행
```bash
junflow commit --deep
```

## 일반 커밋과의 차이
- 일반 `junflow commit`: 단일 모델이 3개 후보 생성
- Deep commit: 멀티 프로바이더가 각자 생성 → 합의하여 최적 메시지 도출
- 단일 프로바이더만 있으면 자동으로 일반 모드로 폴백
