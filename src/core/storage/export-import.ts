import { GraphRepository } from './graph-repo.js';
import { VectorStore } from './vector-store.js';
import { ConflictItem, EntityNode, EntityType, ExportFormat, RelationEdge } from '../types.js';

export interface GraphExportData {
  version: string;
  exportedAt: number;
  namespace: string;
  nodes: EntityNode[];
  edges: RelationEdge[];
}

export class GraphExportImportManager {
  private graphRepo: GraphRepository;
  private vectorStore: VectorStore;

  constructor(graphRepo: GraphRepository, vectorStore: VectorStore) {
    this.graphRepo = graphRepo;
    this.vectorStore = vectorStore;
  }

  public exportGraph(format: ExportFormat = 'json', namespace: string = 'default'): string {
    const nodes = this.graphRepo.listEntities({ limit: 50000, includeArchived: true, namespace });
    const edges = this.graphRepo.listRelations({ activeOnly: false, namespace });

    if (format === 'json') {
      const data: GraphExportData = {
        version: '1.0.0',
        exportedAt: Date.now(),
        namespace,
        nodes,
        edges,
      };
      return JSON.stringify(data, null, 2);
    }

    if (format === 'graphml') {
      return this.toGraphML(nodes, edges);
    }

    if (format === 'cypher') {
      return this.toCypher(nodes, edges);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  public async importGraph(
    rawContent: string,
    format: 'json' | 'cypher' = 'json',
    targetNamespace: string = 'default'
  ): Promise<{ entitiesImported: number; relationsImported: number }> {
    if (format === 'json') {
      const data = JSON.parse(rawContent) as Partial<GraphExportData>;
      const nodes = data.nodes || [];
      const edges = data.edges || [];

      let entitiesImported = 0;
      let relationsImported = 0;

      const idMapping = new Map<string, string>();

      for (const node of nodes) {
        const created = this.graphRepo.upsertEntity({
          name: node.name,
          entityType: node.entityType,
          properties: node.properties || {},
          importanceScore: node.importanceScore ?? 0.5,
          namespace: targetNamespace,
        });
        idMapping.set(node.id, created.id);
        entitiesImported++;

        await this.vectorStore.storeEmbedding(
          'ENTITY',
          created.id,
          `${created.name} ${created.entityType}`,
          targetNamespace
        );
      }

      for (const edge of edges) {
        const sourceId = idMapping.get(edge.sourceEntityId) || edge.sourceEntityId;
        const targetId = idMapping.get(edge.targetEntityId) || edge.targetEntityId;

        // Verify entities exist
        if (this.graphRepo.getEntityById(sourceId) && this.graphRepo.getEntityById(targetId)) {
          this.graphRepo.upsertRelation({
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            relationType: edge.relationType,
            confidence: edge.confidence ?? 1.0,
            validUntil: edge.validUntil,
            namespace: targetNamespace,
          });
          relationsImported++;
        }
      }

      return { entitiesImported, relationsImported };
    }

    if (format === 'cypher') {
      return this.importCypher(rawContent, targetNamespace);
    }

    throw new Error(`Unsupported import format: ${format}`);
  }

  public listConflicts(namespace: string = 'default'): ConflictItem[] {
    const relations = this.graphRepo.listRelations({ activeOnly: false, namespace });
    const conflicts: ConflictItem[] = [];

    for (const rel of relations) {
      if (rel.supersededBy || (rel.validUntil && rel.validUntil < Date.now())) {
        conflicts.push({
          id: rel.id,
          sourceEntityId: rel.sourceEntityId,
          sourceEntityName: rel.sourceEntityName || rel.sourceEntityId,
          targetEntityId: rel.targetEntityId,
          targetEntityName: rel.targetEntityName || rel.targetEntityId,
          relationType: rel.relationType,
          supersededBy: rel.supersededBy,
          validUntil: rel.validUntil,
          confidence: rel.confidence,
          createdAt: rel.createdAt,
          namespace: rel.namespace,
        });
      }
    }

    return conflicts;
  }

  public resolveConflict(
    conflictRelationId: string,
    action: 'KEEP_OLD' | 'KEEP_NEW' | 'DELETE_BOTH'
  ): boolean {
    const existing = this.graphRepo.getRelationById(conflictRelationId);
    if (!existing) return false;

    if (action === 'KEEP_OLD') {
      // Restore old relation as active: clear superseded_by and reset valid_until to null
      this.graphRepo.restoreRelation(conflictRelationId);

      // If there was a superseding relation, mark it superseded or delete it
      if (existing.supersededBy) {
        this.graphRepo.deleteRelation(existing.supersededBy);
      }
      return true;
    }

    if (action === 'KEEP_NEW') {
      // Delete the old relation permanently
      return this.graphRepo.deleteRelation(conflictRelationId);
    }

    if (action === 'DELETE_BOTH') {
      if (existing.supersededBy) {
        this.graphRepo.deleteRelation(existing.supersededBy);
      }
      return this.graphRepo.deleteRelation(conflictRelationId);
    }

    return false;
  }

  private toGraphML(nodes: EntityNode[], edges: RelationEdge[]): string {
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"',
      '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      '         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
      '  <key id="name" for="node" attr.name="name" attr.type="string"/>',
      '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
      '  <key id="importance" for="node" attr.name="importance" attr.type="double"/>',
      '  <key id="retention" for="node" attr.name="retention" attr.type="double"/>',
      '  <key id="label" for="edge" attr.name="label" attr.type="string"/>',
      '  <key id="confidence" for="edge" attr.name="confidence" attr.type="double"/>',
      '  <graph id="AgentMemGraph" edgedefault="directed">',
    ];

    for (const node of nodes) {
      lines.push(`    <node id="${this.escapeXml(node.id)}">`);
      lines.push(`      <data key="name">${this.escapeXml(node.name)}</data>`);
      lines.push(`      <data key="type">${this.escapeXml(node.entityType)}</data>`);
      lines.push(`      <data key="importance">${node.importanceScore}</data>`);
      lines.push(`      <data key="retention">${node.decayRetention}</data>`);
      lines.push('    </node>');
    }

    for (const edge of edges) {
      lines.push(`    <edge id="${this.escapeXml(edge.id)}" source="${this.escapeXml(edge.sourceEntityId)}" target="${this.escapeXml(edge.targetEntityId)}">`);
      lines.push(`      <data key="label">${this.escapeXml(edge.relationType)}</data>`);
      lines.push(`      <data key="confidence">${edge.confidence}</data>`);
      lines.push('    </edge>');
    }

    lines.push('  </graph>');
    lines.push('</graphml>');
    return lines.join('\n');
  }

  private toCypher(nodes: EntityNode[], edges: RelationEdge[]): string {
    const lines: string[] = ['// AgentMem Cypher Knowledge Graph Export', 'BEGIN;'];

    for (const node of nodes) {
      const cleanName = node.name.replace(/'/g, "\\'");
      const cleanType = node.entityType;
      lines.push(
        `MERGE (n:\`${cleanType}\` {id: '${node.id}'}) ON CREATE SET n.name = '${cleanName}', n.importance = ${node.importanceScore}, n.retention = ${node.decayRetention}, n.namespace = '${node.namespace}';`
      );
    }

    for (const edge of edges) {
      const relType = edge.relationType.replace(/[^A-Za-z0-9_]/g, '_');
      lines.push(
        `MATCH (s {id: '${edge.sourceEntityId}'}), (t {id: '${edge.targetEntityId}'}) ` +
          `MERGE (s)-[r:\`${relType}\` {confidence: ${edge.confidence}, namespace: '${edge.namespace}'}]->(t);`
      );
    }

    lines.push('COMMIT;');
    return lines.join('\n');
  }

  private async importCypher(
    rawContent: string,
    namespace: string
  ): Promise<{ entitiesImported: number; relationsImported: number }> {
    let entitiesImported = 0;
    let relationsImported = 0;
    const lines = rawContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed === 'BEGIN;' || trimmed === 'COMMIT;') {
        continue;
      }

      // Match node MERGE/CREATE
      const nodeMatch = trimmed.match(
        /MERGE\s*\(\w+:?`?([A-Za-z0-9_]+)`?\s*\{id:\s*'([^']+)'\}\)\s*(?:ON CREATE SET)?\s*(?:.*n\.name\s*=\s*'([^']+)')?/i
      );
      if (nodeMatch) {
        const rawType = nodeMatch[1].toUpperCase();
        const allowedTypes = ['PERSON', 'PROJECT', 'TECHNOLOGY', 'PREFERENCE', 'CONSTRAINT', 'CONCEPT'];
        const type: EntityType = allowedTypes.includes(rawType) ? (rawType as EntityType) : 'CONCEPT';
        const name = nodeMatch[3] || nodeMatch[2];
        const ent = this.graphRepo.upsertEntity({
          name,
          entityType: type,
          namespace,
        });
        entitiesImported++;
        await this.vectorStore.storeEmbedding('ENTITY', ent.id, `${ent.name} ${ent.entityType}`, namespace);
      }

      // Match relation MATCH ... MERGE
      const relMatch = trimmed.match(
        /MATCH\s*\([^\{]*\{id:\s*'([^']+)'\}\),\s*\([^\{]*\{id:\s*'([^']+)'\}\)\s*MERGE\s*\(\w+\)-\[r:`?([A-Za-z0-9_]+)`?(?:\s*\{[^}]*\})?\]->\(\w+\)/i
      );
      if (relMatch) {
        const sId = relMatch[1];
        const tId = relMatch[2];
        const rType = relMatch[3].toUpperCase();

        if (this.graphRepo.getEntityById(sId) && this.graphRepo.getEntityById(tId)) {
          this.graphRepo.upsertRelation({
            sourceEntityId: sId,
            targetEntityId: tId,
            relationType: rType,
            confidence: 1.0,
            namespace,
          });
          relationsImported++;
        }
      }
    }

    return { entitiesImported, relationsImported };
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
