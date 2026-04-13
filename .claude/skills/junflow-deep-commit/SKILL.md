---
name: junflow-deep-commit
description: 멀티앵글 심층 커밋 메시지 생성 (Claude Code 직접 실행)
triggers:
  - 꼼꼼히 커밋
  - deep commit
  - 심층 커밋
  - jf dc
  - jf deep-commit
---

# JunFlow Deep Commit

## 워크플로우

1. `junflow_get_commit_convention` → 컨벤션 확인
2. `junflow_get_staged_diff` → diff 수집 (비어있으면 종료)
3. `junflow_get_context` → 브랜치, 이슈 참조
4. **3각도 독립 생성**:
   - **명확성**: 의도가 즉시 파악되는 간결한 메시지
   - **상세함**: body 포함, 변경 이유/영향 설명
   - **컨벤션**: type/scope 정확, BREAKING CHANGE 명시, 이슈 번호 참조
5. 3각도 장점을 통합한 **최적 메시지** 1개 합성
6. 최적 + 원본 3개 제시 → 사용자 선택
7. `junflow_commit` → 커밋 실행
8. `junflow_session_record` 기록

## 커밋 규칙

Conventional: `type(scope): description` (72자 이하)
Gitmoji: `:emoji: description`
언어: commitLanguage 설정 따름

## 출력 형식

```
--- 최적 메시지 (합성) ---
0. feat(auth): 세션 만료 처리 추가

--- 각도별 원본 ---
1. [명확성] feat(auth): 세션 만료 시 자동 로그아웃
2. [상세함] feat(auth): 세션 만료 처리 (body 포함)
3. [컨벤션] feat(auth/session): Closes #AUTH-123

번호를 선택하세요 (0/1/2/3):
```

## 멀티 CLI 모드 (v0.6.0)

CLI가 사용 가능한 환경에서는 `junflow_run_cli`를 활용하여 다양한 관점의 커밋 메시지를 생성할 수 있다.

### 절차
1. `junflow_get_staged_diff`로 diff 확보
2. `junflow_get_commit_convention`으로 컨벤션 확보
3. `junflow_run_cli`를 호출 (cli: codex):
   - prompt: "다음 diff에 대한 커밋 메시지를 [컨벤션] 형식으로 3개 생성해주세요."
   - context: diff + 컨벤션 정보
4. Codex가 생성한 후보 + Claude 자체 생성 후보를 합산
5. 최적 메시지를 선택하여 사용자에게 제시

### CLI 사용 불가 시
junflow_run_cli 호출이 실패하면 기존 방식(Claude 단독 3앵글)으로 수행한다.
