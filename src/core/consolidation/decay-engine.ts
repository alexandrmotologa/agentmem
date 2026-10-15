import { DatabaseManager } from '../storage/database.js';
import { EntityNode } from '../types.js';

export interface DecayConfig {
  halfLifeDays?: number; // Base memory half-life in days (default 7)
  pruneThreshold?: number; // Retention below which ephemeral memories are pruned (default 0.15)
}

export class DecayEngine {
  private db: DatabaseManager;
  private halfLifeDays: number;
  private pruneThreshold: number;

  constructor(db: DatabaseManager, config?: DecayConfig) {
    this.db = db;
    this.halfLifeDays = config?.halfLifeDays ?? 7;
    this.pruneThreshold = config?.pruneThreshold ?? 0.15;
  }

  /**
   * Ebbinghaus forgetting curve computation:
   * R = exp(-delta_t / S)
   * where S = S0 * (1 + ln(1 + access_count)) * importance_score
   */
  public calculateRetention(
    lastRecalledAt: number,
    accessCount: number,
    importanceScore: number,
    now: number = Date.now()
  ): number {
    // If memory is of paramount importance (>= 0.95), it essentially never decays
    if (importanceScore >= 0.95) {
      return 1.0;
    }

    const elapsedMs = Math.max(0, now - lastRecalledAt);
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

    // Stability S in days
    const stabilityMultiplier = 1 + Math.log(1 + accessCount);
    const stability = Math.max(0.5, this.halfLifeDays * stabilityMultiplier * importanceScore);

    const retention = Math.exp(-elapsedDays / stability);
    return Math.max(0.01, Math.min(1.0, Math.round(retention * 1000) / 1000));
  }

  /**
   * Runs decay calculations across all active entities and updates decay_retention in the DB.
   * Returns count of updated entities and count of entities marked below prune threshold.
   */
  public runDecayCycle(
    now: number = Date.now(),
    namespace?: string
  ): {
    scoredCount: number;
    pruneCandidateCount: number;
  } {
    let sql = 'SELECT id, last_recalled_at, access_count, importance_score FROM entities WHERE is_archived = 0';
    const params: unknown[] = [];
    if (namespace && namespace !== '*') {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }

    const entities = (this.db.prepare(sql).all as any)(...params) as Array<{
      id: string;
      last_recalled_at: number;
      access_count: number;
      importance_score: number;
    }>;

    let pruneCandidateCount = 0;
    const updateStmt = this.db.prepare('UPDATE entities SET decay_retention = ? WHERE id = ?');

    this.db.transaction(() => {
      for (const ent of entities) {
        const retention = this.calculateRetention(
          Number(ent.last_recalled_at),
          Number(ent.access_count),
          Number(ent.importance_score),
          now
        );

        updateStmt.run(retention, ent.id);

        if (retention < this.pruneThreshold && Number(ent.importance_score) < 0.6) {
          pruneCandidateCount++;
        }
      }
    });

    return {
      scoredCount: entities.length,
      pruneCandidateCount,
    };
  }

  /**
   * Prunes low-retention, low-importance ephemeral memories by setting is_archived = 1.
   */
  public pruneStaleMemories(namespace?: string): number {
    let sql = `
      UPDATE entities
      SET is_archived = 1
      WHERE decay_retention < ?
        AND importance_score < 0.6
        AND is_archived = 0
    `;
    const params: unknown[] = [this.pruneThreshold];
    if (namespace && namespace !== '*') {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }

    const pruneStmt = this.db.prepare(sql);
    const result = (pruneStmt.run as any)(...params);
    return Number(result.changes) || 0;
  }
}
