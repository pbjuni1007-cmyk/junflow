---
name: junflow-commit
description: AI 기반 커밋 메시지 생성
---

# JunFlow Commit

## 사용법
/junflow-commit [options]

## 동작
1. staged 변경사항 확인
2. `junflow commit` 실행하여 AI 커밋 메시지 생성
3. 사용자에게 후보 제시

## 실행
```bash
junflow commit --dry-run
```

--auto 옵션으로 자동 선택하려면 사용자에게 확인 후 실행하세요.
