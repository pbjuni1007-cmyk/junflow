import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { Session, AgentCallRecord, SessionSummary } from './types.js';

const SESSIONS_DIR = '.junflow/sessions';
const CURRENT_SESSION_FILE = '.junflow/current-session.json';

export class SessionManager {
  private session: Session | null = null;

  async start(workingDir: string): Promise<Session> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const session: Session = {
      id,
      startedAt: now,
      status: 'active',
      workingDir,
      agentCalls: [],
      tokenUsage: {
        total: 0,
        byAgent: {},
      },
    };

    this.session = session;
    await this._persist(workingDir);
    return session;
  }

  async getCurrent(): Promise<Session | null> {
    if (this.session) return this.session;

    const cwd = process.cwd();
    const filePath = path.join(cwd, CURRENT_SESSION_FILE);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as Session;
      if (session.status === 'active') {
        this.session = session;
        return session;
      }
      return null;
    } catch {
      return null;
    }
  }

  async recordAgentCall(record: AgentCallRecord): Promise<void> {
    const session = this.session ?? await this.getCurrent();
    if (!session) return;

    session.agentCalls.push(record);

    const tokens = record.tokensUsed ?? 0;
    session.tokenUsage.total += tokens;

    if (!session.tokenUsage.byAgent[record.agentName]) {
      session.tokenUsage.byAgent[record.agentName] = { calls: 0, tokens: 0 };
    }
    session.tokenUsage.byAgent[record.agentName]!.calls += 1;
    session.tokenUsage.byAgent[record.agentName]!.tokens += tokens;

    this.session = session;
    await this._persist(session.workingDir);
  }

  async attachIssue(issue: Session['issue']): Promise<void> {
    const session = this.session ?? await this.getCurrent();
    if (!session) return;

    session.issue = issue;
    this.session = session;
    await this._persist(session.workingDir);
  }

  async end(status: 'completed' | 'interrupted' = 'completed'): Promise<void> {
    const session = this.session ?? await this.getCurrent();
    if (!session) return;

    session.status = status;
    session.endedAt = new Date().toISOString();
    this.session = session;

    await this._persist(session.workingDir);

    // current-session.json 삭제
    const currentPath = path.join(session.workingDir, CURRENT_SESSION_FILE);
    await fs.unlink(currentPath).catch(() => {});

    this.session = null;
  }

  async listSessions(limit = 10): Promise<SessionSummary[]> {
    const cwd = process.cwd();
    const sessionsDir = path.join(cwd, SESSIONS_DIR);

    let files: string[];
    try {
      files = await fs.readdir(sessionsDir);
    } catch {
      return [];
    }

    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const sessions: Session[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(sessionsDir, file), 'utf-8');
        sessions.push(JSON.parse(content) as Session);
      } catch {
        // 읽기 실패한 세션 파일은 무시
      }
    }

    // 현재 활성 세션도 포함
    const current = await this.getCurrent();
    if (current) {
      const alreadyIncluded = sessions.some((s) => s.id === current.id);
      if (!alreadyIncluded) {
        sessions.push(current);
      }
    }

    sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    return sessions.slice(0, limit).map((s) => this._toSummary(s));
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const cwd = process.cwd();

    // 현재 세션 확인
    const current = await this.getCurrent();
    if (current && current.id === sessionId) return current;

    // 파일에서 조회
    const filePath = path.join(cwd, SESSIONS_DIR, `${sessionId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Session;
    } catch {
      return null;
    }
  }

  async getLastIssue(): Promise<Session['issue'] | null> {
    const sessions = await this.listSessions(20);

    for (const summary of sessions) {
      const session = await this.getSession(summary.id);
      if (session?.issue) {
        return session.issue;
      }
    }

    return null;
  }

  private async _persist(workingDir: string): Promise<void> {
    if (!this.session) return;

    const sessionsDir = path.join(workingDir, SESSIONS_DIR);
    await fs.mkdir(sessionsDir, { recursive: true });

    // 세션 파일 저장 (.junflow/sessions/{id}.json)
    const sessionFilePath = path.join(sessionsDir, `${this.session.id}.json`);
    await fs.writeFile(sessionFilePath, JSON.stringify(this.session, null, 2), 'utf-8');

    // 활성 세션이면 current-session.json도 업데이트
    if (this.session.status === 'active') {
      const currentPath = path.join(workingDir, CURRENT_SESSION_FILE);
      await fs.mkdir(path.dirname(currentPath), { recursive: true });
      await fs.writeFile(currentPath, JSON.stringify(this.session, null, 2), 'utf-8');
    }
  }

  private _toSummary(session: Session): SessionSummary {
    return {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      status: session.status,
      branch: session.branch,
      issueTitle: session.issue?.title,
      totalAgentCalls: session.agentCalls.length,
      totalTokens: session.tokenUsage.total,
    };
  }
}

export const sessionManager = new SessionManager();
