import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentMemory } from '../src/core/agent-memory.js';

describe('Graph Export, Import & Conflict Resolution', () => {
  let memory: AgentMemory;

  beforeEach(async () => {
    memory = new AgentMemory({ dbPath: ':memory:' });
    await memory.initialize();
  });

  afterEach(() => {
    memory.close();
  });

  it('exports graph to JSON, GraphML, and Cypher formats', async () => {
    await memory.ingestTurn('s1', {
      role: 'user',
      content: 'User prefers PostgreSQL and uses TypeScript.',
    });

    const jsonExport = memory.exportGraph('json');
    const parsed = JSON.parse(jsonExport);
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.nodes.length).toBeGreaterThan(0);
    expect(parsed.edges.length).toBeGreaterThan(0);

    const graphmlExport = memory.exportGraph('graphml');
    expect(graphmlExport).toContain('<graphml');
    expect(graphmlExport).toContain('<node id=');
    expect(graphmlExport).toContain('</graphml>');

    const cypherExport = memory.exportGraph('cypher');
    expect(cypherExport).toContain('MERGE (n:');
    expect(cypherExport).toContain('COMMIT;');
  });

  it('imports graph from JSON export into a fresh memory instance', async () => {
    await memory.ingestTurn('s1', {
      role: 'user',
      content: 'User prefers Vite and uses TailwindCSS.',
    });

    const exportedJson = memory.exportGraph('json');

    const freshMemory = new AgentMemory({ dbPath: ':memory:' });
    await freshMemory.initialize();

    const importResult = await freshMemory.importGraph(exportedJson, 'json', 'imported_ns');
    expect(importResult.entitiesImported).toBeGreaterThan(0);

    const importedGraph = freshMemory.getGraphData('imported_ns');
    const names = importedGraph.nodes.map((n) => n.name);
    expect(names).toContain('Vite');
    expect(names).toContain('TailwindCSS');

    freshMemory.close();
  });

  it('detects and resolves conflicting superseded relationships', async () => {
    // 1. Initial preference
    await memory.ingestTurn('s1', {
      role: 'user',
      content: 'I prefer MySQL for my database.',
    });

    // 2. Later update contradicting the preference
    await memory.ingestTurn('s2', {
      role: 'user',
      content: 'Actually, I now prefer PostgreSQL for my database.',
    });

    const conflicts = memory.listConflicts('default');
    expect(conflicts.length).toBeGreaterThan(0);

    const mysqlConflict = conflicts.find((c) => c.targetEntityName === 'MySQL');
    expect(mysqlConflict).toBeDefined();

    // Resolve conflict by keeping new preference (deletes old superseded edge)
    const resolved = memory.resolveConflict(mysqlConflict!.id, 'KEEP_NEW');
    expect(resolved).toBe(true);

    const remainingConflicts = memory.listConflicts('default');
    expect(remainingConflicts.length).toBe(0);
  });
});
