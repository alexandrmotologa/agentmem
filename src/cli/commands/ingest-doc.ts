import { AgentMemory } from '../../core/agent-memory.js';
import pc from 'picocolors';

export interface IngestDocCommandOptions {
  db: string;
  namespace?: string;
  project?: string;
}

export async function ingestDocCommand(
  filePath: string,
  options: IngestDocCommandOptions
): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const namespace = options.namespace || 'default';

  console.log(pc.cyan(`\n[agentmem] Ingesting document: ${pc.bold(filePath)}`));
  console.log(pc.gray(`Database: ${dbPath} | Namespace: ${namespace}\n`));

  const agentMem = new AgentMemory({
    dbPath,
    defaultNamespace: namespace,
  });
  await agentMem.initialize();

  try {
    const result = await agentMem.ingestDocument(filePath, {
      namespace,
      projectName: options.project,
    });

    console.log(pc.green(`✔ Successfully processed document in ${result.durationMs}ms:`));
    console.log(`  • Sections scanned:   ${pc.bold(result.sectionsProcessed.toString())}`);
    console.log(`  • Entities created:   ${pc.bold(result.entitiesCreated.toString())}`);
    console.log(`  • Relations created:  ${pc.bold(result.relationsCreated.toString())}`);
    console.log(`  • Triplets extracted: ${pc.bold(result.tripletsExtracted.toString())}\n`);
  } catch (err: any) {
    console.error(pc.red(`✖ Failed to ingest document: ${err.message}`));
    process.exit(1);
  } finally {
    agentMem.close();
  }
}
