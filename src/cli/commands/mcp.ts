import { AgentMemory } from '../../core/agent-memory.js';
import { AgentMemMcpServer } from '../../mcp/server.js';
import pc from 'picocolors';

export interface McpCommandOptions {
  db: string;
  namespace?: string;
}

export async function mcpCommand(options: McpCommandOptions): Promise<void> {
  const dbPath = options.db || './agentmem.db';
  const namespace = options.namespace || 'default';

  // Informative messages MUST go to stderr when running MCP over stdio
  console.error(pc.cyan(`[agentmem-mcp] Initializing AgentMem MCP Server...`));
  console.error(pc.gray(`[agentmem-mcp] Database: ${dbPath}`));
  console.error(pc.gray(`[agentmem-mcp] Default Namespace: ${namespace}`));

  const agentMem = new AgentMemory({
    dbPath,
    defaultNamespace: namespace,
  });
  await agentMem.initialize();

  const mcpServer = new AgentMemMcpServer(agentMem, {
    name: 'agentmem',
    version: '1.0.0',
    defaultNamespace: namespace,
  });

  console.error(pc.green(`[agentmem-mcp] AgentMem MCP Server running on stdio.`));
  await mcpServer.startStdio();
}
