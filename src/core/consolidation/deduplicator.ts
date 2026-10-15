import { DatabaseManager } from '../storage/database.js';
import { GraphRepository } from '../storage/graph-repo.js';
import { EntityExtractor } from '../extraction/entity-extractor.js';
import { EntityNode } from '../types.js';

export class EntityDeduplicator {
  private db: DatabaseManager;
  private graphRepo: GraphRepository;
  private extractor: EntityExtractor;

  constructor(db: DatabaseManager, graphRepo: GraphRepository) {
    this.db = db;
    this.graphRepo = graphRepo;
    this.extractor = new EntityExtractor();
  }

  /**
   * Scans active entities and merges aliases into canonical entities.
   */
  public deduplicate(namespace?: string): number {
    const activeEntities = this.graphRepo.listEntities({
      limit: 1000,
      includeArchived: false,
      namespace,
    });
    const nameMap = new Map<string, EntityNode>();
    let mergedCount = 0;

    for (const ent of activeEntities) {
      const { canonicalName } = this.extractor.normalizeName(ent.name);
      const lowerCanonical = canonicalName.toLowerCase();

      if (nameMap.has(lowerCanonical)) {
        let primary = nameMap.get(lowerCanonical)!;
        let duplicate = ent;

        if (primary.id !== duplicate.id) {
          // If ent is an exact match for canonical name, prefer it as primary
          if (
            duplicate.name.toLowerCase() === canonicalName.toLowerCase() &&
            primary.name.toLowerCase() !== canonicalName.toLowerCase()
          ) {
            const temp = primary;
            primary = duplicate;
            duplicate = temp;
            nameMap.set(lowerCanonical, primary);
          }

          this.mergeEntities(primary, duplicate);
          mergedCount++;
        }
      } else {
        nameMap.set(lowerCanonical, ent);
      }
    }

    return mergedCount;
  }

  private mergeEntities(primary: EntityNode, duplicate: EntityNode): void {
    this.db.transaction(() => {
      // 1. Re-point outgoing relations from duplicate to primary
      this.db.prepare(`
        UPDATE relations
        SET source_entity_id = ?
        WHERE source_entity_id = ?
      `).run(primary.id, duplicate.id);

      // 2. Re-point incoming relations from duplicate to primary
      this.db.prepare(`
        UPDATE relations
        SET target_entity_id = ?
        WHERE target_entity_id = ?
      `).run(primary.id, duplicate.id);

      // 3. Remove any accidental self-loops created by merge
      this.db.prepare(`
        DELETE FROM relations
        WHERE source_entity_id = target_entity_id
      `).run();

      // 4. Update primary entity metrics
      const mergedProperties = { ...duplicate.properties, ...primary.properties };
      const maxImportance = Math.max(primary.importanceScore, duplicate.importanceScore);
      const totalAccess = primary.accessCount + duplicate.accessCount;

      this.graphRepo.updateEntity(primary.id, {
        properties: mergedProperties,
        importanceScore: maxImportance,
        accessCount: totalAccess,
        updatedAt: Date.now(),
      });

      // 5. Archive the duplicate entity
      this.graphRepo.updateEntity(duplicate.id, {
        isArchived: true,
        updatedAt: Date.now(),
      });
    });
  }
}
