import { AgentMemory } from '../src/index.js';

async function main() {
  console.log('=== AgentMem Ingestion and Recall Demo ===\n');

  // 1. Initialize in-memory or file-backed database
  const memory = new AgentMemory({ dbPath: ':memory:' });
  await memory.initialize();

  // 2. Ingest Session 1: Initial stack setup and constraints
  console.log('1. Ingesting Session 1: Architecture constraints...');
  await memory.ingestEpisode({
    sessionId: 'session_init',
    turns: [
      { role: 'user', content: 'Our production database is PostgreSQL on AWS Aurora.' },
      { role: 'assistant', content: 'Got it. Database is set to PostgreSQL on AWS Aurora.' },
      { role: 'user', content: 'Strictly avoid any ORMs. Always format database migrations as pure SQL.' },
      { role: 'assistant', content: 'Constraint recorded: pure SQL migrations without ORMs.' },
      { role: 'user', content: 'I prefer TypeScript for backend code.' }
    ]
  });

  // 3. Query memory for architectural advice
  console.log('\n2. Recalling context for user query: "How should I structure the schema changes?"');
  const recallResult = await memory.recall({
    query: 'How should I structure the schema changes?',
    maxTokens: 400,
    graphHops: 2,
    includeEpisodes: true
  });

  console.log('\n--- Generated System Prompt Snippet ---');
  console.log(recallResult.systemPromptSnippet);
  console.log('---------------------------------------\n');

  // 4. Ingest Session 2: Preference update (Contradiction resolution test)
  console.log('3. Ingesting Session 2: User updates preference to SQLite...');
  await memory.ingestEpisode({
    sessionId: 'session_migration',
    turns: [
      { role: 'user', content: 'We migrated from PostgreSQL to SQLite for edge performance.' },
      { role: 'user', content: 'I prefer SQLite now.' }
    ]
  });

  // 5. Run consolidation cycle
  console.log('\n4. Running background consolidation cycle...');
  const stats = await memory.consolidate();
  console.log(`Consolidation finished in ${stats.durationMs}ms (Scored: ${stats.entitiesScored}, Deduplicated: ${stats.deduplicatedCount})`);

  // 6. Query memory again to verify contradiction resolution
  console.log('\n5. Recalling context for: "What database does the user prefer?"');
  const updatedRecall = await memory.recall({
    query: 'What database does the user prefer?',
    maxTokens: 400
  });

  console.log('\n--- Updated System Prompt Snippet ---');
  console.log(updatedRecall.systemPromptSnippet);
  console.log('-------------------------------------\n');

  memory.close();
}

main().catch(console.error);
