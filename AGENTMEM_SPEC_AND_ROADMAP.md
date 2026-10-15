# Engineering Specification & Implementation Blueprint: AgentMem
> Hierarchical Long-Term Memory, Entity Knowledge Graph & Memory Consolidation Engine for AI Agents

---

## 1. Executive Summary & Problem Space

### 1.1 The Amnesia Barrier in Autonomous Agents
Current production AI agents suffer from catastrophic context loss across long conversations and multi-session interactions. When context windows fill up, agents resort to crude workarounds that compromise system performance:

1. **Window Truncation:** Older conversation turns are dropped blindly, causing the agent to forget critical user preferences, project constraints, and past decisions.
2. **Naive RAG over Chat Logs:** Standard retrieval-augmented generation searches past raw message strings. This frequently fails because natural dialogue is disorganized; retrieving a raw message like "yes, do that" lacks the semantic entity context of what "that" was.
3. **Absence of Memory Consolidation:** Human cognition continuously converts short-term experiences into structured episodic summaries and permanent semantic knowledge. Current agent frameworks lack an automated background engine to distill conversations into enduring entity graphs while discarding conversational filler.

### 1.2 The Solution: AgentMem
**AgentMem** is an embeddable long-term memory engine and visual memory inspector built in **TypeScript and SQLite** for autonomous agents and conversational LLM applications.

* **Three-Tier Hierarchical Memory Architecture:**
  1. **Working Memory:** High-speed in-context buffer with dynamic token budget management.
  2. **Episodic Memory:** Chronological session summaries enriched with temporal metadata, task outcomes, and importance weights.
  3. **Semantic Knowledge Graph:** Structured entity-relation-entity triplets (e.g. `User` -> `prefers` -> `TypeScript`, `Project` -> `deployed_on` -> `AWS Bedrock`) stored in local SQLite tables.
* **Automated Memory Consolidation Engine:** Background processor that analyzes completed sessions, extracts new entities and relationship updates, resolves contradictory facts, and prunes stale memories using an algorithmic recency and importance decay curve.
* **Hybrid Retrieval (Vector + BM25 + Graph Traversal):** Blends semantic vector embeddings with SQLite FTS5 keyword search and entity graph adjacency lookups to retrieve the most relevant facts in under 15ms.
* **Embedded Memory Studio:** A React 19 dashboard allowing developers to explore the agent's interactive entity knowledge graph, inspect memory recall scores, and manually edit or erase stored facts.

---

## 2. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AgentMem Architecture                         │
└────────────────────────────────────────────────────────────────────────┘

[ Agent Framework / Application ] ---> [ AgentMem SDK (TypeScript) ]
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      AgentMem Memory Core                              │
├────────────────────────────────────────────────────────────────────────┤
│  Ingestion & Fact Extraction Pipeline                                  │
│    ├── Entity & Triplet Extractor (Subject - Predicate - Object)       │
│    ├── Contradiction Resolver (Updates conflicting existing facts)     │
│    └── Importance Scorer (Assigns retention weight 0.0 - 1.0)          │
├────────────────────────────────────────────────────────────────────────┤
│  Hierarchical Storage Engine (Embedded SQLite)                         │
│    ├── Working Memory: Session active buffer cache                     │
│    ├── Episodic Store: Time-series session narrative summaries         │
│    ├── Semantic Store: Relational Graph (Entities, Relations, Values)  │
│    └── Vector Store: SQLite-vec or in-memory array for cosine search   │
├────────────────────────────────────────────────────────────────────────┤
│  Consolidation & Decay Daemon                                          │
│    ├── Recency & Frequency Scoring (Ebbinghaus decay curve)            │
│    ├── Noise Pruning (Purges low-importance ephemeral chatter)         │
│    └── Entity Graph Deduplication & Merging                            │
├────────────────────────────────────────────────────────────────────────┤
│  Hybrid Recall & Context Synthesizer                                   │
│    ├── Combined Vector + FTS5 Full-Text + Graph Neighbor Query         │
│    └── Formats compact Markdown prompt injection: `<agent_memory>...`  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                [ React 19 Memory Studio (Port 50094) ]
```

### Technology Stack Choices
* **Runtime:** Node.js 22 LTS / TypeScript 5.6+
* **Storage:** Embedded SQLite via `better-sqlite3` (with SQLite FTS5 enabled)
* **Graph Structure:** Relational adjacency schema with recursive CTE queries
* **Web Studio:** React 19 + Vite 6 + Tailwind CSS + Force-directed Graph Canvas
* **CLI Engine:** Commander.js + Picocolors + Ora + Table

---

## 3. Directory & File Structure

```
agentmem/
├── bin/
│   └── agentmem.js                 # CLI executable entry point
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── consolidate.ts      # agentmem consolidate --db <path>
│   │   │   ├── query.ts            # agentmem query "What stack does the user prefer?"
│   │   │   └── studio.ts           # agentmem studio (Launches embedded visual graph)
│   │   └── index.ts
│   ├── core/
│   │   ├── consolidation/
│   │   │   ├── contradiction.ts    # Resolves conflicting knowledge updates
│   │   │   ├── decay-engine.ts     # Calculates retention scores based on time and access count
│   │   │   └── summarizer.ts       # Distills raw dialogues into episodic milestones
│   │   ├── extraction/
│   │   │   ├── entity-extractor.ts # Extracts entities, types, and properties
│   │   │   └── triplet-parser.ts   # Parses Subject-Predicate-Object relations
│   │   ├── retrieval/
│   │   │   ├── graph-traversal.ts  # Adjacency queries for connected entity contexts
│   │   │   ├── hybrid-search.ts    # Combines vector similarity with FTS5 keyword ranking
│   │   │   └── prompt-builder.ts   # Formats recalled memories for LLM system prompt injection
│   │   └── storage/
│   │       ├── database.ts         # SQLite connection and migration runner
│   │       ├── episodic-repo.ts    # CRUD for session summaries
│   │       ├── graph-repo.ts       # CRUD for nodes and edges
│   │       └── schema.sql          # DDL for entities, relations, episodes, and vectors
│   ├── server/
│   │   ├── api-router.ts           # REST endpoints for embedded Studio
│   │   └── local-server.ts         # Embedded HTTP server
│   └── studio/                     # React 19 Frontend Web Studio
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── EpisodicTimeline.tsx    # Chronological history of consolidated sessions
│       │   │   ├── KnowledgeGraph.tsx      # Force-directed 2D canvas of entity relations
│       │   │   ├── MemoryEditorModal.tsx   # Manual editing and fact deletion
│       │   │   └── RecallSimulator.tsx     # Enter prompt, inspect retrieved memory context
│       │   ├── styles/
│       │   │   └── index.css
│       │   └── main.tsx
│       └── vite.config.ts
├── tests/
│   ├── consolidation/
│   │   └── decay-engine.test.ts
│   ├── extraction/
│   │   └── triplet-parser.test.ts
│   └── retrieval/
│       └── hybrid-search.test.ts
├── examples/
│   ├── agent-conversation-trace.json
│   └── memory-injection-demo.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Core Data Contracts & Interfaces

