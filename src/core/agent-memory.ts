import { DatabaseManager } from './storage/database.js';
import { GraphRepository } from './storage/graph-repo.js';
import { EpisodicRepository } from './storage/episodic-repo.js';
import { WorkingMemoryManager } from './storage/working-memory.js';
import { VectorStore, CustomEmbedder } from './storage/vector-store.js';
import { TripletParser } from './extraction/triplet-parser.js';
import { EntityExtractor } from './extraction/entity-extractor.js';
import { ContradictionResolver } from './extraction/contradiction.js';
import { ImportanceScorer } from './extraction/importance.js';
import { DecayEngine } from './consolidation/decay-engine.js';
import { EpisodicSummarizer } from './consolidation/summarizer.js';
import { ConsolidationDaemon } from './consolidation/daemon.js';
import { HybridSearch } from './retrieval/hybrid-search.js';
import { PromptBuilder } from './retrieval/prompt-builder.js';
import {
  MemoryConfig,
  ConversationTurn,
  Episode,
  RecallOptions,
  InjectedContextResult,
  ConsolidationStats,
  EntityNode,
  RelationEdge,
} from './types.js';

export class AgentMemory {
  public readonly db: DatabaseManager;
  public readonly graphRepo: GraphRepository;
  public readonly episodicRepo: EpisodicRepository;
  public readonly workingMemory: WorkingMemoryManager;
  public readonly vectorStore: VectorStore;

  public readonly tripletParser: TripletParser;
  public readonly entityExtractor: EntityExtractor;
  public readonly contradictionResolver: ContradictionResolver;
  public readonly importanceScorer: ImportanceScorer;

  public readonly decayEngine: DecayEngine;
  public readonly summarizer: EpisodicSummarizer;
  public readonly daemon: ConsolidationDaemon;

  public readonly hybridSearch: HybridSearch;
  public readonly promptBuilder: PromptBuilder;

  private isInitialized = false;

