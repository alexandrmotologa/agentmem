import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TripletParser } from '../src/core/extraction/triplet-parser.js';
import { EntityExtractor } from '../src/core/extraction/entity-extractor.js';
import { ContradictionResolver } from '../src/core/extraction/contradiction.js';
import { DatabaseManager } from '../src/core/storage/database.js';
import { GraphRepository } from '../src/core/storage/graph-repo.js';

describe('Extraction & Contradiction Resolution', () => {
  let db: DatabaseManager;
  let repo: GraphRepository;
  let parser: TripletParser;
  let extractor: EntityExtractor;
  let resolver: ContradictionResolver;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    repo = new GraphRepository(db);
    parser = new TripletParser();
    extractor = new EntityExtractor();
    resolver = new ContradictionResolver(repo);
  });

  afterEach(() => {
    db.close();
  });

  it('extracts preference and constraint triplets from text', () => {
    const text = 'I prefer PostgreSQL. Strictly avoid any ORMs. The backend uses TypeScript.';
    const triplets = parser.parse(text);

    expect(triplets.length).toBeGreaterThanOrEqual(2);

    const pref = triplets.find((t) => t.predicate === 'PREFERS');
    expect(pref).toBeDefined();
    expect(pref?.object).toBe('PostgreSQL');

    const constraint = triplets.find((t) => t.predicate === 'RESTRICTS');
    expect(constraint).toBeDefined();
    expect(constraint?.object).toBe('any ORMs');
  });

  it('normalizes entity names and identifies technologies', () => {
    const text = 'We deployed postgres and react 19 on aws.';
    const entities = extractor.extractEntities(text);

    const pg = entities.find((e) => e.name === 'PostgreSQL');
    expect(pg).toBeDefined();
    expect(pg?.entityType).toBe('TECHNOLOGY');

    const react = entities.find((e) => e.name === 'React');
    expect(react).toBeDefined();
    expect(react?.properties.version).toBe('19');
  });

  it('resolves conflicting preferences and marks old relation superseded', () => {
    const user = repo.upsertEntity({ name: 'User', entityType: 'PERSON' });
    const postgres = repo.upsertEntity({ name: 'PostgreSQL', entityType: 'TECHNOLOGY' });
    const sqlite = repo.upsertEntity({ name: 'SQLite', entityType: 'TECHNOLOGY' });

    // Step 1: User prefers PostgreSQL
    const rel1 = repo.upsertRelation({
      sourceEntityId: user.id,
      targetEntityId: postgres.id,
      relationType: 'PREFERS',
    });

    expect(rel1.validUntil).toBeNull();

    // Step 2: User now prefers SQLite
    const rel2 = repo.upsertRelation({
      sourceEntityId: user.id,
      targetEntityId: sqlite.id,
      relationType: 'PREFERS',
    });

    const resolution = resolver.resolveContradiction(user.id, sqlite.id, 'PREFERS', rel2.id);
    expect(resolution.detected).toBe(true);
    expect(resolution.actionTaken).toBe('SUPERSEDED');

    // Verify rel1 is superseded
    const updatedRel1 = repo.getRelationById(rel1.id);
    expect(updatedRel1?.supersededBy).toBe(rel2.id);
    expect(updatedRel1?.validUntil).toBeDefined();
  });
});
