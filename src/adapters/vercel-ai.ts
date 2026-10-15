import { AgentMemory } from '../core/agent-memory.js';

export interface VercelAiMiddlewareOptions {
  memory: AgentMemory;
  sessionId: string;
  namespace?: string;
  agentId?: string;
  maxTokens?: number;
}

export interface AiSdkMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function createAgentMemMiddleware(options: VercelAiMiddlewareOptions) {
  const { memory, sessionId, namespace = 'default', agentId, maxTokens = 600 } = options;

  return {
    /**
     * Intercepts messages before model invocation, performs hybrid memory recall
     * on the latest user query, and injects knowledge into the system prompt.
     */
    async enrichPrompt(params: {
      system?: string;
      messages: AiSdkMessage[];
    }): Promise<{ system: string; messages: AiSdkMessage[] }> {
      const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user');
      let enhancedSystem = params.system || '';

      if (lastUserMsg && lastUserMsg.content) {
        const recallResult = await memory.recall({
          query: lastUserMsg.content,
          namespace,
          agentId,
          maxTokens,
        });

        if (recallResult.injectedPrompt) {
          enhancedSystem = enhancedSystem
            ? `${enhancedSystem}\n\n${recallResult.injectedPrompt}`
            : recallResult.injectedPrompt;
        }
      }

      return {
        system: enhancedSystem,
        messages: params.messages,
      };
    },

    /**
     * Call after response generation to ingest both user query and assistant response
     * into working memory and extract semantic knowledge.
     */
    async onFinish(params: {
      userMessage?: string;
      assistantResponse: string;
    }): Promise<void> {
      if (params.userMessage) {
        await memory.ingestTurn(
          sessionId,
          { role: 'user', content: params.userMessage, agentId },
          namespace
        );
      }

      await memory.ingestTurn(
        sessionId,
        { role: 'assistant', content: params.assistantResponse, agentId },
        namespace
      );
    },

    /**
     * Helper to manually ingest a single turn
     */
    async recordTurn(role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
      await memory.ingestTurn(sessionId, { role, content, agentId }, namespace);
    },
  };
}