```typescript
// src/core/storage/graph-repo.ts
export interface EntityNode {
  id: string;
  name: string;
  entityType: 'PERSON' | 'PROJECT' | 'TECHNOLOGY' | 'PREFERENCE' | 'CONSTRAINT' | 'CONCEPT';
  properties: Record<string, unknown>;
  importanceScore: number; // 0.0 to 1.0
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  lastRecalledAt: number;
}

export interface RelationEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string; // e.g. "PREFERS", "USES", "DEPLOYED_ON", "RESTRICTS"
  confidence: number;
  validUntil?: number; // Optional expiration for temporal facts
}

// src/core/retrieval/hybrid-search.ts
export interface RecalledMemory {
  entity: EntityNode;
  connectedRelations: Array<{
    relation: string;
    targetName: string;
    targetType: string;
  }>;
  relevantEpisodes: Array<{
    sessionId: string;
    summary: string;
    timestamp: number;
  }>;
  totalRelevanceScore: number;
}

export interface InjectedContextResult {
  systemPromptSnippet: string; // Ready to prepend to agent system prompt
  tokenCount: number;
  recalledEntityIds: string[];
}
```

---

## 5. Implementation Roadmap (Phases 1-5)

### Phase 1: SQLite Storage & Graph Schema
* Implement SQLite database initialization with WAL mode and foreign key constraints.
* Create schema tables: `entities`, `relations`, `episodes`, `vector_embeddings`, and `fts_entities` (FTS5 virtual table).
* Write unit tests validating transactional integrity and recursive entity traversal via Common Table Expressions (CTE).

### Phase 2: Triplet Extraction & Ingestion Pipeline
* Implement rule-based and LLM-assisted entity and relationship extraction.
* Build contradiction resolution: if an entity receives an updated preference (e.g. "User switched from Python to TypeScript"), update the target edge and mark old edges as superseded.
* Implement importance scoring based on entity type and user affirmation markers.

### Phase 3: Hybrid Retrieval & Context Injection
* Build `hybrid-search.ts` executing FTS5 keyword matching and vector cosine distance.
* Implement 1-hop and 2-hop graph expansion to include directly connected facts.
* Build `prompt-builder.ts` generating concise, token-efficient `<agent_memory>` blocks designed for zero-hallucination agent consumption.

### Phase 4: Consolidation Daemon & Decay Engine
* Implement the Ebbinghaus forgetting curve: decrease memory weight over time while boosting memories accessed frequently.
* Build background pruning routine that flushes low-importance ephemeral conversational noise.
* Implement episodic narrative compression: summarize multi-turn chat sessions into compact event milestones.

### Phase 5: Embedded React 19 Studio & Documentation
* Build 2D force-directed knowledge graph canvas using Canvas API or React Flow.
* Add live search and filter controls to isolate entities by type (`TECHNOLOGY`, `PREFERENCE`, etc.).
* Build interactive Recall Simulator: test user queries and inspect exactly which entities and episodes are pulled into memory context.
* Write clean, humanized `README.md` with integration examples for Claude, OpenAI, and LangGraph.
