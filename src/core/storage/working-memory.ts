import { DatabaseManager } from './database.js';
import { WorkingMemoryItem, ConversationTurn } from '../types.js';
import { randomUUID } from 'node:crypto';

export class WorkingMemoryManager {
  private db: DatabaseManager;
  private maxTokens: number;

  constructor(db: DatabaseManager, maxTokens: number = 4000) {
    this.db = db;
    this.maxTokens = maxTokens;
  }

  public addTurn(sessionId: string, turn: ConversationTurn): WorkingMemoryItem {
    const tokens = this.estimateTokens(turn.content);
    const now = turn.timestamp || Date.now();
    const id = `wm_${randomUUID()}`;

    const stmt = this.db.prepare(`
      INSERT INTO working_memory (id, session_id, role, content, tokens, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, sessionId, turn.role, turn.content, tokens, now);

    this.enforceTokenBudget(sessionId);

    return {
      id,
      sessionId,
      role: turn.role,
      content: turn.content,
      tokens,
      timestamp: now,
    };
  }

  public getSessionTurns(sessionId: string): WorkingMemoryItem[] {
    const stmt = this.db.prepare(`
      SELECT * FROM working_memory
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(sessionId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      role: String(r.role),
      content: String(r.content),
      tokens: Number(r.tokens) || 0,
      timestamp: Number(r.timestamp) || 0,
    }));
  }

  public getTotalSessionTokens(sessionId: string): number {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(tokens), 0) as total
      FROM working_memory
      WHERE session_id = ?
    `);
    const row = stmt.get(sessionId) as { total: number } | undefined;
    return Number(row?.total) || 0;
  }

  public clearSession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM working_memory WHERE session_id = ?');
    stmt.run(sessionId);
  }

  public enforceTokenBudget(sessionId: string): number {
    let total = this.getTotalSessionTokens(sessionId);
    let evictedCount = 0;

    while (total > this.maxTokens) {
      const oldestStmt = this.db.prepare(`
        SELECT id, tokens FROM working_memory
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT 1
      `);
      const oldest = oldestStmt.get(sessionId) as { id: string; tokens: number } | undefined;
      if (!oldest) break;

      this.db.prepare('DELETE FROM working_memory WHERE id = ?').run(oldest.id);
      total -= Number(oldest.tokens) || 0;
      evictedCount++;
    }

    return evictedCount;
  }

  public estimateTokens(text: string): number {
    if (!text) return 0;
    // Approximates token count: ~4 chars per token for English text
    return Math.max(1, Math.ceil(text.length / 4));
  }
}
