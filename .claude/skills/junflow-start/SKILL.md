---
name: junflow-start
description: 이슈 기반 개발 시작 - AI로 이슈 분석 후 브랜치 생성
---

# JunFlow Start

## 사용법
/junflow-start <issue-id>

## 동작
1. junflow CLI가 설치되어 있는지 확인
2. `junflow start <issue-id>` 실행
3. 결과를 사용자에게 보여줌

## 실행
```bash
junflow start {issue-id} --dry-run
```

이슈 ID를 지정하지 않으면 사용자에게 물어보세요.
