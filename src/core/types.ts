export type EntityType =
  | 'PERSON'
  | 'PROJECT'
  | 'TECHNOLOGY'
  | 'PREFERENCE'
  | 'CONSTRAINT'
  | 'CONCEPT';

export interface EntityNode {
  id: string;
  name: string;
  entityType: EntityType;
  properties: Record<string, unknown>;
  importanceScore: number; // 0.0 to 1.0
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  lastRecalledAt: number;
  decayRetention: number; // 0.0 to 1.0
  isArchived: boolean;
}

export interface RelationEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string;
  confidence: number;
  validUntil?: number | null;
  supersededBy?: string | null;
  createdAt: number;
  updatedAt: number;
  sourceEntityName?: string;
  targetEntityName?: string;
  targetEntityType?: EntityType;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface Episode {
  id: string;
  sessionId: string;
  summary: string;
  rawTurns: ConversationTurn[];
  importance: number;
  outcome: string;
  createdAt: number;
}

export interface WorkingMemoryItem {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  tokens: number;
  timestamp: number;
}

export interface VectorItem {
  id: string;
  itemType: 'ENTITY' | 'EPISODE';
  itemId: string;
  dimension: number;
  vector: number[];
  createdAt: number;
}

export interface RecalledMemory {
  entity: EntityNode;
  connectedRelations: Array<{
    relation: string;
    targetName: string;
    targetType: string;
    direction: 'outgoing' | 'incoming';
  }>;
  relevantEpisodes: Array<{
    sessionId: string;
    summary: string;
    timestamp: number;
  }>;
  scores: {
    vectorScore: number;
    bm25Score: number;
    graphScore: number;
    finalScore: number;
  };
  totalRelevanceScore: number;
}

export interface InjectedContextResult {
  systemPromptSnippet: string;
  tokenCount: number;
  recalledEntityIds: string[];
  recalledEpisodeIds: string[];
  details: RecalledMemory[];
}

export interface RecallOptions {
  query: string;
  maxTokens?: number;
  topK?: number;
  includeEpisodes?: boolean;
  graphHops?: number;
  weights?: {
    vector?: number;
    bm25?: number;
    graph?: number;
  };
}

export interface ExtractedTriplet {
  subject: string;
  subjectType: EntityType;
  predicate: string;
  object: string;
  objectType: EntityType;
  confidence: number;
  importance: number;
  temporal?: {
    isCurrent: boolean;
    validUntil?: number;
  };
}

export interface ConsolidationStats {
  entitiesScored: number;
  prunedEntities: number;
  archivedRelations: number;
  deduplicatedCount: number;
  episodesConsolidated: number;
  durationMs: number;
}

export interface MemoryConfig {
  dbPath?: string;
  maxWorkingMemoryTokens?: number;
  decayHalfLifeDays?: number;
  pruneRetentionThreshold?: number;
  hybridWeights?: {
    vector: number;
    bm25: number;
    graph: number;
  };
}
