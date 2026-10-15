import { AgentMemory } from '../../core/agent-memory.js';
import pc from 'picocolors';

export async function queryCommand(
  text: string,
  options: { db?: string; topK?: string; maxTokens?: string; hops?: string; namespace?: string }
): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const topK = options.topK ? parseInt(options.topK, 10) : 5;
  const maxTokens = options.maxTokens ? parseInt(options.maxTokens, 10) : 500;
  const graphHops = options.hops ? parseInt(options.hops, 10) : 1;
  const namespace = options.namespace || 'default';

  console.log(pc.cyan(`\n🔍 AgentMem Query: "${pc.bold(text)}"`));
  console.log(pc.gray(`Database: ${dbPath} | Namespace: ${namespace} | Top-K: ${topK} | Hops: ${graphHops}\n`));

  const memory = new AgentMemory({ dbPath, defaultNamespace: namespace });
  await memory.initialize();

  const recallResult = await memory.recall({
    query: text,
    topK,
    maxTokens,
    graphHops,
    includeEpisodes: true,
    namespace,
  });

  if (recallResult.details.length === 0) {
    console.log(pc.yellow('No matching memories found for this query.\n'));
    memory.close();
    return;
  }

  console.log(pc.green(`Found ${recallResult.details.length} relevant memories (estimated tokens: ${recallResult.tokenCount}):\n`));

  for (const item of recallResult.details) {
    const typeColor =
      item.entity.entityType === 'CONSTRAINT'
        ? pc.red
        : item.entity.entityType === 'TECH'
        ? pc.cyan
        : item.entity.entityType === 'PREFERENCE'
        ? pc.magenta
        : pc.yellow;

    console.log(
      `${typeColor(`[${item.entity.entityType}]`)} ${pc.bold(item.entity.name)} ` +
      pc.gray(`(Score: ${item.totalRelevanceScore} | Vec: ${item.scores.vectorScore.toFixed(2)} | FTS5: ${item.scores.bm25Score.toFixed(2)} | Ret: ${item.entity.decayRetention})`)
    );

    if (item.connectedRelations.length > 0) {
      for (const rel of item.connectedRelations) {
        console.log(`   └─ ${pc.blue(rel.relation)} ➔ ${rel.targetName} (${rel.targetType})`);
      }
    }
  }

  console.log(pc.white('\n--- Formatted Prompt Injection Snippet ---'));
  console.log(pc.gray(recallResult.systemPromptSnippet));
  console.log(pc.white('-------------------------------------------\n'));

  memory.close();
}
