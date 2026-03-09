# Claude Code + JunFlow 통합 가이드

Claude Code의 커스텀 스킬 시스템을 통해 JunFlow CLI를 `/junflow-*` 명령어로 바로 호출할 수 있습니다.

## 스킬 설치

프로젝트 `.claude/skills/` 디렉토리가 이미 포함되어 있습니다. Claude Code가 프로젝트를 열면 자동으로 인식합니다.

다른 프로젝트에서 사용하려면 `.claude/` 디렉토리를 복사하세요:

```bash
cp -r ~/projects/junflow/.claude /your/project/.claude
```

## 사전 요구사항

JunFlow CLI가 설치되어 있어야 합니다:

```bash
# 전역 설치
npm install -g junflow

# 또는 로컬 개발 모드
cd ~/projects/junflow && npm link
```

초기 설정:

```bash
junflow init
```

## 스킬 사용 예시

### `/junflow-start <issue-id>`

이슈를 분석하고 개발 브랜치를 생성합니다.

```
/junflow-start PROJ-42
```

Claude Code가 실행하는 내용:
1. `junflow start PROJ-42 --dry-run` 으로 분석 결과 미리보기
2. 브랜치 후보 3개 제시
3. 선택한 브랜치로 `junflow start PROJ-42` 실행

### `/junflow-commit`

staged 변경사항을 분석하여 AI 커밋 메시지 후보를 생성합니다.

```
/junflow-commit
```

자동 커밋이 필요하면:

```
/junflow-commit --auto
```

Claude Code가 실행하는 내용:
1. `junflow commit --dry-run` 으로 메시지 후보 생성
2. 3개 후보 제시 후 선택 요청
3. 확정되면 `junflow commit --auto` 실행

### `/junflow-review`

현재 변경사항 전체 또는 staged 파일만 AI 리뷰합니다.

```
/junflow-review
```

특정 영역에 집중하려면:

```
/junflow-review --focus security,performance
```

Claude Code가 실행하는 내용:
1. `junflow review --staged` 또는 `junflow review` 실행
2. severity별(CRITICAL / WARNING / SUGGESTION / PRAISE) 결과 표시

### `/junflow-status`

현재 브랜치, 활성 이슈, Git 상태, 세션 토큰 사용량을 표시합니다.

```
/junflow-status
```

## 전형적인 워크플로우

```
# 1. 이슈 받기
/junflow-start PROJ-42

# 2. 코드 작성 (Claude Code와 함께)
# ... 파일 편집 ...

# 3. 변경사항 검토
/junflow-review --focus security

# 4. 커밋
git add src/
/junflow-commit

# 5. 상태 확인
/junflow-status
```

## 커스텀 확장

### 새 스킬 추가

`.claude/skills/<skill-name>/SKILL.md` 파일을 생성합니다:

```markdown
---
name: junflow-custom
description: 커스텀 JunFlow 작업
---

# 스킬 이름

## 실행
```bash
junflow <your-command>
```
```

### 기존 스킬 수정

`.claude/skills/` 디렉토리의 각 `SKILL.md`를 직접 편집합니다.
예를 들어 `junflow-review`에서 기본 집중 영역을 변경하려면:

```markdown
## 실행
```bash
junflow review --staged --focus security,performance
```
```

## 옵션 참고

| 명령어 | 주요 옵션 |
|--------|-----------|
| `junflow start` | `--dry-run`, `--no-branch`, `--tracker notion\|mock` |
| `junflow commit` | `--auto`, `--all`, `--dry-run`, `--lang ko\|en` |
| `junflow review` | `--staged`, `--base <branch>`, `--focus <areas...>` |
| `junflow status` | (옵션 없음) |
