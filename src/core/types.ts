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
  namespace: string;
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
  namespace: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  agentId?: string;
}

export interface Episode {
  id: string;
  sessionId: string;
  summary: string;
  rawTurns: ConversationTurn[];
  importance: number;
  outcome: string;
  createdAt: number;
  namespace: string;
  agentId?: string | null;
}

export interface WorkingMemoryItem {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  tokens: number;
  timestamp: number;
  namespace: string;
  agentId?: string | null;
}

export interface VectorItem {
  id: string;
  itemType: 'ENTITY' | 'EPISODE';
  itemId: string;
  dimension: number;
  vector: number[];
  createdAt: number;
  namespace: string;
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
    agentId?: string | null;
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
  injectedPrompt?: string;
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
  namespace?: string;
  agentId?: string;
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
  namespace?: string;
}

export interface MemoryConfig {
  dbPath?: string;
  defaultNamespace?: string;
  maxWorkingMemoryTokens?: number;
  decayHalfLifeDays?: number;
  pruneRetentionThreshold?: number;
  hybridWeights?: {
    vector: number;
    bm25: number;
    graph: number;
  };
}

export interface DocumentIngestResult {
  filePath: string;
  sectionsProcessed: number;
  entitiesCreated: number;
  relationsCreated: number;
  tripletsExtracted: number;
  durationMs: number;
}

export interface ConflictItem {
  id: string;
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  relationType: string;
  supersededBy?: string | null;
  validUntil?: number | null;
  confidence: number;
  createdAt: number;
  namespace: string;
}

export type ExportFormat = 'json' | 'graphml' | 'cypher';
