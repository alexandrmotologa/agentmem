import type { DatabaseSync as DatabaseSyncType, StatementSync as StatementSyncType } from 'node:sqlite';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

function getDatabaseSyncConstructor(): new (path: string) => DatabaseSyncType {
  const req = createRequire(process.cwd() + '/');
  return req('node:sqlite').DatabaseSync;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export type SqlParam = string | number | bigint | null | Uint8Array;

export class DatabaseManager {
  private db: DatabaseSyncType;
  public readonly dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    const DatabaseSync = getDatabaseSyncConstructor();
    this.db = new DatabaseSync(dbPath);
    this.configurePragmas();
    this.initSchema();
  }

  private configurePragmas(): void {
    if (this.dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private initSchema(): void {
    const tablesSql = `
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
        is_archived INTEGER NOT NULL DEFAULT 0,
        namespace TEXT NOT NULL DEFAULT 'default'
      );

      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        valid_until INTEGER,
        superseded_by TEXT REFERENCES relations(id),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default'
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        raw_turns TEXT NOT NULL DEFAULT '[]',
        importance REAL NOT NULL DEFAULT 0.5,
        outcome TEXT NOT NULL DEFAULT 'SUCCESS',
        created_at INTEGER NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default',
        agent_id TEXT
      );

      CREATE TABLE IF NOT EXISTS working_memory (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tokens INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default',
        agent_id TEXT
      );

      CREATE TABLE IF NOT EXISTS vector_embeddings (
        id TEXT PRIMARY KEY,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        dimension INTEGER NOT NULL,
        vector_data BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default'
      );

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
    `;

    this.db.exec(tablesSql);
    this.runMigrations();

    const indicesSql = `
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_entities_importance ON entities(importance_score);
      CREATE INDEX IF NOT EXISTS idx_entities_retention ON entities(decay_retention);
      CREATE INDEX IF NOT EXISTS idx_entities_namespace ON entities(namespace);

      CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
      CREATE INDEX IF NOT EXISTS idx_relations_valid ON relations(valid_until);
      CREATE INDEX IF NOT EXISTS idx_relations_namespace ON relations(namespace);

      CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_created ON episodes(created_at);
      CREATE INDEX IF NOT EXISTS idx_episodes_namespace ON episodes(namespace);
      CREATE INDEX IF NOT EXISTS idx_episodes_agent ON episodes(agent_id);

      CREATE INDEX IF NOT EXISTS idx_working_session_time ON working_memory(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_working_namespace ON working_memory(namespace);

      CREATE INDEX IF NOT EXISTS idx_vectors_item ON vector_embeddings(item_type, item_id);
      CREATE INDEX IF NOT EXISTS idx_vectors_namespace ON vector_embeddings(namespace);
    `;

    this.db.exec(indicesSql);
  }

  private runMigrations(): void {
    const migrations = [
      "ALTER TABLE entities ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';",
      "ALTER TABLE relations ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';",
      "ALTER TABLE episodes ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';",
      'ALTER TABLE episodes ADD COLUMN agent_id TEXT;',
      "ALTER TABLE working_memory ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';",
      'ALTER TABLE working_memory ADD COLUMN agent_id TEXT;',
      "ALTER TABLE vector_embeddings ADD COLUMN namespace TEXT NOT NULL DEFAULT 'default';",
    ];

    for (const sql of migrations) {
      try {
        this.db.exec(sql);
      } catch {
        // Column already exists, safe to ignore
      }
    }
  }

  public prepare(sql: string): StatementSyncType {
    return this.db.prepare(sql);
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  public close(): void {
    this.db.close();
  }

  public getRawDb(): DatabaseSyncType {
    return this.db;
  }
}
