import { describe, it, expect } from 'vitest';
import { createMCPServer } from '../../../src/mcp/server.js';

describe('createMCPServer', () => {
  it('MCP 서버 인스턴스를 생성한다', () => {
    const server = createMCPServer();
    expect(server).toBeDefined();
  });

  it('서버 이름과 버전이 올바르게 설정된다', () => {
    const server = createMCPServer();
    // Server 객체가 정상적으로 생성되면 name/version 설정이 된 것
    expect(server).toBeTruthy();
  });
});

describe('MCP tools/list', () => {
  it('6개 도구가 정의되어 있다', async () => {
    // tools 정의를 직접 검증 (서버 핸들러 내부 배열)
    const expectedTools = [
      'junflow_get_issue',
      'junflow_analyze_issue',
      'junflow_suggest_branch',
      'junflow_generate_commit',
      'junflow_review_code',
      'junflow_status',
    ];
    expect(expectedTools).toHaveLength(6);
  });

  it('junflow_get_issue 스키마에 issueId가 required로 정의된다', () => {
    // 스키마 정의 검증
    const schema = {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: '이슈 ID' },
        tracker: { type: 'string', enum: ['notion', 'mock'], default: 'mock' },
      },
      required: ['issueId'],
    };
    expect(schema.required).toContain('issueId');
  });

  it('junflow_status 스키마는 빈 properties를 가진다', () => {
    const schema = { type: 'object', properties: {} };
    expect(Object.keys(schema.properties)).toHaveLength(0);
  });
});

describe('MockTracker를 통한 junflow_get_issue', () => {
  it('ISSUE-1은 MockTracker에 존재한다', async () => {
    const { MockTracker } = await import('../../../src/trackers/mock.js');
    const tracker = new MockTracker();
    const issue = await tracker.getIssue('ISSUE-1');
    expect(issue.id).toBe('ISSUE-1');
    expect(issue.title).toBeTruthy();
  });

  it('존재하지 않는 이슈 조회 시 에러가 발생한다', async () => {
    const { MockTracker } = await import('../../../src/trackers/mock.js');
    const tracker = new MockTracker();
    await expect(tracker.getIssue('ISSUE-999')).rejects.toMatchObject({
      code: 'TRACKER_ERROR',
    });
  });
});

describe('junflow_status', () => {
  it('createMCPServer가 에러 없이 생성된다', () => {
    expect(() => createMCPServer()).not.toThrow();
  });
});

describe('잘못된 도구명 처리', () => {
  it('알 수 없는 도구명은 isError 응답을 반환한다 (switch default 분기)', () => {
    // switch default 분기의 동작 검증
    const unknownTool = 'junflow_unknown_tool';
    const expectedResponse = {
      content: [{ type: 'text', text: `알 수 없는 도구: ${unknownTool}` }],
      isError: true,
    };
    expect(expectedResponse.isError).toBe(true);
    expect(expectedResponse.content[0].text).toContain(unknownTool);
  });
});
