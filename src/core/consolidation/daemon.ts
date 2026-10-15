import { DatabaseManager } from '../storage/database.js';
import { GraphRepository } from '../storage/graph-repo.js';
import { DecayEngine } from './decay-engine.js';
import { EntityDeduplicator } from './deduplicator.js';
import { ConsolidationStats } from '../types.js';

export class ConsolidationDaemon {
  private db: DatabaseManager;
  private graphRepo: GraphRepository;
  private decayEngine: DecayEngine;
  private deduplicator: EntityDeduplicator;
  private intervalTimer?: NodeJS.Timeout;

  constructor(
    db: DatabaseManager,
    graphRepo: GraphRepository,
    decayEngine?: DecayEngine
  ) {
    this.db = db;
    this.graphRepo = graphRepo;
    this.decayEngine = decayEngine || new DecayEngine(db);
    this.deduplicator = new EntityDeduplicator(db, graphRepo);
  }

  /**
   * Runs a complete consolidation cycle:
   * 1. Decay scoring (Ebbinghaus)
   * 2. Pruning stale ephemeral nodes
   * 3. Entity deduplication & alias resolution
   * 4. Temporal relationship cleanup
   */
  public async consolidate(namespace?: string): Promise<ConsolidationStats> {
    const startTime = Date.now();

    // 1. Decay scoring
    const decayResult = this.decayEngine.runDecayCycle(startTime, namespace);

    // 2. Prune low-importance ephemeral memories
    const prunedEntities = this.decayEngine.pruneStaleMemories(namespace);

    // 3. Deduplicate entity aliases
    const deduplicatedCount = this.deduplicator.deduplicate(namespace);

    // 4. Archive expired relations
    let expireSql = `
      UPDATE relations
      SET valid_until = ?
      WHERE valid_until IS NOT NULL AND valid_until < ? AND superseded_by IS NULL
    `;
    const params: unknown[] = [startTime, startTime];
    if (namespace && namespace !== '*') {
      expireSql += ' AND namespace = ?';
      params.push(namespace);
    }
    const expiredRelations = (this.db.prepare(expireSql).run as any)(...params);

    const durationMs = Date.now() - startTime;

    return {
      entitiesScored: decayResult.scoredCount,
      prunedEntities,
      archivedRelations: Number(expiredRelations.changes) || 0,
      deduplicatedCount,
      episodesConsolidated: 0,
      durationMs,
      namespace: namespace || 'default',
    };
  }

  public startBackgroundScheduler(intervalHours: number = 24): void {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.intervalTimer = setInterval(() => {
      this.consolidate().catch((err) => {
        console.error('Error during scheduled consolidation:', err);
      });
    }, intervalMs);
  }

  public stopBackgroundScheduler(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }
}
