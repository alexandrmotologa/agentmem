import { Command } from 'commander';
import { studioCommand } from './commands/studio.js';
import { queryCommand } from './commands/query.js';
import { consolidateCommand } from './commands/consolidate.js';
import { ingestCommand } from './commands/ingest.js';
import { ingestDocCommand } from './commands/ingest-doc.js';
import { statsCommand } from './commands/stats.js';
import { mcpCommand } from './commands/mcp.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';

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
  .option('-n, --namespace <ns>', 'Default workspace namespace', 'default')
  .action(studioCommand);

program
  .command('query <text>')
  .description('Execute hybrid search (Vector + BM25 + Graph Traversal) across stored memories')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-k, --top-k <number>', 'Number of top memories to retrieve', '5')
  .option('-t, --max-tokens <tokens>', 'Maximum tokens for system prompt snippet', '500')
  .option('--hops <number>', 'Graph traversal hops', '1')
  .option('-n, --namespace <ns>', 'Memory namespace filter', 'default')
  .action(queryCommand);

program
  .command('consolidate')
  .description('Trigger memory consolidation, Ebbinghaus decay scoring, and noise pruning')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-n, --namespace <ns>', 'Workspace namespace to consolidate', 'default')
  .action(consolidateCommand);

program
  .command('ingest <filePath>')
  .description('Ingest a JSON conversation trace into memory')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-s, --session <id>', 'Session identifier')
  .option('-n, --namespace <ns>', 'Target workspace namespace', 'default')
  .action(ingestCommand);

program
  .command('ingest-doc <filePath>')
  .description('Ingest a Markdown document, specification, or README file into knowledge graph')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-n, --namespace <ns>', 'Target workspace namespace', 'default')
  .option('-p, --project <name>', 'Project name override')
  .action(ingestDocCommand);

program
  .command('mcp')
  .description('Launch Model Context Protocol (MCP) server over stdio for Cursor, Claude Desktop, Antigravity')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-n, --namespace <ns>', 'Default workspace namespace', 'default')
  .action(mcpCommand);

program
  .command('export')
  .description('Export knowledge graph to JSON, GraphML, or Cypher statements')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-f, --format <format>', 'Export format: json, graphml, cypher', 'json')
  .option('-o, --output <path>', 'Output file path (default stdout)')
  .option('-n, --namespace <ns>', 'Workspace namespace to export', 'default')
  .action(exportCommand);

program
  .command('import <filePath>')
  .description('Import knowledge graph from a JSON or Cypher file')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-f, --format <format>', 'Import format: json, cypher')
  .option('-n, --namespace <ns>', 'Target workspace namespace', 'default')
  .action(importCommand);

program
  .command('stats')
  .description('Display entity, relation, and episodic memory statistics')
  .option('-d, --db <path>', 'Path to SQLite database file', './agentmem.db')
  .option('-n, --namespace <ns>', 'Filter by workspace namespace', 'default')
  .action(statsCommand);

export function runCli(): void {
  program.parse(process.argv);
}

if (process.argv[1]?.endsWith('agentmem.js') || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runCli();
}
