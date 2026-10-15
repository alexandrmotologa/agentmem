import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentMemory } from '../src/core/agent-memory.js';

describe('Hybrid Retrieval & Prompt Synthesis', () => {
  let memory: AgentMemory;

  beforeEach(async () => {
    memory = new AgentMemory({ dbPath: ':memory:' });
    await memory.initialize();

    await memory.ingestEpisode({
      sessionId: 'session_test',
      turns: [
        { role: 'user', content: 'Our database is PostgreSQL 16 on AWS Aurora.' },
        { role: 'user', content: 'Always format migrations as pure SQL without ORMs.' },
        { role: 'user', content: 'The frontend application uses React 19.' },
      ],
    });
  });

  afterEach(() => {
    memory.close();
  });

  it('recalls relevant constraints and technologies based on query', async () => {
    const result = await memory.recall({
      query: 'What migrations rules do we follow?',
      topK: 3,
      maxTokens: 500,
    });

    expect(result.systemPromptSnippet).toContain('<agent_memory>');
    expect(result.systemPromptSnippet).toContain('pure SQL');
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.tokenCount).toBeLessThan(500);
  });

  it('respects token budget constraints in prompt builder', async () => {
    const tightResult = await memory.recall({
      query: 'database and frontend stack',
      topK: 5,
      maxTokens: 50, // Very tight token budget
    });

    expect(tightResult.tokenCount).toBeLessThanOrEqual(55);
  });
});
