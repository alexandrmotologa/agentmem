import { DatabaseManager } from './database.js';
import { EntityNode, EntityType, RelationEdge } from '../types.js';
import { randomUUID } from 'node:crypto';

export class GraphRepository {
  public readonly db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  public restoreRelation(id: string): void {
    const stmt = this.db.prepare(
      'UPDATE relations SET superseded_by = NULL, valid_until = NULL, updated_at = ? WHERE id = ?'
    );
    stmt.run(Date.now(), id);
  }

  public upsertEntity(
    input: Partial<EntityNode> & { name: string; entityType: EntityType; namespace?: string }
  ): EntityNode {
    const namespace = input.namespace || 'default';
    const existing = this.getEntityByName(input.name, namespace);
    const now = Date.now();

    if (existing) {
      const updatedImportance =
        input.importanceScore !== undefined
          ? Math.max(existing.importanceScore, input.importanceScore)
          : existing.importanceScore;

      const mergedProperties = {
        ...existing.properties,
        ...(input.properties || {}),
      };

      const stmt = this.db.prepare(`
        UPDATE entities
        SET entity_type = ?,
            properties = ?,
            importance_score = ?,
            updated_at = ?,
            decay_retention = 1.0,
            is_archived = 0,
            namespace = ?
        WHERE id = ?
      `);

      stmt.run(
        input.entityType || existing.entityType,
        JSON.stringify(mergedProperties),
        updatedImportance,
        now,
        namespace,
        existing.id
      );

      this.updateFts(existing.id, input.name, input.entityType || existing.entityType, mergedProperties);

      return {
        ...existing,
        entityType: input.entityType || existing.entityType,
        properties: mergedProperties,
        importanceScore: updatedImportance,
        updatedAt: now,
        decayRetention: 1.0,
        isArchived: false,
        namespace,
      };
    }

    const id = input.id || `ent_${randomUUID()}`;
    const properties = input.properties || {};
    const importance = input.importanceScore !== undefined ? input.importanceScore : 0.5;

    const stmt = this.db.prepare(`
      INSERT INTO entities (
        id, name, entity_type, properties, importance_score, access_count,
        created_at, updated_at, last_recalled_at, decay_retention, is_archived, namespace
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name.trim(),
      input.entityType,
      JSON.stringify(properties),
      importance,
      input.accessCount || 0,
      now,
      now,
      now,
      1.0,
      0,
      namespace
    );

    this.insertFts(id, input.name.trim(), input.entityType, properties);

    return {
      id,
      name: input.name.trim(),
      entityType: input.entityType,
      properties,
      importanceScore: importance,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      lastRecalledAt: now,
      decayRetention: 1.0,
      isArchived: false,
      namespace,
    };
  }

  public getEntityById(id: string): EntityNode | null {
    const stmt = this.db.prepare('SELECT * FROM entities WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapEntityRow(row);
  }

  public getEntityByName(name: string, namespace: string = 'default'): EntityNode | null {
    let sql = 'SELECT * FROM entities WHERE LOWER(name) = LOWER(?) AND is_archived = 0';
    const params: unknown[] = [name.trim()];
    if (namespace && namespace !== '*') {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }
    sql += ' LIMIT 1';

    const row = (this.db.prepare(sql).get as any)(...params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapEntityRow(row);
  }

  public listEntities(options?: {
    type?: EntityType;
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
    search?: string;
    namespace?: string;
  }): EntityNode[] {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!options?.includeArchived) {
      conditions.push('is_archived = 0');
    }
    if (options?.type) {
      conditions.push('entity_type = ?');
      params.push(options.type);
    }
    if (options?.search) {
      conditions.push('LOWER(name) LIKE LOWER(?)');
      params.push(`%${options.search}%`);
    }
    if (options?.namespace && options.namespace !== '*') {
      conditions.push('namespace = ?');
      params.push(options.namespace);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT * FROM entities
      ${whereClause}
      ORDER BY importance_score DESC, updated_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const rows = (this.db.prepare(sql).all as any)(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapEntityRow(r));
  }

  public updateEntity(id: string, updates: Partial<EntityNode>): EntityNode | null {
    const existing = this.getEntityById(id);
    if (!existing) return null;

    const name = updates.name ?? existing.name;
    const entityType = updates.entityType ?? existing.entityType;
    const properties = updates.properties ?? existing.properties;
    const importance = updates.importanceScore ?? existing.importanceScore;
    const accessCount = updates.accessCount ?? existing.accessCount;
    const lastRecalledAt = updates.lastRecalledAt ?? existing.lastRecalledAt;
    const decayRetention = updates.decayRetention ?? existing.decayRetention;
    const isArchived = updates.isArchived !== undefined ? (updates.isArchived ? 1 : 0) : (existing.isArchived ? 1 : 0);
    const namespace = updates.namespace ?? existing.namespace;
    const now = Date.now();

    const stmt = this.db.prepare(`
      UPDATE entities
      SET name = ?,
          entity_type = ?,
          properties = ?,
          importance_score = ?,
          access_count = ?,
          last_recalled_at = ?,
          decay_retention = ?,
          is_archived = ?,
          namespace = ?,
          updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      name,
      entityType,
      JSON.stringify(properties),
      importance,
      accessCount,
      lastRecalledAt,
      decayRetention,
      isArchived,
      namespace,
      now,
      id
    );

    this.updateFts(id, name, entityType, properties);

    return this.getEntityById(id);
  }

