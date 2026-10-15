import { DatabaseManager } from './database.js';
import { Episode, ConversationTurn } from '../types.js';
import { randomUUID } from 'node:crypto';

export class EpisodicRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  public createEpisode(
    input: Omit<Episode, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
  ): Episode {
    const id = input.id || `ep_${randomUUID()}`;
    const now = input.createdAt || Date.now();
    const rawTurns = input.rawTurns || [];
    const importance = input.importance !== undefined ? input.importance : 0.5;
    const outcome = input.outcome || 'SUCCESS';

    const stmt = this.db.prepare(`
      INSERT INTO episodes (
        id, session_id, summary, raw_turns, importance, outcome, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.sessionId,
      input.summary,
      JSON.stringify(rawTurns),
      importance,
      outcome,
      now
    );

    this.insertFts(id, input.sessionId, input.summary);

    return {
      id,
      sessionId: input.sessionId,
      summary: input.summary,
      rawTurns,
      importance,
      outcome,
      createdAt: now,
    };
  }

  public getEpisodeById(id: string): Episode | null {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapEpisodeRow(row);
  }

  public listEpisodes(options?: {
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): Episode[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT * FROM episodes
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const rows = (this.db.prepare(sql).all as any)(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapEpisodeRow(r));
  }

  public deleteEpisode(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM episodes WHERE id = ?');
    const result = stmt.run(id);
    this.deleteFts(id);
    return (result.changes ?? 0) > 0;
  }

  public searchEpisodesFts(
    query: string,
    limit: number = 10
  ): Array<{ episode: Episode; rank: number }> {
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (!cleanQuery) return [];

    const ftsQuery = cleanQuery
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => `"${w}"*`)
      .join(' OR ');

    if (!ftsQuery) return [];

    try {
      const sql = `
        SELECT f.episode_id, bm25(fts_episodes) as rank, e.*
        FROM fts_episodes f
        JOIN episodes e ON f.episode_id = e.id
        WHERE fts_episodes MATCH ?
        ORDER BY rank ASC
        LIMIT ?
      `;

      const rows = this.db.prepare(sql).all(ftsQuery, limit) as Record<string, unknown>[];
      return rows.map((r) => ({
        episode: this.mapEpisodeRow(r),
        rank: Math.abs(Number(r.rank) || 0),
      }));
    } catch {
      const fallbackSql = `
        SELECT * FROM episodes
        WHERE LOWER(summary) LIKE LOWER(?)
        ORDER BY created_at DESC
        LIMIT ?
      `;
      const searchPattern = `%${cleanQuery}%`;
      const rows = this.db.prepare(fallbackSql).all(searchPattern, limit) as Record<string, unknown>[];
      return rows.map((r) => ({
        episode: this.mapEpisodeRow(r),
        rank: 1.0,
      }));
    }
  }

  private insertFts(id: string, sessionId: string, summary: string): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO fts_episodes (episode_id, session_id, summary)
        VALUES (?, ?, ?)
      `);
      stmt.run(id, sessionId, summary);
    } catch {
      // Ignore duplicates
    }
  }

  private deleteFts(id: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM fts_episodes WHERE episode_id = ?');
      stmt.run(id);
    } catch {
      // Ignore
    }
  }

  private mapEpisodeRow(r: Record<string, unknown>): Episode {
    let rawTurns: ConversationTurn[] = [];
    if (typeof r.raw_turns === 'string') {
      try {
        rawTurns = JSON.parse(r.raw_turns);
      } catch {
        rawTurns = [];
      }
    }

    return {
      id: String(r.id),
      sessionId: String(r.session_id),
      summary: String(r.summary),
      rawTurns,
      importance: Number(r.importance) || 0.5,
      outcome: String(r.outcome),
      createdAt: Number(r.created_at) || Date.now(),
    };
  }
}
