import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentMemory } from '../src/core/agent-memory.js';

describe('Multi-Agent Namespacing and Isolation', () => {
  let memory: AgentMemory;

  beforeEach(async () => {
    memory = new AgentMemory({ dbPath: ':memory:' });
    await memory.initialize();
  });

  afterEach(() => {
    memory.close();
  });

  it('isolates semantic entities and relations between different namespaces', async () => {
    // Ingest into namespace 'agent_alpha'
    await memory.ingestTurn(
      'session_1',
      {
        role: 'user',
        content: 'The backend service runs on port 8080 and prefers PostgreSQL.',
      },
      'agent_alpha'
    );

    // Ingest into namespace 'agent_beta'
    await memory.ingestTurn(
      'session_2',
      {
        role: 'user',
        content: 'The backend service runs on port 9000 and prefers MongoDB.',
      },
      'agent_beta'
    );

    // Query in agent_alpha namespace
    const alphaRecall = await memory.recall({
      query: 'What database and port does backend use?',
      namespace: 'agent_alpha',
    });

    // Query in agent_beta namespace
    const betaRecall = await memory.recall({
      query: 'What database and port does backend use?',
      namespace: 'agent_beta',
    });

    expect(alphaRecall.systemPromptSnippet).toContain('PostgreSQL');
    expect(alphaRecall.systemPromptSnippet).not.toContain('MongoDB');

    expect(betaRecall.systemPromptSnippet).toContain('MongoDB');
    expect(betaRecall.systemPromptSnippet).not.toContain('PostgreSQL');
  });

  it('filters graph data and stats by namespace', async () => {
    await memory.ingestTurn('s1', { role: 'user', content: 'Alice prefers DarkMode.' }, 'ns_ux');
    await memory.ingestTurn('s2', { role: 'user', content: 'Bob prefers Vim.' }, 'ns_dev');

    const uxGraph = memory.getGraphData('ns_ux');
    const devGraph = memory.getGraphData('ns_dev');

    const uxEntityNames = uxGraph.nodes.map((n) => n.name);
    const devEntityNames = devGraph.nodes.map((n) => n.name);

    expect(uxEntityNames).toContain('DarkMode');
    expect(uxEntityNames).not.toContain('Vim');

    expect(devEntityNames).toContain('Vim');
    expect(devEntityNames).not.toContain('DarkMode');
  });
});