  public incrementAccessCount(id: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE entities
      SET access_count = access_count + 1,
          last_recalled_at = ?,
          decay_retention = MIN(1.0, decay_retention + 0.15)
      WHERE id = ?
    `);
    stmt.run(now, id);
  }

  public deleteEntity(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM entities WHERE id = ?');
    const result = stmt.run(id);
    this.deleteFts(id);
    return Number(result.changes) > 0;
  }

  public upsertRelation(
    relation: Omit<RelationEdge, 'id' | 'createdAt' | 'updatedAt' | 'namespace'> & {
      id?: string;
      namespace?: string;
    }
  ): RelationEdge {
    const now = Date.now();
    const namespace = relation.namespace || 'default';
    const existing = this.findExistingRelation(
      relation.sourceEntityId,
      relation.targetEntityId,
      relation.relationType,
      namespace
    );

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE relations
        SET confidence = ?,
            valid_until = ?,
            superseded_by = ?,
            updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        relation.confidence ?? existing.confidence,
        relation.validUntil ?? null,
        relation.supersededBy ?? null,
        now,
        existing.id
      );

      return {
        ...existing,
        confidence: relation.confidence ?? existing.confidence,
        validUntil: relation.validUntil,
        supersededBy: relation.supersededBy,
        updatedAt: now,
      };
    }

    const id = relation.id || `rel_${randomUUID()}`;
    const stmt = this.db.prepare(`
      INSERT INTO relations (
        id, source_entity_id, target_entity_id, relation_type,
        confidence, valid_until, superseded_by, created_at, updated_at, namespace
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      relation.sourceEntityId,
      relation.targetEntityId,
      relation.relationType.toUpperCase(),
      relation.confidence ?? 1.0,
      relation.validUntil ?? null,
      relation.supersededBy ?? null,
      now,
      now,
      namespace
    );

    return {
      id,
      sourceEntityId: relation.sourceEntityId,
      targetEntityId: relation.targetEntityId,
      relationType: relation.relationType.toUpperCase(),
      confidence: relation.confidence ?? 1.0,
      validUntil: relation.validUntil ?? null,
      supersededBy: relation.supersededBy ?? null,
      createdAt: now,
      updatedAt: now,
      namespace,
    };
  }

