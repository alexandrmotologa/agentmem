import { RecalledMemory, InjectedContextResult } from '../types.js';

export class PromptBuilder {
  public buildPrompt(
    recalled: RecalledMemory[],
    maxTokens: number = 600
  ): InjectedContextResult {
    if (recalled.length === 0) {
      return {
        systemPromptSnippet: '',
        tokenCount: 0,
        recalledEntityIds: [],
        recalledEpisodeIds: [],
        details: [],
      };
    }

    const entityLines: string[] = [];
    const episodeLines: string[] = [];
    const entityIds = new Set<string>();
    const seenEpisodes = new Set<string>();

    for (const mem of recalled) {
      entityIds.add(mem.entity.id);

      // Build entity description line
      let line = `- ${mem.entity.name} (${mem.entity.entityType})`;
      const details: string[] = [];

      // Add properties if present
      const propEntries = Object.entries(mem.entity.properties);
      if (propEntries.length > 0) {
        details.push(propEntries.map(([k, v]) => `${k}: ${v}`).join(', '));
      }

      // Add connected relations
      if (mem.connectedRelations.length > 0) {
        const relationsSummary = mem.connectedRelations
          .slice(0, 3)
          .map((r) => `${r.relation.toLowerCase()} ${r.targetName}`)
          .join(', ');
        details.push(relationsSummary);
      }

      if (details.length > 0) {
        line += `: ${details.join('; ')}`;
      }

      entityLines.push(line);

      // Gather relevant episodes
      for (const ep of mem.relevantEpisodes) {
        if (!seenEpisodes.has(ep.sessionId)) {
          seenEpisodes.add(ep.sessionId);
          episodeLines.push(`- Session ${ep.sessionId}: ${ep.summary}`);
        }
      }
    }

    const composeSnippet = (entities: string[], episodes: string[]): string => {
      const parts: string[] = ['<agent_memory>'];
      if (entities.length > 0) {
        parts.push('[Semantic Knowledge Graph]');
        parts.push(...entities);
      }
      if (episodes.length > 0) {
        parts.push('\n[Relevant Past Episodes]');
        parts.push(...episodes);
      }
      parts.push('</agent_memory>');
      return parts.join('\n');
    };

    let activeEntities = [...entityLines];
    let activeEpisodes = episodeLines.slice(0, 3);
    let snippet = composeSnippet(activeEntities, activeEpisodes);
    let estimatedTokens = Math.ceil(snippet.length / 4);

    while (estimatedTokens > maxTokens && activeEpisodes.length > 0) {
      activeEpisodes.pop();
      snippet = composeSnippet(activeEntities, activeEpisodes);
      estimatedTokens = Math.ceil(snippet.length / 4);
    }

    while (estimatedTokens > maxTokens && activeEntities.length > 1) {
      activeEntities.pop();
      snippet = composeSnippet(activeEntities, activeEpisodes);
      estimatedTokens = Math.ceil(snippet.length / 4);
    }

    return {
      systemPromptSnippet: snippet,
      tokenCount: estimatedTokens,
      recalledEntityIds: Array.from(entityIds),
      recalledEpisodeIds: Array.from(seenEpisodes),
      details: recalled,
    };
  }
}
