import { AgentMemory } from '../../core/agent-memory.js';
import pc from 'picocolors';

export async function consolidateCommand(options: { db?: string; namespace?: string }): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const namespace = options.namespace || 'default';

  console.log(pc.cyan(`\n⚡ AgentMem: Starting memory consolidation cycle on ${pc.bold(dbPath)} (namespace: ${namespace})...`));

  const memory = new AgentMemory({ dbPath, defaultNamespace: namespace });
  await memory.initialize();

  const stats = await memory.consolidate(namespace);

  console.log(pc.green('✓ Consolidation completed successfully!\n'));
  console.log(pc.white(`  Entities Scored:       ${pc.bold(String(stats.entitiesScored))}`));
  console.log(pc.white(`  Ephemeral Pruned:      ${pc.bold(String(stats.prunedEntities))}`));
  console.log(pc.white(`  Relations Cleaned:     ${pc.bold(String(stats.archivedRelations))}`));
  console.log(pc.white(`  Entities Deduplicated: ${pc.bold(String(stats.deduplicatedCount))}`));
  console.log(pc.white(`  Execution Duration:    ${pc.bold(`${stats.durationMs}ms`)}\n`));

  memory.close();
}