  public listRelations(options?: {
    sourceId?: string;
    targetId?: string;
    relationType?: string;
    activeOnly?: boolean;
    namespace?: string;
  }): RelationEdge[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.sourceId) {
      conditions.push('r.source_entity_id = ?');
      params.push(options.sourceId);
    }
    if (options?.targetId) {
      conditions.push('r.target_entity_id = ?');
      params.push(options.targetId);
    }
    if (options?.relationType) {
      conditions.push('r.relation_type = ?');
      params.push(options.relationType.toUpperCase());
    }
    if (options?.namespace && options.namespace !== '*') {
      conditions.push('r.namespace = ?');
      params.push(options.namespace);
    }
    if (options?.activeOnly) {
      conditions.push('(r.valid_until IS NULL OR r.valid_until > ?)');
      params.push(Date.now());
      conditions.push('r.superseded_by IS NULL');
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT r.*,
             s.name as source_name,
             t.name as target_name,
             t.entity_type as target_type
      FROM relations r
      JOIN entities s ON r.source_entity_id = s.id
      JOIN entities t ON r.target_entity_id = t.id
      ${whereClause}
      ORDER BY r.confidence DESC, r.created_at DESC
    `;

    const rows = (this.db.prepare(sql).all as any)(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapRelationRow(r));
  }

  public getRelationById(id: string): RelationEdge | null {
    const stmt = this.db.prepare(`
      SELECT r.*,
             s.name as source_name,
             t.name as target_name,
             t.entity_type as target_type
      FROM relations r
      JOIN entities s ON r.source_entity_id = s.id
      JOIN entities t ON r.target_entity_id = t.id
      WHERE r.id = ?
    `);
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRelationRow(row);
  }

  public deleteRelation(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM relations WHERE id = ?');
    const result = stmt.run(id);
    return Number(result.changes) > 0;
  }

  public markRelationSuperseded(oldRelationId: string, newRelationId: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE relations
      SET valid_until = ?,
          superseded_by = ?,
          updated_at = ?
      WHERE id = ?
    `);
    stmt.run(now, newRelationId, now, oldRelationId);
  }

  public getConnectedNeighborhood(
    entityId: string,
    maxHops: number = 2
  ): { nodes: EntityNode[]; edges: RelationEdge[] } {
    const cteSql = `
      WITH RECURSIVE neighborhood(entity_id, hop) AS (
        SELECT id, 0
        FROM entities
        WHERE id = ? AND is_archived = 0
        UNION
        SELECT
          CASE
            WHEN r.source_entity_id = n.entity_id THEN r.target_entity_id
            ELSE r.source_entity_id
          END,
          n.hop + 1
        FROM relations r
        JOIN neighborhood n ON (r.source_entity_id = n.entity_id OR r.target_entity_id = n.entity_id)
        WHERE n.hop < ?
          AND (r.valid_until IS NULL OR r.valid_until > ?)
          AND r.superseded_by IS NULL
      )
      SELECT DISTINCT entity_id FROM neighborhood;
    `;

    const now = Date.now();
    const nodeRows = this.db.prepare(cteSql).all(entityId, maxHops, now) as { entity_id: string }[];
    const nodeIds = nodeRows.map((r) => r.entity_id);

    if (nodeIds.length === 0) {
      return { nodes: [], edges: [] };
    }

    const placeholders = nodeIds.map(() => '?').join(',');
    const entitiesSql = `SELECT * FROM entities WHERE id IN (${placeholders}) AND is_archived = 0`;
    const entities = (
      (this.db.prepare(entitiesSql).all as any)(...nodeIds) as Record<string, unknown>[]
    ).map((r) => this.mapEntityRow(r));

    const edgesSql = `
      SELECT r.*,
             s.name as source_name,
             t.name as target_name,
             t.entity_type as target_type
      FROM relations r
      JOIN entities s ON r.source_entity_id = s.id
      JOIN entities t ON r.target_entity_id = t.id
      WHERE r.source_entity_id IN (${placeholders})
        AND r.target_entity_id IN (${placeholders})
        AND (r.valid_until IS NULL OR r.valid_until > ?)
        AND r.superseded_by IS NULL
    `;
    const edgeParams = [...nodeIds, ...nodeIds, now];
    const edges = (
      (this.db.prepare(edgesSql).all as any)(...edgeParams) as Record<string, unknown>[]
    ).map((r) => this.mapRelationRow(r));

    return { nodes: entities, edges };
  }

  public searchEntitiesFts(
    query: string,
    limit: number = 10,
    namespace?: string
  ): Array<{ entity: EntityNode; rank: number }> {
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (!cleanQuery) return [];

    const ftsQuery = cleanQuery
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => `"${w}"*`)
      .join(' OR ');

    if (!ftsQuery) return [];

    try {
      let sql = `
        SELECT f.entity_id, bm25(fts_entities) as rank, e.*
        FROM fts_entities f
        JOIN entities e ON f.entity_id = e.id
        WHERE fts_entities MATCH ? AND e.is_archived = 0
      `;
      const params: unknown[] = [ftsQuery];
      if (namespace && namespace !== '*') {
        sql += ' AND e.namespace = ?';
        params.push(namespace);
      }
      sql += ' ORDER BY rank ASC LIMIT ?';
      params.push(limit);

      const rows = (this.db.prepare(sql).all as any)(...params) as Record<string, unknown>[];
      return rows.map((r) => ({
        entity: this.mapEntityRow(r),
        rank: Math.abs(Number(r.rank) || 0),
      }));
    } catch {
      let fallbackSql = `
        SELECT * FROM entities
        WHERE (LOWER(name) LIKE LOWER(?) OR LOWER(properties) LIKE LOWER(?))
          AND is_archived = 0
      `;
      const searchPattern = `%${cleanQuery}%`;
      const params: unknown[] = [searchPattern, searchPattern];
      if (namespace && namespace !== '*') {
        fallbackSql += ' AND namespace = ?';
        params.push(namespace);
      }
      fallbackSql += ' ORDER BY importance_score DESC LIMIT ?';
      params.push(limit);

      const rows = (this.db.prepare(fallbackSql).all as any)(...params) as Record<string, unknown>[];
      return rows.map((r) => ({
        entity: this.mapEntityRow(r),
        rank: 1.0,
      }));
    }
  }

  private findExistingRelation(
    sourceId: string,
    targetId: string,
    type: string,
    namespace: string = 'default'
  ): RelationEdge | null {
    let sql = `
      SELECT * FROM relations
      WHERE source_entity_id = ? AND target_entity_id = ? AND relation_type = ?
    `;
    const params: unknown[] = [sourceId, targetId, type.toUpperCase()];
    if (namespace !== '*') {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }
    sql += ' LIMIT 1';

    const row = (this.db.prepare(sql).get as any)(...params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRelationRow(row);
  }

  private insertFts(id: string, name: string, type: string, props: Record<string, unknown>): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO fts_entities (entity_id, name, entity_type, properties_text)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(id, name, type, JSON.stringify(props));
    } catch {
      // Ignore if FTS already has it
    }
  }

  private updateFts(id: string, name: string, type: string, props: Record<string, unknown>): void {
    try {
      this.deleteFts(id);
      this.insertFts(id, name, type, props);
    } catch {
      // Ignore FTS update errors
    }
  }

  private deleteFts(id: string): void {
    try {
      const stmt = this.db.prepare('DELETE FROM fts_entities WHERE entity_id = ?');
      stmt.run(id);
    } catch {
      // Ignore FTS delete errors
    }
  }

  private mapEntityRow(r: Record<string, unknown>): EntityNode {
    return {
      id: String(r.id),
      name: String(r.name),
      entityType: String(r.entity_type) as EntityType,
      properties: typeof r.properties === 'string' ? JSON.parse(r.properties) : {},
      importanceScore: Number(r.importance_score) || 0.5,
      accessCount: Number(r.access_count) || 0,
      createdAt: Number(r.created_at) || Date.now(),
      updatedAt: Number(r.updated_at) || Date.now(),
      lastRecalledAt: Number(r.last_recalled_at) || Date.now(),
      decayRetention: Number(r.decay_retention) || 1.0,
      isArchived: Boolean(r.is_archived),
      namespace: String(r.namespace || 'default'),
    };
  }

  private mapRelationRow(r: Record<string, unknown>): RelationEdge {
    return {
      id: String(r.id),
      sourceEntityId: String(r.source_entity_id),
      targetEntityId: String(r.target_entity_id),
      relationType: String(r.relation_type),
      confidence: Number(r.confidence) || 1.0,
      validUntil: r.valid_until ? Number(r.valid_until) : null,
      supersededBy: r.superseded_by ? String(r.superseded_by) : null,
      createdAt: Number(r.created_at) || Date.now(),
      updatedAt: Number(r.updated_at) || Date.now(),
      sourceEntityName: r.source_name ? String(r.source_name) : undefined,
      targetEntityName: r.target_name ? String(r.target_name) : undefined,
      targetEntityType: r.target_type ? (String(r.target_type) as EntityType) : undefined,
      namespace: String(r.namespace || 'default'),
    };
  }
}
