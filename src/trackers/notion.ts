import { Client } from '@notionhq/client';
import type { AgentError } from '../agents/types.js';
import type { IssueTracker, TrackerIssue } from './types.js';

// Notion 속성 타입 (SDK 타입을 직접 참조하지 않고 최소한만 정의)
interface NotionTitleProperty {
  type: 'title';
  title: Array<{ plain_text: string }>;
}

interface NotionRichTextProperty {
  type: 'rich_text';
  rich_text: Array<{ plain_text: string }>;
}

interface NotionSelectProperty {
  type: 'select';
  select: { name: string } | null;
}

interface NotionStatusProperty {
  type: 'status';
  status: { name: string } | null;
}

interface NotionMultiSelectProperty {
  type: 'multi_select';
  multi_select: Array<{ name: string }>;
}

type NotionProperty =
  | NotionTitleProperty
  | NotionRichTextProperty
  | NotionSelectProperty
  | NotionStatusProperty
  | NotionMultiSelectProperty
  | { type: string };

// notion-field-mapping.md 기반 Notion 속성명 상수
const NOTION_FIELD = {
  TITLE: '이슈',
  STATUS: '상태',
  PRIORITY: '우선순위',
  TYPE: '유형',
  LABELS: '라벨',
  ASSIGNEE: '담당자',
  DESCRIPTION: '설명',
} as const;

export function extractTitle(properties: Record<string, unknown>): string {
  const prop = properties[NOTION_FIELD.TITLE] as NotionTitleProperty | undefined;
  if (!prop || prop.type !== 'title') return '';
  return prop.title[0]?.plain_text ?? '';
}

export function extractRichText(property: unknown): string {
  const prop = property as NotionRichTextProperty | undefined;
  if (!prop || prop.type !== 'rich_text') return '';
  return prop.rich_text.map((r) => r.plain_text).join('');
}

export function extractSelect(property: unknown): string | undefined {
  const prop = property as NotionSelectProperty | NotionStatusProperty | undefined;
  if (!prop) return undefined;
  if (prop.type === 'select') return prop.select?.name ?? undefined;
  if (prop.type === 'status') return prop.status?.name ?? undefined;
  return undefined;
}

export function extractMultiSelect(property: unknown): string[] {
  const prop = property as NotionMultiSelectProperty | undefined;
  if (!prop || prop.type !== 'multi_select') return [];
  return prop.multi_select.map((o) => o.name);
}

function normalizePriority(value: string | undefined): TrackerIssue['priority'] {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === 'low' || lower === 'medium' || lower === 'high' || lower === 'urgent') {
    return lower as TrackerIssue['priority'];
  }
  return undefined;
}

function pageToTrackerIssue(page: Record<string, unknown>): TrackerIssue {
  const properties = page['properties'] as Record<string, unknown>;
  const id = page['id'] as string;
  const url = page['url'] as string | undefined;

  const title = extractTitle(properties);
  const description = extractRichText(properties[NOTION_FIELD.DESCRIPTION]);
  const status = extractSelect(properties[NOTION_FIELD.STATUS]) ?? '';
  const labels = extractMultiSelect(properties[NOTION_FIELD.LABELS]);
  const assigneeRaw = extractRichText(properties[NOTION_FIELD.ASSIGNEE]);
  const assignee = assigneeRaw || undefined;
  const priorityRaw = extractSelect(properties[NOTION_FIELD.PRIORITY]);
  const priority = normalizePriority(priorityRaw);

  // 유형(type)은 labels에 포함시켜 활용
  const typeValue = extractSelect(properties[NOTION_FIELD.TYPE]);
  const allLabels = typeValue ? [typeValue, ...labels] : labels;

  return {
    id,
    title,
    description,
    status,
    labels: allLabels,
    assignee,
    priority,
    url,
    raw: page,
  };
}

export class NotionTracker implements IssueTracker {
  name = 'notion';
  private client: Client;
  private databaseId: string;

  constructor(apiKey: string, databaseId: string) {
    if (!apiKey) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: 'Notion API 키가 설정되지 않았습니다. NOTION_API_KEY 환경변수 또는 config.tracker.notion.apiKey를 설정하세요.',
      };
      throw err;
    }
    this.client = new Client({ auth: apiKey });
    this.databaseId = databaseId;
  }

  async getIssue(issueId: string): Promise<TrackerIssue> {
    // title 속성에서 issueId로 필터 쿼리
    const response = await this.client.databases.query({
      database_id: this.databaseId,
      filter: {
        property: NOTION_FIELD.TITLE,
        title: {
          equals: issueId,
        },
      },
    });

    if (response.results.length === 0) {
      const err: AgentError = {
        code: 'TRACKER_ERROR',
        message: `이슈 '${issueId}'를 Notion DB에서 찾을 수 없습니다. (database_id: ${this.databaseId})`,
      };
      throw err;
    }

    const page = response.results[0] as Record<string, unknown>;
    return pageToTrackerIssue(page);
  }

  async updateIssueStatus(issueId: string, status: string): Promise<void> {
    const issue = await this.getIssue(issueId);
    await this.client.pages.update({
      page_id: issue.id,
      properties: {
        [NOTION_FIELD.STATUS]: {
          status: { name: status },
        },
      },
    });
  }

  async listIssues(filter?: Record<string, unknown>): Promise<TrackerIssue[]> {
    const response = await this.client.databases.query({
      database_id: this.databaseId,
      ...(filter ? { filter: filter as Parameters<Client['databases']['query']>[0]['filter'] } : {}),
    });

    return response.results.map((page) => pageToTrackerIssue(page as Record<string, unknown>));
  }
}
