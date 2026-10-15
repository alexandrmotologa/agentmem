import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/core/storage/database.js';
import { GraphRepository } from '../src/core/storage/graph-repo.js';
import { DecayEngine } from '../src/core/consolidation/decay-engine.js';
import { EntityDeduplicator } from '../src/core/consolidation/deduplicator.js';

describe('Consolidation & Decay Engine', () => {
  let db: DatabaseManager;
  let repo: GraphRepository;
  let decay: DecayEngine;
  let deduplicator: EntityDeduplicator;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    repo = new GraphRepository(db);
    decay = new DecayEngine(db, { halfLifeDays: 7, pruneThreshold: 0.2 });
    deduplicator = new EntityDeduplicator(db, repo);
  });

  afterEach(() => {
    db.close();
  });

  it('keeps high-importance memories from decaying', () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Critical constraint with importance 0.98
    const retentionCritical = decay.calculateRetention(thirtyDaysAgo, 0, 0.98, now);
    expect(retentionCritical).toBe(1.0);

    // Ephemeral concept with importance 0.4
    const retentionEphemeral = decay.calculateRetention(thirtyDaysAgo, 0, 0.4, now);
    expect(retentionEphemeral).toBeLessThan(0.15);
  });

  it('boosts memory stability with higher access count', () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const retentionZeroAccess = decay.calculateRetention(sevenDaysAgo, 0, 0.7, now);
    const retentionTenAccess = decay.calculateRetention(sevenDaysAgo, 10, 0.7, now);

    expect(retentionTenAccess).toBeGreaterThan(retentionZeroAccess);
  });

  it('prunes ephemeral memories below retention threshold', () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const ent = repo.upsertEntity({
      name: 'TemporaryThought',
      entityType: 'CONCEPT',
      importanceScore: 0.3,
    });

    db.prepare('UPDATE entities SET last_recalled_at = ? WHERE id = ?').run(thirtyDaysAgo, ent.id);

    decay.runDecayCycle(now);
    const pruned = decay.pruneStaleMemories();
    expect(pruned).toBe(1);

    const check = repo.getEntityById(ent.id);
    expect(check?.isArchived).toBe(true);
  });

  it('deduplicates aliases and re-points relations', () => {
    const user = repo.upsertEntity({ name: 'User', entityType: 'PERSON' });
    const pg1 = repo.upsertEntity({ name: 'PostgreSQL', entityType: 'TECHNOLOGY' });
    const pg2 = repo.upsertEntity({ name: 'postgres', entityType: 'TECHNOLOGY' });

    repo.upsertRelation({
      sourceEntityId: user.id,
      targetEntityId: pg2.id,
      relationType: 'PREFERS',
    });

    const mergedCount = deduplicator.deduplicate();
    expect(mergedCount).toBe(1);

    // The relation should now point to canonical PostgreSQL
    const activeRelations = repo.listRelations({ sourceId: user.id });
    expect(activeRelations.length).toBe(1);
    expect(activeRelations[0].targetEntityId).toBe(pg1.id);
  });
});
