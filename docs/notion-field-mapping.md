# Notion Issue Tracker - 필드 매핑

## DB 정보
- **Database ID**: `31d739cc-9a3f-81e4-a604-daf134809832`
- **Data Source ID**: `31d739cc-9a3f-813e-aa12-000b3ba787fc`
- **URL**: https://www.notion.so/31d739cc9a3f81e4a604daf134809832
- **위치**: 1% 취준생 > JunFlow - Issue Tracker > Issues

## 필드 매핑 테이블

| Notion 속성 | Notion 타입 | TrackerIssue 필드 | TS 타입 | 변환 로직 |
|---|---|---|---|---|
| `이슈` | title | `title` | `string` | `title[0].plain_text` |
| `상태` | status | `status` | `string` | `status.name` |
| `우선순위` | select | `priority` | `'low' \| 'medium' \| 'high' \| 'urgent'` | `select.name.toLowerCase()` |
| `유형` | select | `type` | `'feature' \| 'bugfix' \| 'refactor' \| 'chore' \| 'docs'` | `select.name` |
| `라벨` | multi_select | `labels` | `string[]` | `multi_select.map(o => o.name)` |
| `담당자` | rich_text | `assignee` | `string \| undefined` | `rich_text[0]?.plain_text` |
| `설명` | rich_text | `description` | `string` | `rich_text.map(r => r.plain_text).join('')` |

## Status 옵션
| 값 | 설명 |
|---|---|
| `Not started` | 시작 전 (기본값) |
| `In progress` | 진행 중 |
| `Done` | 완료 |

## 우선순위 옵션
| 값 | 색상 |
|---|---|
| `Low` | gray |
| `Medium` | yellow |
| `High` | orange |
| `Urgent` | red |

## 유형 옵션
| 값 | 색상 |
|---|---|
| `feature` | blue |
| `bugfix` | red |
| `refactor` | purple |
| `chore` | gray |
| `docs` | green |

## 라벨 옵션
| 값 | 색상 |
|---|---|
| `frontend` | blue |
| `backend` | green |
| `infra` | orange |
| `testing` | yellow |
| `ui/ux` | pink |

## 매핑 불가 속성 처리
- Notion의 `created_time`, `last_edited_time` 등 시스템 속성은 `raw` 필드에 보존
- 향후 `dueDate`, `estimate` 등 필드 추가 시 DB 속성 추가 + 매핑 테이블 업데이트
