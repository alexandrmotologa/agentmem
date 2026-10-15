import fs from 'node:fs';
import path from 'node:path';
import { AgentMemory } from '../../core/agent-memory.js';
import { ExportFormat } from '../../core/types.js';
import pc from 'picocolors';

export interface ExportCommandOptions {
  db: string;
  format?: string;
  output?: string;
  namespace?: string;
}

export async function exportCommand(options: ExportCommandOptions): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const format = (options.format?.toLowerCase() || 'json') as ExportFormat;
  const namespace = options.namespace || 'default';

  if (!['json', 'graphml', 'cypher'].includes(format)) {
    console.error(pc.red(`Invalid format '${format}'. Supported: json, graphml, cypher`));
    process.exit(1);
  }

  const agentMem = new AgentMemory({
    dbPath,
    defaultNamespace: namespace,
  });
  await agentMem.initialize();

  try {
    const exportedData = agentMem.exportGraph(format, namespace);

    if (options.output) {
      const outPath = path.resolve(options.output);
      fs.writeFileSync(outPath, exportedData, 'utf-8');
      console.log(pc.green(`✔ Knowledge graph exported to ${pc.bold(outPath)} [format: ${format}, namespace: ${namespace}]`));
    } else {
      process.stdout.write(exportedData);
    }
  } catch (err: any) {
    console.error(pc.red(`✖ Export failed: ${err.message}`));
    process.exit(1);
  } finally {
    agentMem.close();
  }
}
