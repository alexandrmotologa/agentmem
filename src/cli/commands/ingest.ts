import { AgentMemory } from '../../core/agent-memory.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';

export async function ingestCommand(filePath: string, options: { db?: string; session?: string }): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const fullPath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(pc.red(`Error: File not found at ${fullPath}`));
    process.exit(1);
  }

  const rawData = fs.readFileSync(fullPath, 'utf8');
  let parsed: any;
  try {
    parsed = JSON.parse(rawData);
  } catch (err: any) {
    console.error(pc.red(`Error parsing JSON: ${err.message}`));
    process.exit(1);
  }

  const memory = new AgentMemory({ dbPath });
  await memory.initialize();

  const sessionId = options.session || parsed.sessionId || `session_${Date.now()}`;
  const turns = Array.isArray(parsed) ? parsed : (parsed.turns || []);

  console.log(pc.cyan(`\n📥 Ingesting ${turns.length} conversation turns into session ${pc.bold(sessionId)}...`));

  const episode = await memory.ingestEpisode({
    sessionId,
    turns,
    outcome: parsed.outcome,
    summary: parsed.summary,
  });

  console.log(pc.green('✓ Session ingested into episodic memory!'));
  console.log(pc.gray(`Summary: ${episode.summary}`));

  const graphData = memory.getGraphData();
  console.log(pc.gray(`Current Graph: ${graphData.nodes.length} entities, ${graphData.edges.length} relations.\n`));

  memory.close();
}
