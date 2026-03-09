---
name: junflow-review
description: AI 코드 리뷰
---

# JunFlow Review

## 사용법
/junflow-review [--focus security,performance]

## 동작
1. 현재 변경사항의 diff 수집
2. `junflow review` 실행하여 AI 코드 리뷰
3. severity별로 결과 표시

## 실행
```bash
junflow review --staged
```

--focus 옵션으로 특정 영역에 집중할 수 있습니다.
