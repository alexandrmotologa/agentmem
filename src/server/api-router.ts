import { Router, Request, Response } from 'express';
import { AgentMemory } from '../core/agent-memory.js';
import { EntityType } from '../core/types.js';

export function createApiRouter(memory: AgentMemory): Router {
  const router = Router();

  // Health
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', engine: 'AgentMem', version: '1.0.0' });
  });

  // Overview stats
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const entities = memory.graphRepo.listEntities({ limit: 10000, includeArchived: false });
      const relations = memory.graphRepo.listRelations({ activeOnly: true });
      const episodes = memory.episodicRepo.listEpisodes({ limit: 10000 });

      res.json({
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
  router.get('/graph', (_req: Request, res: Response) => {
    try {
      const graphData = memory.getGraphData();
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
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const entities = memory.graphRepo.listEntities({ type, search, limit });
      res.json(entities);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/entities', async (req: Request, res: Response) => {
    try {
      const { name, entityType, properties, importanceScore } = req.body;
      if (!name || !entityType) {
        res.status(400).json({ error: 'Name and entityType are required.' });
        return;
      }
      const entity = memory.graphRepo.upsertEntity({
        name,
        entityType,
        properties: properties || {},
        importanceScore: importanceScore !== undefined ? Number(importanceScore) : 0.5,
      });

      await memory.vectorStore.storeEmbedding(
        'ENTITY',
        entity.id,
        `${entity.name} ${entity.entityType} ${JSON.stringify(entity.properties)}`
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
      const activeOnly = req.query.activeOnly !== 'false';

      const relations = memory.graphRepo.listRelations({ sourceId, targetId, relationType, activeOnly });
      res.json(relations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/relations', (req: Request, res: Response) => {
    try {
      const { sourceEntityId, targetEntityId, relationType, confidence } = req.body;
      if (!sourceEntityId || !targetEntityId || !relationType) {
        res.status(400).json({ error: 'sourceEntityId, targetEntityId, and relationType are required.' });
        return;
      }
      const rel = memory.graphRepo.upsertRelation({
        sourceEntityId,
        targetEntityId,
        relationType,
        confidence: confidence !== undefined ? Number(confidence) : 1.0,
      });

      memory.contradictionResolver.resolveContradiction(
        sourceEntityId,
        targetEntityId,
        relationType,
        rel.id
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
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const episodes = memory.episodicRepo.listEpisodes({ sessionId, limit });
      res.json(episodes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ingestion
  router.post('/ingest', async (req: Request, res: Response) => {
    try {
      const { sessionId, turns, outcome, summary, importance } = req.body;
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
      });
      res.status(201).json(episode);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Recall Simulator Query
  router.post('/query', async (req: Request, res: Response) => {
    try {
      const { query, topK, maxTokens, weights, graphHops, includeEpisodes } = req.body;
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
      });
      res.json(recalled);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trigger consolidation manually
  router.post('/consolidate', async (_req: Request, res: Response) => {
    try {
      const stats = await memory.consolidate();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
