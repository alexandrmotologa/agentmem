import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentMemory } from '../src/core/agent-memory.js';
import { LocalServer } from '../src/server/local-server.js';

describe('LocalServer & REST API', () => {
  let memory: AgentMemory;
  let server: LocalServer;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    memory = new AgentMemory({ dbPath: ':memory:' });
    await memory.initialize();

    // Ingest sample data
    await memory.ingestEpisode({
      sessionId: 'api_test_session',
      turns: [
        { role: 'user', content: 'Our stack uses React 19 and Tailwind CSS.' },
        { role: 'user', content: 'Always format code with Biome.' },
      ],
    });

    server = new LocalServer(memory, 50199);
    port = await server.start();
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await server.stop();
    memory.close();
  });

  it('responds to /api/health with status ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('ok');
    expect(data.engine).toBe('AgentMem');
  });

  it('returns memory statistics at /api/stats', async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.entitiesCount).toBeGreaterThan(0);
    expect(data.episodesCount).toBe(1);
  });

  it('returns graph visualization nodes and edges at /api/graph', async () => {
    const res = await fetch(`${baseUrl}/api/graph`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
    expect(data.nodes.length).toBeGreaterThan(0);
  });

  it('recalls hybrid memories via POST /api/query', async () => {
    const res = await fetch(`${baseUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'What frontend framework and styling do we use?',
        topK: 3,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.systemPromptSnippet).toContain('<agent_memory>');
    expect(data.recalledEntityIds.length).toBeGreaterThan(0);
  });

  it('triggers consolidation via POST /api/consolidate', async () => {
    const res = await fetch(`${baseUrl}/api/consolidate`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
  });
});
