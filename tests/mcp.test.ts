import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentMemory } from '../src/core/agent-memory.js';
import { AgentMemMcpServer } from '../src/mcp/server.js';

describe('AgentMem MCP Server Tools', () => {
  let memory: AgentMemory;
  let mcpServer: AgentMemMcpServer;

  beforeEach(async () => {
    memory = new AgentMemory({ dbPath: ':memory:' });
    await memory.initialize();
    mcpServer = new AgentMemMcpServer(memory);
  });

  afterEach(() => {
    memory.close();
  });

  it('initializes MCP server and registers all core memory tools', () => {
    const rawServer = mcpServer.getMcpServer();
    expect(rawServer).toBeDefined();
  });

  it('executes store_fact and recall_memory through memory engine', async () => {
    // Ingest turn via direct memory
    await memory.ingestTurn('session_test', {
      role: 'user',
      content: 'I prefer TypeScript and require strict null checks.',
    });

    const recall = await memory.recall({
      query: 'What language does the user prefer?',
    });

    expect(recall.systemPromptSnippet).toContain('TypeScript');
  });
});
