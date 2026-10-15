import fs from 'node:fs';
import path from 'node:path';
import { AgentMemory } from '../../core/agent-memory.js';
import pc from 'picocolors';

export interface ImportCommandOptions {
  db: string;
  format?: string;
  namespace?: string;
}

export async function importCommand(
  filePath: string,
  options: ImportCommandOptions
): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const format = (options.format?.toLowerCase() || (filePath.endsWith('.cypher') ? 'cypher' : 'json')) as 'json' | 'cypher';
  const namespace = options.namespace || 'default';

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(pc.red(`File not found: ${resolvedPath}`));
    process.exit(1);
  }

  const rawContent = fs.readFileSync(resolvedPath, 'utf-8');

  console.log(pc.cyan(`\n[agentmem] Importing knowledge graph from: ${pc.bold(resolvedPath)}`));
  console.log(pc.gray(`Database: ${dbPath} | Namespace: ${namespace} | Format: ${format}\n`));

  const agentMem = new AgentMemory({
    dbPath,
    defaultNamespace: namespace,
  });
  await agentMem.initialize();

  try {
    const result = await agentMem.importGraph(rawContent, format, namespace);
    console.log(pc.green(`✔ Graph imported successfully:`));
    console.log(`  • Entities imported:  ${pc.bold(result.entitiesImported.toString())}`);
    console.log(`  • Relations imported: ${pc.bold(result.relationsImported.toString())}\n`);
  } catch (err: any) {
    console.error(pc.red(`✖ Import failed: ${err.message}`));
    process.exit(1);
  } finally {
    agentMem.close();
  }
}
