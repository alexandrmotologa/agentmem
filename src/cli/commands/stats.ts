import { AgentMemory } from '../../core/agent-memory.js';
import pc from 'picocolors';

export async function statsCommand(options: { db?: string; namespace?: string }): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const namespace = options.namespace || 'default';
  const memory = new AgentMemory({ dbPath, defaultNamespace: namespace });
  await memory.initialize();

  const entities = memory.graphRepo.listEntities({ limit: 10000, includeArchived: true, namespace });
  const activeEntities = entities.filter((e) => !e.isArchived);
  const archivedEntities = entities.filter((e) => e.isArchived);

  const relations = memory.graphRepo.listRelations({ activeOnly: false, namespace });
  const activeRelations = relations.filter((r) => !r.supersededBy && (!r.validUntil || r.validUntil > Date.now()));
  const supersededRelations = relations.filter((r) => Boolean(r.supersededBy || (r.validUntil && r.validUntil <= Date.now())));

  const episodes = memory.episodicRepo.listEpisodes({ limit: 10000, namespace });

  console.log(pc.cyan(`\n📊 AgentMem Knowledge Store Statistics`));
  console.log(pc.gray(`Database: ${dbPath} | Namespace: ${namespace}\n`));

  console.log(pc.white(`  Active Entities:       ${pc.bold(pc.green(String(activeEntities.length)))}`));
  console.log(pc.white(`  Archived Entities:     ${pc.gray(String(archivedEntities.length))}`));
  console.log(pc.white(`  Active Relations:      ${pc.bold(pc.cyan(String(activeRelations.length)))}`));
  console.log(pc.white(`  Superseded Relations:  ${pc.gray(String(supersededRelations.length))}`));
  console.log(pc.white(`  Episodic Milestones:   ${pc.bold(pc.yellow(String(episodes.length)))}`));

  // Breakdown by entity type
  const typeMap: Record<string, number> = {};
  for (const ent of activeEntities) {
    typeMap[ent.entityType] = (typeMap[ent.entityType] || 0) + 1;
  }

  console.log(pc.white('\n  Entity Breakdown:'));
  for (const [type, count] of Object.entries(typeMap)) {
    console.log(`    • ${pc.bold(type.padEnd(14))}: ${count}`);
  }
  console.log('');

  memory.close();
}
