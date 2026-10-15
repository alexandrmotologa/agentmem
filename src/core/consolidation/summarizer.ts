import { ConversationTurn } from '../types.js';

export interface SummarizeResult {
  summary: string;
  keyPoints: string[];
  importance: number;
}

export type CustomSummarizer = (turns: ConversationTurn[]) => Promise<SummarizeResult> | SummarizeResult;

export class EpisodicSummarizer {
  private customSummarizer?: CustomSummarizer;

  constructor(customSummarizer?: CustomSummarizer) {
    this.customSummarizer = customSummarizer;
  }

  public async summarize(turns: ConversationTurn[]): Promise<SummarizeResult> {
    if (this.customSummarizer) {
      return await this.customSummarizer(turns);
    }
    return this.ruleBasedSummary(turns);
  }

  private ruleBasedSummary(turns: ConversationTurn[]): SummarizeResult {
    if (turns.length === 0) {
      return { summary: 'Empty conversation session.', keyPoints: [], importance: 0.1 };
    }

    const keyPoints: string[] = [];
    const userStatements: string[] = [];
    const decisions: string[] = [];

    for (const turn of turns) {
      const content = turn.content.trim();
      const lower = content.toLowerCase();

      if (turn.role === 'user') {
        userStatements.push(content);

        // Check for directives or choices
        if (
          lower.includes('prefer') ||
          lower.includes('always') ||
          lower.includes('never') ||
          lower.includes('must') ||
          lower.includes('use') ||
          lower.includes('database') ||
          lower.includes('stack')
        ) {
          decisions.push(content);
        }
      }
    }

    // Build concise narrative
    const primaryGoal = userStatements.length > 0 ? userStatements[0] : 'General dialogue';
    keyPoints.push(`Initial user prompt: "${primaryGoal.slice(0, 120)}"`);

    for (const dec of decisions.slice(0, 4)) {
      if (dec !== primaryGoal) {
        keyPoints.push(`Constraint/Decision: "${dec.slice(0, 120)}"`);
      }
    }

    const summaryParts: string[] = [];
    summaryParts.push(`Session discussed: ${primaryGoal.slice(0, 100)}.`);

    if (decisions.length > 0) {
      summaryParts.push(`Key decisions established: ${decisions.slice(0, 2).map((d) => d.slice(0, 60)).join('; ')}.`);
    } else {
      summaryParts.push(`Turn count: ${turns.length} turns processed.`);
    }

    const importance = Math.min(
      1.0,
      Math.max(0.4, 0.4 + (decisions.length * 0.15) + (turns.length > 4 ? 0.1 : 0))
    );

    return {
      summary: summaryParts.join(' '),
      keyPoints,
      importance: Math.round(importance * 100) / 100,
    };
  }
}
