import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../src/core/storage/database.js';
import { GraphRepository } from '../src/core/storage/graph-repo.js';

describe('DatabaseManager & GraphRepository', () => {
  let db: DatabaseManager;
  let repo: GraphRepository;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    repo = new GraphRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('initializes schema and tables correctly', () => {
    const raw = db.getRawDb();
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('entities');
    expect(tableNames).toContain('relations');
    expect(tableNames).toContain('episodes');
    expect(tableNames).toContain('working_memory');
    expect(tableNames).toContain('vector_embeddings');
  });

  it('supports transactional rollback on error', () => {
    expect(() => {
      db.transaction(() => {
        repo.upsertEntity({ name: 'RollbackEntity', entityType: 'PROJECT' });
        throw new Error('Forced abort');
      });
    }).toThrow('Forced abort');

    const found = repo.getEntityByName('RollbackEntity');
    expect(found).toBeNull();
  });

  it('traverses connected neighborhood via recursive CTE', () => {
    const nodeA = repo.upsertEntity({ name: 'AgentMem', entityType: 'PROJECT' });
    const nodeB = repo.upsertEntity({ name: 'SQLite', entityType: 'TECHNOLOGY' });
    const nodeC = repo.upsertEntity({ name: 'FTS5', entityType: 'TECHNOLOGY' });

    repo.upsertRelation({
      sourceEntityId: nodeA.id,
      targetEntityId: nodeB.id,
      relationType: 'USES',
    });

    repo.upsertRelation({
      sourceEntityId: nodeB.id,
      targetEntityId: nodeC.id,
      relationType: 'INCLUDES',
    });

    // 1 hop from A should reach B
    const hop1 = repo.getConnectedNeighborhood(nodeA.id, 1);
    const hop1Ids = hop1.nodes.map((n) => n.id);
    expect(hop1Ids).toContain(nodeA.id);
    expect(hop1Ids).toContain(nodeB.id);
    expect(hop1Ids).not.toContain(nodeC.id);

    // 2 hops from A should reach C as well
    const hop2 = repo.getConnectedNeighborhood(nodeA.id, 2);
    const hop2Ids = hop2.nodes.map((n) => n.id);
    expect(hop2Ids).toContain(nodeC.id);
  });
});
