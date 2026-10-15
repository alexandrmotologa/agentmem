import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentMemory } from '../src/core/agent-memory.js';

describe('Document and Markdown Ingestion', () => {
  let memory: AgentMemory;

  beforeEach(async () => {
    memory = new AgentMemory({ dbPath: ':memory:' });
    await memory.initialize();
  });

  afterEach(() => {
    memory.close();
  });

  it('extracts project entities, sections, tech dependencies, and triplets from markdown', async () => {
    const markdownContent = `
# CyberMesh Engine

CyberMesh is an autonomous cluster orchestration mesh.

## Architecture & Technology
- The daemon is written in TypeScript.
- The storage engine uses SQLite.
- The control plane runs on port 8080.
- CyberMesh requires Node 22.

## Rules & Constraints
- The user prefers dark mode.
- CyberMesh deploys on Kubernetes.
`;

    const result = await memory.ingestDocumentContent(markdownContent, 'cybermesh-spec.md', {
      projectName: 'CyberMesh',
      namespace: 'production',
    });

    expect(result.sectionsProcessed).toBeGreaterThan(0);
    expect(result.entitiesCreated).toBeGreaterThan(3);
    expect(result.relationsCreated).toBeGreaterThan(2);

    // Verify recall finds extracted technologies
    const recall = await memory.recall({
      query: 'What language and storage does CyberMesh use?',
      namespace: 'production',
    });

    expect(recall.systemPromptSnippet).toBeDefined();
    expect(recall.recalledEntityIds.length).toBeGreaterThan(0);

    const graph = memory.getGraphData('production');
    const entityNames = graph.nodes.map((n) => n.name);

    expect(entityNames).toContain('CyberMesh');
    expect(entityNames).toContain('TypeScript');
    expect(entityNames).toContain('SQLite');
  });
});
