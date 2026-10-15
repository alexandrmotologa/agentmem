import { AgentMemory } from '../core/agent-memory.js';
import { ConversationTurn } from '../core/types.js';

export interface BaseChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class AgentMemChatMessageHistory {
  private memory: AgentMemory;
  private sessionId: string;
  private namespace: string;
  private agentId?: string;

  constructor(options: {
    memory: AgentMemory;
    sessionId: string;
    namespace?: string;
    agentId?: string;
  }) {
    this.memory = options.memory;
    this.sessionId = options.sessionId;
    this.namespace = options.namespace || 'default';
    this.agentId = options.agentId;
  }

  public async getMessages(): Promise<BaseChatMessage[]> {
    const turns = this.memory.workingMemory.getSessionTurns(this.sessionId, this.namespace);
    return turns.map((t) => ({
      role: t.role as 'user' | 'assistant' | 'system',
      content: t.content,
    }));
  }

  public async addMessage(message: BaseChatMessage): Promise<void> {
    const turn: ConversationTurn = {
      role: message.role,
      content: message.content,
      agentId: this.agentId,
    };
    await this.memory.ingestTurn(this.sessionId, turn, this.namespace);
  }

  public async addUserMessage(text: string): Promise<void> {
    await this.addMessage({ role: 'user', content: text });
  }

  public async addAIMessage(text: string): Promise<void> {
    await this.addMessage({ role: 'assistant', content: text });
  }

  public async clear(): Promise<void> {
    this.memory.workingMemory.clearSession(this.sessionId, this.namespace);
  }

  /**
   * Generates a context injection snippet suitable for LangChain SystemMessage prompt
   */
  public async getInjectedMemoryPrompt(query: string, maxTokens: number = 600): Promise<string> {
    const result = await this.memory.recall({
      query,
      namespace: this.namespace,
      maxTokens,
    });
    return result.injectedPrompt || result.systemPromptSnippet || '';
  }
}
