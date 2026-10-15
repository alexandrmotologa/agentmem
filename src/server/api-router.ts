import { Router, Request, Response } from 'express';
import { AgentMemory } from '../core/agent-memory.js';
import { EntityType, ExportFormat } from '../core/types.js';

export function createApiRouter(memory: AgentMemory): Router {
  const router = Router();

  // Health
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', engine: 'AgentMem', version: '1.0.0' });
  });

  // Namespaces list
  router.get('/namespaces', (_req: Request, res: Response) => {
    try {
      const rows = memory.db
        .prepare(`
          SELECT DISTINCT namespace FROM entities
          UNION
          SELECT DISTINCT namespace FROM relations
          UNION
          SELECT DISTINCT namespace FROM episodes
        `)
        .all() as Array<{ namespace: string }>;

      const namespaces = Array.from(new Set(['default', ...rows.map((r) => r.namespace || 'default')]));
      res.json(namespaces);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Overview stats
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const namespace = req.query.namespace as string | undefined;
      const entities = memory.graphRepo.listEntities({ limit: 10000, includeArchived: false, namespace });
      const relations = memory.graphRepo.listRelations({ activeOnly: true, namespace });
      const episodes = memory.episodicRepo.listEpisodes({ limit: 10000, namespace });

      res.json({
        namespace: namespace || 'default',
        entitiesCount: entities.length,
        relationsCount: relations.length,
        episodesCount: episodes.length,
        activeRetentionAvg:
          entities.length > 0
            ? Math.round(
                (entities.reduce((acc, e) => acc + e.decayRetention, 0) / entities.length) * 100
              ) / 100
            : 1.0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Graph data for 2D visualization
  router.get('/graph', (req: Request, res: Response) => {
    try {
      const namespace = req.query.namespace as string | undefined;
      const graphData = memory.getGraphData(namespace);
      res.json(graphData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Entities CRUD
  router.get('/entities', (req: Request, res: Response) => {
    try {
      const type = req.query.type as EntityType | undefined;
      const search = req.query.search as string | undefined;
      const namespace = req.query.namespace as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const entities = memory.graphRepo.listEntities({ type, search, limit, namespace });
      res.json(entities);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/entities', async (req: Request, res: Response) => {
    try {
      const { name, entityType, properties, importanceScore, namespace } = req.body;
      if (!name || !entityType) {
        res.status(400).json({ error: 'Name and entityType are required.' });
        return;
      }
      const ns = namespace || memory.defaultNamespace;
      const entity = memory.graphRepo.upsertEntity({
        name,
        entityType,
        properties: properties || {},
        importanceScore: importanceScore !== undefined ? Number(importanceScore) : 0.5,
        namespace: ns,
      });

      await memory.vectorStore.storeEmbedding(
        'ENTITY',
        entity.id,
        `${entity.name} ${entity.entityType} ${JSON.stringify(entity.properties)}`,
        ns
      );

      res.status(201).json(entity);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/entities/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updated = memory.graphRepo.updateEntity(id, req.body);
      if (!updated) {
        res.status(404).json({ error: 'Entity not found.' });
        return;
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/entities/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = memory.graphRepo.deleteEntity(id);
      memory.vectorStore.deleteEmbedding('ENTITY', id);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Relations CRUD
  router.get('/relations', (req: Request, res: Response) => {
    try {
      const sourceId = req.query.sourceId as string | undefined;
      const targetId = req.query.targetId as string | undefined;
      const relationType = req.query.relationType as string | undefined;
      const namespace = req.query.namespace as string | undefined;
      const activeOnly = req.query.activeOnly !== 'false';

      const relations = memory.graphRepo.listRelations({ sourceId, targetId, relationType, activeOnly, namespace });
      res.json(relations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/relations', (req: Request, res: Response) => {
    try {
      const { sourceEntityId, targetEntityId, relationType, confidence, namespace } = req.body;
      if (!sourceEntityId || !targetEntityId || !relationType) {
        res.status(400).json({ error: 'sourceEntityId, targetEntityId, and relationType are required.' });
        return;
      }
      const ns = namespace || memory.defaultNamespace;
      const rel = memory.graphRepo.upsertRelation({
        sourceEntityId,
        targetEntityId,
        relationType,
        confidence: confidence !== undefined ? Number(confidence) : 1.0,
        namespace: ns,
      });

      memory.contradictionResolver.resolveContradiction(
        sourceEntityId,
        targetEntityId,
        relationType,
        rel.id,
        ns
      );

      res.status(201).json(rel);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/relations/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = memory.graphRepo.deleteRelation(id);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Episodes
  router.get('/episodes', (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      const namespace = req.query.namespace as string | undefined;
      const agentId = req.query.agentId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const episodes = memory.episodicRepo.listEpisodes({ sessionId, namespace, agentId, limit });
      res.json(episodes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ingestion
  router.post('/ingest', async (req: Request, res: Response) => {
    try {
      const { sessionId, turns, outcome, summary, importance, namespace, agentId } = req.body;
      if (!sessionId || !Array.isArray(turns)) {
        res.status(400).json({ error: 'sessionId and turns array are required.' });
        return;
      }
      const episode = await memory.ingestEpisode({
        sessionId,
        turns,
        outcome,
        summary,
        importance,
        namespace,
        agentId,
      });
      res.status(201).json(episode);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Document Ingestion
  router.post('/ingest-document', async (req: Request, res: Response) => {
    try {
      const { content, filePath, projectName, namespace } = req.body;
      if (!content && !filePath) {
        res.status(400).json({ error: 'Either content or filePath is required.' });
        return;
      }

      let result;
      if (filePath) {
        result = await memory.ingestDocument(filePath, { namespace, projectName });
      } else {
        result = await memory.ingestDocumentContent(content, 'web-studio-input.md', { namespace, projectName });
      }

      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Recall Simulator Query
  router.post('/query', async (req: Request, res: Response) => {
    try {
      const { query, topK, maxTokens, weights, graphHops, includeEpisodes, namespace, agentId } = req.body;
      if (!query) {
        res.status(400).json({ error: 'Query string is required.' });
        return;
      }
      const recalled = await memory.recall({
        query,
        topK: topK ? Number(topK) : 5,
        maxTokens: maxTokens ? Number(maxTokens) : 600,
        weights,
        graphHops: graphHops ? Number(graphHops) : 1,
        includeEpisodes: includeEpisodes !== false,
        namespace,
        agentId,
      });
      res.json(recalled);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger consolidation manually
  router.post('/consolidate', async (req: Request, res: Response) => {
    try {
      const namespace = req.body?.namespace as string | undefined;
      const stats = await memory.consolidate(namespace);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Graph Export
  router.get('/export', (req: Request, res: Response) => {
    try {
      const format = (req.query.format as ExportFormat) || 'json';
      const namespace = (req.query.namespace as string) || 'default';
      const result = memory.exportGraph(format, namespace);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="agentmem_export_${namespace}.json"`);
      } else if (format === 'graphml') {
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="agentmem_export_${namespace}.graphml"`);
      } else {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="agentmem_export_${namespace}.cypher"`);
      }

      res.send(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Graph Import
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const format = (req.body?.format as 'json' | 'cypher') || 'json';
      const namespace = (req.body?.namespace as string) || 'default';
      const rawData = typeof req.body === 'string' ? req.body : req.body?.data || JSON.stringify(req.body);

      const result = await memory.importGraph(rawData, format, namespace);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Conflicts listing
  router.get('/conflicts', (req: Request, res: Response) => {
    try {
      const namespace = (req.query.namespace as string) || 'default';
      const conflicts = memory.listConflicts(namespace);
      res.json(conflicts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Conflict resolution
  router.post('/conflicts/resolve', (req: Request, res: Response) => {
    try {
      const { id, action } = req.body;
      if (!id || !action) {
        res.status(400).json({ error: 'Conflict id and action (KEEP_OLD | KEEP_NEW | DELETE_BOTH) are required.' });
        return;
      }
      const success = memory.resolveConflict(id, action);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
