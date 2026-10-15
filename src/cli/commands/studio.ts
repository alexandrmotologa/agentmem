import { AgentMemory } from '../../core/agent-memory.js';
import { LocalServer } from '../../server/local-server.js';
import pc from 'picocolors';

export async function studioCommand(options: { db?: string; port?: string; namespace?: string }): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const port = options.port ? parseInt(options.port, 10) : 50094;
  const namespace = options.namespace || 'default';

  console.log(pc.cyan(`\n🌌 Launching AgentMem Visual Studio...`));
  console.log(pc.gray(`Database: ${dbPath} | Default Namespace: ${namespace}`));

  const memory = new AgentMemory({ dbPath, defaultNamespace: namespace });
  await memory.initialize();

  const server = new LocalServer(memory, port);
  await server.start();

  console.log(pc.green(`\n✓ AgentMem Studio running at: ${pc.bold(pc.underline(`http://localhost:${port}`))}`));
  console.log(pc.gray(`Press Ctrl+C to terminate the server.\n`));

  process.on('SIGINT', async () => {
    console.log(pc.yellow('\nShutting down AgentMem Studio...'));
    await server.stop();
    memory.close();
    process.exit(0);
  });
}