  constructor(config?: MemoryConfig & { customEmbedder?: CustomEmbedder }) {
    const dbPath = config?.dbPath ?? ':memory:';
    this.db = new DatabaseManager(dbPath);

    this.graphRepo = new GraphRepository(this.db);
    this.episodicRepo = new EpisodicRepository(this.db);
    this.workingMemory = new WorkingMemoryManager(this.db, config?.maxWorkingMemoryTokens ?? 4000);
    this.vectorStore = new VectorStore(this.db, config?.customEmbedder);

    this.tripletParser = new TripletParser();
    this.entityExtractor = new EntityExtractor();
    this.contradictionResolver = new ContradictionResolver(this.graphRepo);
    this.importanceScorer = new ImportanceScorer();

    this.decayEngine = new DecayEngine(this.db, {
      halfLifeDays: config?.decayHalfLifeDays ?? 7,
      pruneThreshold: config?.pruneRetentionThreshold ?? 0.15,
    });
    this.summarizer = new EpisodicSummarizer();
    this.daemon = new ConsolidationDaemon(this.db, this.graphRepo, this.decayEngine);

    this.hybridSearch = new HybridSearch(this.graphRepo, this.episodicRepo, this.vectorStore);
    this.promptBuilder = new PromptBuilder();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  /**
   * Ingest a single conversation turn:
   * 1. Records into working memory
   * 2. Extracts entities and triplets
   * 3. Stores into semantic graph & vector embeddings
   * 4. Resolves any contradictions
   */
  public async ingestTurn(sessionId: string, turn: ConversationTurn): Promise<void> {
    this.workingMemory.addTurn(sessionId, turn);

    // Only extract facts from user instructions or assistant commitments
    const extractedTriplets = this.tripletParser.parse(turn.content);
    const candidateEntities = this.entityExtractor.extractEntities(turn.content);

    // Upsert candidate entities
    for (const cand of candidateEntities) {
      const importance = this.importanceScorer.scoreEntity(
        cand.name,
        cand.entityType,
        turn.content
      );
      const entity = this.graphRepo.upsertEntity({
        name: cand.name,
        entityType: cand.entityType,
        properties: cand.properties,
        importanceScore: importance,
      });

      await this.vectorStore.storeEmbedding(
        'ENTITY',
        entity.id,
        `${entity.name} ${entity.entityType} ${JSON.stringify(entity.properties)}`
      );
    }

    // Upsert triplets as graph relations
    for (const triplet of extractedTriplets) {
      const subjEntity = this.graphRepo.upsertEntity({
        name: triplet.subject,
        entityType: triplet.subjectType,
        importanceScore: triplet.importance,
      });

      const objEntity = this.graphRepo.upsertEntity({
        name: triplet.object,
        entityType: triplet.objectType,
        importanceScore: triplet.importance,
      });

      const rel = this.graphRepo.upsertRelation({
        sourceEntityId: subjEntity.id,
        targetEntityId: objEntity.id,
        relationType: triplet.predicate,
        confidence: triplet.confidence,
        validUntil: triplet.temporal?.validUntil,
      });

      // Check for contradiction
      this.contradictionResolver.resolveContradiction(
        subjEntity.id,
        objEntity.id,
        triplet.predicate,
        rel.id
      );

      // Embed both entities
      await this.vectorStore.storeEmbedding(
        'ENTITY',
        subjEntity.id,
        `${subjEntity.name} ${subjEntity.entityType}`
      );
      await this.vectorStore.storeEmbedding(
        'ENTITY',
        objEntity.id,
        `${objEntity.name} ${objEntity.entityType}`
      );
    }
  }

  /**
   * Ingest a completed conversation session into episodic memory
   */
  public async ingestEpisode(input: {
    sessionId: string;
    turns: ConversationTurn[];
    outcome?: string;
    summary?: string;
    importance?: number;
  }): Promise<Episode> {
    // 1. Ingest all turns individually to populate knowledge graph
    for (const turn of input.turns) {
      await this.ingestTurn(input.sessionId, turn);
    }

    // 2. Generate episodic summary
    let summaryText = input.summary;
    let importanceScore = input.importance;

    if (!summaryText) {
      const summaryResult = await this.summarizer.summarize(input.turns);
      summaryText = summaryResult.summary;
      if (importanceScore === undefined) {
        importanceScore = summaryResult.importance;
      }
    }

    // 3. Create episode
    const episode = this.episodicRepo.createEpisode({
      sessionId: input.sessionId,
      summary: summaryText,
      rawTurns: input.turns,
      importance: importanceScore ?? 0.5,
      outcome: input.outcome || 'SUCCESS',
    });

    // 4. Vectorize episode summary for recall
    await this.vectorStore.storeEmbedding(
      'EPISODE',
      episode.id,
      `${episode.sessionId} ${episode.summary}`
    );

    return episode;
  }

  /**
   * Retrieve relevant context for an agent query
   */
  public async recall(options: RecallOptions): Promise<InjectedContextResult> {
    const recalledMemories = await this.hybridSearch.search(options);
    return this.promptBuilder.buildPrompt(recalledMemories, options.maxTokens ?? 600);
  }

  /**
   * Run memory consolidation and decay pruning
   */
  public async consolidate(): Promise<ConsolidationStats> {
    return await this.daemon.consolidate();
  }

  /**
   * Get formatted graph data for React 19 Studio visualization
   */
  public getGraphData(): {
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      importance: number;
      accessCount: number;
      retention: number;
      properties: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      label: string;
      confidence: number;
      superseded: boolean;
    }>;
  } {
    const entities = this.graphRepo.listEntities({ limit: 1000, includeArchived: false });
    const relations = this.graphRepo.listRelations({ activeOnly: false });

    return {
      nodes: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.entityType,
        importance: e.importanceScore,
        accessCount: e.accessCount,
        retention: e.decayRetention,
        properties: e.properties,
      })),
      edges: relations.map((r) => ({
        id: r.id,
        source: r.sourceEntityId,
        target: r.targetEntityId,
        label: r.relationType,
        confidence: r.confidence,
        superseded: Boolean(r.supersededBy || (r.validUntil && r.validUntil < Date.now())),
      })),
    };
  }

  public close(): void {
    this.daemon.stopBackgroundScheduler();
    this.db.close();
  }
}
