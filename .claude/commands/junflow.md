# JunFlow CLI 통합

JunFlow는 AI 기반 개발 워크플로우 자동화 도구입니다.

## 사용 가능한 명령어

- `/junflow-start <issue-id>` - 이슈 분석 + 브랜치 생성
- `/junflow-commit` - AI 커밋 메시지 생성
- `/junflow-review` - AI 코드 리뷰
- `/junflow-status` - 작업 상태 확인

## 설치 확인
```bash
junflow --version
```

설치되어 있지 않다면:
```bash
cd ~/projects/junflow && npm link
```

## 초기 설정
```bash
junflow init
```
