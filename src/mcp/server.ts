import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AgentMemory } from '../core/agent-memory.js';
import { EntityType } from '../core/types.js';

export interface McpServerOptions {
  name?: string;
  version?: string;
  defaultNamespace?: string;
}

export class AgentMemMcpServer {
  private agentMem: AgentMemory;
  private server: McpServer;
  private defaultNamespace: string;

  constructor(agentMem: AgentMemory, options?: McpServerOptions) {
    this.agentMem = agentMem;
    this.defaultNamespace = options?.defaultNamespace || agentMem.defaultNamespace || 'default';
    this.server = new McpServer({
      name: options?.name || 'agentmem',
      version: options?.version || '1.0.0',
    });

    this.registerTools();
  }

  public getMcpServer(): McpServer {
    return this.server;
  }

  private registerTools(): void {
    // 1. recall_memory
    this.server.tool(
      'recall_memory',
      'Recall relevant long-term memories, facts, entity relations, and past episodes for an agent prompt or query.',
      {
        query: z.string().describe('The user message, agent question, or search query to find memories for'),
        namespace: z.string().optional().describe("Memory workspace namespace (default: 'default')"),
        maxTokens: z.number().optional().describe('Maximum token budget for returned injected memory context (default: 600)'),
        topK: z.number().optional().describe('Number of top matching semantic entities to retrieve (default: 5)'),
        includeEpisodes: z.boolean().optional().describe('Whether to include relevant past episodic dialogues (default: true)'),
      },
      async ({ query, namespace, maxTokens, topK, includeEpisodes }) => {
        const ns = namespace || this.defaultNamespace;
        const result = await this.agentMem.recall({
          query,
          namespace: ns,
          maxTokens: maxTokens ?? 600,
          topK: topK ?? 5,
          includeEpisodes: includeEpisodes ?? true,
        });

        const outputText = result.injectedPrompt || 'No relevant long-term memories found.';
        return {
          content: [
            {
              type: 'text',
              text: outputText,
            },
          ],
        };
      }
    );

    // 2. store_fact
    this.server.tool(
      'store_fact',
      'Explicitly store a knowledge triplet (subject - predicate - object) into long-term semantic memory.',
      {
        subject: z.string().describe("The subject entity name, e.g. 'User', 'Backend', 'Authentication'"),
        predicate: z.string().describe("The relationship predicate, e.g. 'PREFERS', 'USES', 'DEPLOYED_ON', 'REQUIRES'"),
        object: z.string().describe("The target entity name, e.g. 'PostgreSQL', 'TypeScript', 'JWT'"),
        subjectType: z
          .enum(['PERSON', 'PROJECT', 'TECHNOLOGY', 'PREFERENCE', 'CONSTRAINT', 'CONCEPT'])
          .optional()
          .describe('Type category of subject entity'),
        objectType: z
          .enum(['PERSON', 'PROJECT', 'TECHNOLOGY', 'PREFERENCE', 'CONSTRAINT', 'CONCEPT'])
          .optional()
          .describe('Type category of target entity'),
        confidence: z.number().min(0).max(1).optional().describe('Confidence score between 0.0 and 1.0 (default 1.0)'),
        validDays: z.number().optional().describe('Optional duration in days before this fact expires'),
        namespace: z.string().optional().describe("Memory workspace namespace (default: 'default')"),
      },
      async ({ subject, predicate, object, subjectType, objectType, confidence, validDays, namespace }) => {
        const ns = namespace || this.defaultNamespace;
        const sType = (subjectType as EntityType) || 'CONCEPT';
        const oType = (objectType as EntityType) || 'CONCEPT';
        const conf = confidence !== undefined ? confidence : 1.0;
        const validUntil = validDays ? Date.now() + validDays * 24 * 60 * 60 * 1000 : undefined;

        const subjEntity = this.agentMem.graphRepo.upsertEntity({
          name: subject.trim(),
          entityType: sType,
          importanceScore: 0.8,
          namespace: ns,
        });

        const objEntity = this.agentMem.graphRepo.upsertEntity({
          name: object.trim(),
          entityType: oType,
          importanceScore: 0.8,
          namespace: ns,
        });

        const rel = this.agentMem.graphRepo.upsertRelation({
          sourceEntityId: subjEntity.id,
          targetEntityId: objEntity.id,
          relationType: predicate.trim().toUpperCase(),
          confidence: conf,
          validUntil,
          namespace: ns,
        });

        this.agentMem.contradictionResolver.resolveContradiction(
          subjEntity.id,
          objEntity.id,
          predicate.trim().toUpperCase(),
          rel.id,
          ns
        );

        await this.agentMem.vectorStore.storeEmbedding('ENTITY', subjEntity.id, `${subjEntity.name} ${subjEntity.entityType}`, ns);
        await this.agentMem.vectorStore.storeEmbedding('ENTITY', objEntity.id, `${objEntity.name} ${objEntity.entityType}`, ns);

        return {
          content: [
            {
              type: 'text',
              text: `Stored fact successfully: [${subjEntity.name}] --(${rel.relationType})--> [${objEntity.name}] in namespace '${ns}'.`,
            },
          ],
        };
      }
    );

    // 3. ingest_dialogue
    this.server.tool(
      'ingest_dialogue',
      'Ingest a conversation turn or message to update working memory and automatically extract semantic facts and entities.',
      {
        sessionId: z.string().describe('Unique session identifier for the conversation'),
        role: z.enum(['user', 'assistant', 'system']).describe('Speaker role'),
        content: z.string().describe('Dialogue content of the turn'),
        namespace: z.string().optional().describe("Memory workspace namespace (default: 'default')"),
        agentId: z.string().optional().describe('ID of the agent generating or observing the turn'),
      },
      async ({ sessionId, role, content, namespace, agentId }) => {
        const ns = namespace || this.defaultNamespace;
        await this.agentMem.ingestTurn(sessionId, { role, content, agentId }, ns);

        return {
          content: [
            {
              type: 'text',
              text: `Ingested turn into session '${sessionId}' [namespace: '${ns}']. Semantic facts and entities extracted.`,
            },
          ],
        };
      }
    );

    // 4. get_memory_stats
    this.server.tool(
      'get_memory_stats',
      'Get quantitative statistics of current agent memory (entity count, active relations, episodes).',
      {
        namespace: z.string().optional().describe("Filter statistics by workspace namespace (default: 'default')"),
      },
      async ({ namespace }) => {
        const ns = namespace || this.defaultNamespace;
        const entities = this.agentMem.graphRepo.listEntities({ limit: 10000, includeArchived: false, namespace: ns });
        const relations = this.agentMem.graphRepo.listRelations({ activeOnly: true, namespace: ns });
        const episodes = this.agentMem.episodicRepo.listEpisodes({ limit: 10000, namespace: ns });

        const stats = {
          namespace: ns,
          activeEntities: entities.length,
          activeRelations: relations.length,
          totalEpisodes: episodes.length,
          databasePath: this.agentMem.db.dbPath,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }
    );

    // 5. consolidate_memory
    this.server.tool(
      'consolidate_memory',
      'Trigger a memory consolidation and Ebbinghaus forgetting cycle to prune stale memories and deduplicate entity aliases.',
      {
        namespace: z.string().optional().describe("Workspace namespace to consolidate (default: 'default')"),
      },
      async ({ namespace }) => {
        const ns = namespace || this.defaultNamespace;
        const stats = await this.agentMem.consolidate(ns);
        return {
          content: [
            {
              type: 'text',
              text: `Consolidation completed in ${stats.durationMs}ms for namespace '${ns}': ${stats.entitiesScored} entities scored, ${stats.prunedEntities} pruned, ${stats.deduplicatedCount} deduplicated.`,
            },
          ],
        };
      }
    );
  }

  public async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
