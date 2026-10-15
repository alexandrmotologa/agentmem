import { Command } from 'commander';
import { studioCommand } from './commands/studio.js';
import { queryCommand } from './commands/query.js';
import { consolidateCommand } from './commands/consolidate.js';
import { ingestCommand } from './commands/ingest.js';
import { statsCommand } from './commands/stats.js';

const program = new Command();

program
  .name('agentmem')
  .description('Hierarchical Long-Term Memory, Entity Knowledge Graph & Consolidation Engine for AI Agents')
  .version('1.0.0');

program
  .command('studio')
  .description('Launch the embedded React 19 knowledge graph web studio')
  .option('-p, --port <port>', 'Port to listen on', '50094')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .action(studioCommand);

program
  .command('query <text>')
  .description('Execute hybrid search (Vector + BM25 + Graph Traversal) across stored memories')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-k, --top-k <number>', 'Number of top memories to retrieve', '5')
  .option('-t, --max-tokens <tokens>', 'Maximum tokens for system prompt snippet', '500')
  .option('--hops <number>', 'Graph traversal hops', '1')
  .action(queryCommand);

program
  .command('consolidate')
  .description('Trigger memory consolidation, Ebbinghaus decay scoring, and noise pruning')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .action(consolidateCommand);

program
  .command('ingest <filePath>')
  .description('Ingest a JSON conversation trace into memory')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-s, --session <id>', 'Session identifier')
  .action(ingestCommand);

program
  .command('stats')
  .description('Display entity, relation, and episodic memory statistics')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .action(statsCommand);

export function runCli(): void {
  program.parse(process.argv);
}

if (process.argv[1]?.endsWith('agentmem.js') || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runCli();
}
