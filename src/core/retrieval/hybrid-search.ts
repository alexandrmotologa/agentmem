import { GraphRepository } from '../storage/graph-repo.js';
import { EpisodicRepository } from '../storage/episodic-repo.js';
import { VectorStore } from '../storage/vector-store.js';
import { GraphTraversal } from './graph-traversal.js';
import { EntityNode, RecalledMemory, RecallOptions } from '../types.js';

export class HybridSearch {
  private graphRepo: GraphRepository;
  private episodicRepo: EpisodicRepository;
  private vectorStore: VectorStore;
  private traversal: GraphTraversal;

  constructor(
    graphRepo: GraphRepository,
    episodicRepo: EpisodicRepository,
    vectorStore: VectorStore
  ) {
    this.graphRepo = graphRepo;
    this.episodicRepo = episodicRepo;
    this.vectorStore = vectorStore;
    this.traversal = new GraphTraversal(graphRepo);
  }

  public async search(options: RecallOptions): Promise<RecalledMemory[]> {
    const topK = options.topK ?? 5;
    const wVec = options.weights?.vector ?? 0.45;
    const wBM25 = options.weights?.bm25 ?? 0.35;
    const wGraph = options.weights?.graph ?? 0.20;
    const graphHops = options.graphHops ?? 1;

    // 1. Vector Search across entities
    const vectorMatches = await this.vectorStore.searchSimilar(options.query, 'ENTITY', topK * 3);
    const vectorScoreMap = new Map<string, number>();
    for (const match of vectorMatches) {
      vectorScoreMap.set(match.itemId, match.similarity);
    }

    // 2. FTS5 BM25 Search across entities
    const ftsMatches = this.graphRepo.searchEntitiesFts(options.query, topK * 3);
    const ftsScoreMap = new Map<string, number>();
    for (const match of ftsMatches) {
      // Lower rank is better in SQLite FTS5 BM25 (e.g. -5.0 to 0.0), so invert/normalize
      const normScore = Math.max(0, Math.min(1, 1.0 / (1.0 + match.rank)));
      ftsScoreMap.set(match.entity.id, normScore);
    }

    // Combine candidate entity IDs
    const candidateIds = new Set<string>([...vectorScoreMap.keys(), ...ftsScoreMap.keys()]);

    // If query has exact match in entities table, add it
    const directEntity = this.graphRepo.getEntityByName(options.query);
    if (directEntity) {
      candidateIds.add(directEntity.id);
      ftsScoreMap.set(directEntity.id, 1.0);
    }

    // 3. Score candidate entities
    const scoredList: Array<{
      entity: EntityNode;
      vScore: number;
      bScore: number;
      gScore: number;
      finalScore: number;
    }> = [];

    for (const entityId of candidateIds) {
      const entity = this.graphRepo.getEntityById(entityId);
      if (!entity || entity.isArchived) continue;

      const vScore = vectorScoreMap.get(entityId) ?? 0.1;
      const bScore = ftsScoreMap.get(entityId) ?? 0.1;

      // Graph connectivity bonus based on number of active relations
      const neighborhood = this.traversal.traverseNeighborhood(entityId, graphHops);
      const neighborCount = neighborhood?.neighbors.length ?? 0;
      const gScore = Math.min(1.0, neighborCount * 0.2);

      // Blended score modulated by importance and retention
      const rawBlend = (vScore * wVec) + (bScore * wBM25) + (gScore * wGraph);
      const finalScore = rawBlend * entity.importanceScore * entity.decayRetention;

      scoredList.push({
        entity,
        vScore,
        bScore,
        gScore,
        finalScore: Math.round(finalScore * 1000) / 1000,
      });
    }

    // Sort descending by finalScore
    scoredList.sort((a, b) => b.finalScore - a.finalScore);
    const selected = scoredList.slice(0, topK);

    // 4. Retrieve connected relations and relevant episodes
    const results: RecalledMemory[] = [];

    // Search episodes matching query
    const episodeFts = options.includeEpisodes !== false
      ? this.episodicRepo.searchEpisodesFts(options.query, 3)
      : [];
    const relevantEpisodes = episodeFts.map((e) => ({
      sessionId: e.episode.sessionId,
      summary: e.episode.summary,
      timestamp: e.episode.createdAt,
    }));

    for (const item of selected) {
      // Reinforce memory: increment access count and refresh retention
      this.graphRepo.incrementAccessCount(item.entity.id);

      const neighborhood = this.traversal.traverseNeighborhood(item.entity.id, graphHops);
      const connectedRelations = neighborhood?.neighbors.map((n) => ({
        relation: n.relation,
        targetName: n.targetName,
        targetType: n.targetType,
        direction: n.direction,
      })) ?? [];

      results.push({
        entity: item.entity,
        connectedRelations,
        relevantEpisodes,
        scores: {
          vectorScore: item.vScore,
          bm25Score: item.bScore,
          graphScore: item.gScore,
          finalScore: item.finalScore,
        },
        totalRelevanceScore: item.finalScore,
      });
    }

    return results;
  }
}
