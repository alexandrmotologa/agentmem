import { AgentMemory } from '../dist/index.js';
import * as path from 'node:path';

async function seed() {
  const dbPath = path.resolve('agentmem.db');
  console.log(`Seeding database at ${dbPath}...`);

  const memory = new AgentMemory({
    dbPath,
    defaultNamespace: 'default',
  });
  await memory.initialize();

  // 1. Ingest spec document into 'production' namespace
  console.log('Ingesting AGENTMEM_SPEC_AND_ROADMAP.md...');
  await memory.ingestDocument(path.resolve('AGENTMEM_SPEC_AND_ROADMAP.md'), {
    namespace: 'production',
    projectName: 'AgentMem',
  });

  // 2. Ingest rich multi-agent conversations into 'default' namespace
  console.log('Ingesting multi-turn conversation traces...');
  await memory.ingestEpisode({
    sessionId: 'session_arch_01',
    namespace: 'default',
    agentId: 'architect_agent',
    outcome: 'ARCHITECTURE_FINALIZED',
    summary: 'Configured core SQLite database parameters, write-ahead logging (WAL), and FTS5 search tables.',
    turns: [
      { role: 'user', content: 'We need to design the persistent memory engine for autonomous agents.' },
      { role: 'assistant', content: 'I recommend embedded SQLite with write-ahead logging (WAL) for microsecond latency and zero infrastructure overhead.' },
      { role: 'user', content: 'Agreed. The database uses SQLite with FTS5 and vector cosine similarity.' },
    ],
  });

  await memory.ingestEpisode({
    sessionId: 'session_ui_02',
    namespace: 'default',
    agentId: 'frontend_agent',
    outcome: 'UI_READY',
    summary: 'Built interactive 2D force-directed canvas, recall simulator, and conflict resolver in React 19.',
    turns: [
      { role: 'user', content: 'Build a visual dashboard so developers can inspect agent memories.' },
      { role: 'assistant', content: 'Created React 19 Web Studio on port 50094 with Canvas graph rendering and simulator.' },
      { role: 'user', content: 'The user prefers dark mode and concise tabular outputs.' },
    ],
  });

  // 3. Create an intentional contradiction to demonstrate the Conflict Resolver
  console.log('Creating sample contradictory relations for Conflict Resolver...');
  await memory.ingestTurn('session_pref_01', {
    role: 'user',
    content: 'I prefer MySQL for my database.',
  }, 'default');

  await memory.ingestTurn('session_pref_02', {
    role: 'user',
    content: 'Actually, I now prefer PostgreSQL for my database.',
  }, 'default');

  const stats = memory.getGraphData('default');
  console.log(`✓ Seeding complete: ${stats.nodes.length} nodes, ${stats.edges.length} edges in default namespace.`);

  memory.close();
}

seed().catch(console.error);
