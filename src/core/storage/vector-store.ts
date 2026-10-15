import { DatabaseManager } from './database.js';
import { VectorItem } from '../types.js';
import { randomUUID } from 'node:crypto';

export type CustomEmbedder = (text: string) => Promise<number[]> | number[];

export class VectorStore {
  private db: DatabaseManager;
  private readonly defaultDimension = 128;
  private customEmbedder?: CustomEmbedder;

  constructor(db: DatabaseManager, customEmbedder?: CustomEmbedder) {
    this.db = db;
    this.customEmbedder = customEmbedder;
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    if (this.customEmbedder) {
      const result = await this.customEmbedder(text);
      return this.normalizeVector(result);
    }
    return this.deterministicLocalEmbedding(text, this.defaultDimension);
  }

  public async storeEmbedding(
    itemType: 'ENTITY' | 'EPISODE',
    itemId: string,
    text: string,
    namespace: string = 'default'
  ): Promise<VectorItem> {
    const vector = await this.generateEmbedding(text);
    const float32 = new Float32Array(vector);
    const buffer = Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength);
    const id = `vec_${randomUUID()}`;
    const now = Date.now();

    this.deleteEmbedding(itemType, itemId, namespace);

    const stmt = this.db.prepare(`
      INSERT INTO vector_embeddings (id, item_type, item_id, dimension, vector_data, created_at, namespace)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, itemType, itemId, vector.length, buffer, now, namespace);

    return {
      id,
      itemType,
      itemId,
      dimension: vector.length,
      vector,
      createdAt: now,
      namespace,
    };
  }

  public async searchSimilar(
    queryText: string,
    itemType?: 'ENTITY' | 'EPISODE',
    limit: number = 10,
    namespace?: string
  ): Promise<Array<{ itemId: string; itemType: string; similarity: number }>> {
    const queryVector = await this.generateEmbedding(queryText);
    const queryF32 = new Float32Array(queryVector);

    let sql = 'SELECT id, item_type, item_id, dimension, vector_data FROM vector_embeddings';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (itemType) {
      conditions.push('item_type = ?');
      params.push(itemType);
    }

    if (namespace && namespace !== '*') {
      conditions.push('namespace = ?');
      params.push(namespace);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const rows = (this.db.prepare(sql).all as any)(...params) as Array<{
      id: string;
      item_type: string;
      item_id: string;
      dimension: number;
      vector_data: Uint8Array;
    }>;

    const results: Array<{ itemId: string; itemType: string; similarity: number }> = [];

    for (const row of rows) {
      const u8 = row.vector_data;
      const f32 = new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4);

      if (f32.length !== queryF32.length) {
        continue;
      }

      let dotProduct = 0;
      for (let i = 0; i < f32.length; i++) {
        dotProduct += f32[i] * queryF32[i];
      }

      results.push({
        itemId: row.item_id,
        itemType: row.item_type,
        similarity: Math.max(0, Math.min(1, (dotProduct + 1) / 2)), // Normalized 0..1
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  public deleteEmbedding(itemType: string, itemId: string, namespace?: string): boolean {
    let sql = 'DELETE FROM vector_embeddings WHERE item_type = ? AND item_id = ?';
    const params: unknown[] = [itemType, itemId];
    if (namespace && namespace !== '*') {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }
    const stmt = this.db.prepare(sql);
    const res = (stmt.run as any)(...params);
    return Number(res.changes) > 0;
  }

  /**
   * Deterministic, zero-dependency subword and n-gram semantic feature hashing.
   * Produces dense unit-normalized vectors suitable for cosine search across entities and queries.
   */
  public deterministicLocalEmbedding(text: string, dimension: number = 128): number[] {
    const vector = new Float32Array(dimension);
    const normalized = text.toLowerCase().trim();
    if (!normalized) {
      return Array.from(vector);
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);

    // 1. Word token unigrams
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const h = this.hashString(token);
      const idx = Math.abs(h) % dimension;
      const weight = 1.0 + 1.0 / (i + 1); // Positional weighting
      vector[idx] += weight;
    }

    // 2. Character trigrams for subword/typo tolerance
    for (let i = 0; i < normalized.length - 2; i++) {
      const trigram = normalized.substring(i, i + 3);
      const h = this.hashString(trigram);
      const idx = Math.abs(h) % dimension;
      vector[idx] += 0.35;
    }

    // 3. Bigram token pairs for local context
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      const h = this.hashString(bigram);
      const idx = Math.abs(h) % dimension;
      vector[idx] += 0.75;
    }

    return this.normalizeVector(Array.from(vector));
  }

  private hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash;
  }

  private normalizeVector(vec: number[]): number[] {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }
}
