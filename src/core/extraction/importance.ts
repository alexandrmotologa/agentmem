import { EntityType } from '../types.js';

export class ImportanceScorer {
  private highAffirmationKeywords = [
    'always', 'never', 'must', 'strictly', 'crucial', 'critical',
    'mandatory', 'required', 'prohibit', 'forbidden', 'rule', 'standard'
  ];

  private moderateKeywords = [
    'prefer', 'important', 'primary', 'default', 'essential', 'need', 'ensure'
  ];

  private ephemeralKeywords = [
    'maybe', 'perhaps', 'just testing', 'temporarily', 'for now',
    'tentative', 'later', 'might', 'could consider', 'hello', 'thanks', 'cool'
  ];

  public scoreEntity(name: string, entityType: EntityType, contextText?: string): number {
    let base = 0.5;

    // Type prior
    switch (entityType) {
      case 'CONSTRAINT':
        base = 0.9;
        break;
      case 'PREFERENCE':
        base = 0.8;
        break;
      case 'TECHNOLOGY':
        base = 0.75;
        break;
      case 'PROJECT':
        base = 0.7;
        break;
      case 'PERSON':
        base = 0.65;
        break;
      case 'CONCEPT':
      default:
        base = 0.5;
        break;
    }

    if (!contextText) return base;

    const lower = contextText.toLowerCase();

    for (const kw of this.highAffirmationKeywords) {
      if (lower.includes(kw)) {
        base = Math.min(1.0, base + 0.2);
        break;
      }
    }

    for (const kw of this.moderateKeywords) {
      if (lower.includes(kw)) {
        base = Math.min(1.0, base + 0.1);
        break;
      }
    }

    for (const kw of this.ephemeralKeywords) {
      if (lower.includes(kw)) {
        base = Math.max(0.1, base - 0.25);
        break;
      }
    }

    return Math.round(base * 100) / 100;
  }

  public scoreEpisode(summary: string, turnCount: number): number {
    let score = 0.5;
    const lower = summary.toLowerCase();

    if (this.highAffirmationKeywords.some((k) => lower.includes(k))) {
      score += 0.25;
    }
    if (turnCount > 5) {
      score += 0.1;
    }

    return Math.min(1.0, Math.max(0.1, Math.round(score * 100) / 100));
  }
}
