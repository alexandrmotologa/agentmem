-- AgentMem Embedded SQLite Schema
-- Enables foreign key constraints and WAL mode in runtime

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  importance_score REAL NOT NULL DEFAULT 0.5,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_recalled_at INTEGER NOT NULL,
  decay_retention REAL NOT NULL DEFAULT 1.0,
  is_archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_importance ON entities(importance_score);
CREATE INDEX IF NOT EXISTS idx_entities_retention ON entities(decay_retention);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  valid_until INTEGER,
  superseded_by TEXT REFERENCES relations(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
CREATE INDEX IF NOT EXISTS idx_relations_valid ON relations(valid_until);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  raw_turns TEXT NOT NULL DEFAULT '[]',
  importance REAL NOT NULL DEFAULT 0.5,
  outcome TEXT NOT NULL DEFAULT 'SUCCESS',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
CREATE INDEX IF NOT EXISTS idx_episodes_created ON episodes(created_at);

CREATE TABLE IF NOT EXISTS working_memory (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_working_session_time ON working_memory(session_id, timestamp);

CREATE TABLE IF NOT EXISTS vector_embeddings (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vectors_item ON vector_embeddings(item_type, item_id);

-- Full-Text Search FTS5 Virtual Tables
CREATE VIRTUAL TABLE IF NOT EXISTS fts_entities USING fts5(
  entity_id UNINDEXED,
  name,
  entity_type,
  properties_text
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_episodes USING fts5(
  episode_id UNINDEXED,
  session_id,
  summary
);
