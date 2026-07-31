# git-pilot 통합 기록

`git-pilot`은 JunFlow의 초기 실험 저장소였으며, JunFlow가 해당 기능을 이어받아 확장했다. 2026-07-31에 별도 저장소를 정리하면서 `git-pilot`의 전체 Git 이력을 JunFlow에 병합 부모로 연결했다.

## 보존 범위

- 마지막 `git-pilot` 커밋: `823e6fd78866d4f79547b0d219ad52117e512b06`
- 기존 JunFlow 트리를 통합 결과로 유지
- `git-pilot`의 모든 커밋을 `git log --all`과 이 통합 커밋의 두 번째 부모에서 조회 가능
- 열린 GitHub 이슈는 원본 저장소 삭제 전에 JunFlow로 이전

## 주요 이름 변경

| git-pilot | JunFlow |
|---|---|
| `git-pilot start` | `junflow start` |
| `git-pilot commit` | `junflow commit` |
| `git-pilot status` | `junflow status` |
| `.git-pilot.yaml` | JunFlow 설정 체계 |
| `src/utils/diff-truncator.ts` | `src/ai/diff-truncator.ts` |

이 통합은 과거 소스 트리를 현재 루트에 다시 복사하지 않는다. 현재 JunFlow가 후속 구현이므로 최신 파일 구조를 유지하고, 감사와 복구에 필요한 원본 커밋 이력을 연결하는 것이 목적이다.
