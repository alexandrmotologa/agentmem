import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentMemory } from '../src/core/agent-memory.js';
import { AgentMemChatMessageHistory } from '../src/adapters/langchain.js';
import { createAgentMemMiddleware } from '../src/adapters/vercel-ai.js';

describe('Official Framework Adapters', () => {
  let memory: AgentMemory;

  beforeEach(async () => {
    memory = new AgentMemory({ dbPath: ':memory:' });
    await memory.initialize();
  });

  afterEach(() => {
    memory.close();
  });

  describe('LangChain Adapter (AgentMemChatMessageHistory)', () => {
    it('stores messages and extracts facts into semantic graph', async () => {
      const history = new AgentMemChatMessageHistory({
        memory,
        sessionId: 'chat_session_42',
        namespace: 'langchain_ns',
      });

      await history.addUserMessage('My project is called NovaEngine and uses Rust.');
      await history.addAIMessage('Understood! NovaEngine with Rust configured.');

      const messages = await history.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');

      const injectedPrompt = await history.getInjectedMemoryPrompt('What language does NovaEngine use?');
      expect(injectedPrompt).toBeDefined();

      const graph = memory.getGraphData('langchain_ns');
      const names = graph.nodes.map((n) => n.name);
      expect(names).toContain('NovaEngine');
      expect(names).toContain('Rust');

      await history.clear();
      const clearedMessages = await history.getMessages();
      expect(clearedMessages.length).toBe(0);
    });
  });

  describe('Vercel AI SDK Adapter (createAgentMemMiddleware)', () => {
    it('enriches prompt with memory context and records turns', async () => {
      // Pre-seed memory
      await memory.ingestTurn(
        'seed_session',
        { role: 'user', content: 'The user prefers Next.js App Router and TailwindCSS.' },
        'vercel_ns'
      );

      const middleware = createAgentMemMiddleware({
        memory,
        sessionId: 'vercel_session_1',
        namespace: 'vercel_ns',
      });

      const enriched = await middleware.enrichPrompt({
        system: 'You are an autonomous AI coding assistant.',
        messages: [{ role: 'user', content: 'What UI stack should I use for this project?' }],
      });

      expect(enriched.system).toContain('You are an autonomous AI coding assistant.');
      expect(enriched.system).toContain('Next.js');
      expect(enriched.system).toContain('Tailwind');

      // Record assistant finish
      await middleware.onFinish({
        userMessage: 'What UI stack should I use for this project?',
        assistantResponse: 'Use Next.js with TailwindCSS as preferred.',
      });

      const turns = memory.workingMemory.getSessionTurns('vercel_session_1', 'vercel_ns');
      expect(turns.length).toBe(2);
    });
  });
});
