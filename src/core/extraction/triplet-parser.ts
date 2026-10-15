import { ExtractedTriplet, EntityType } from '../types.js';

export interface TripletRule {
  pattern: RegExp;
  extract: (match: RegExpExecArray, text: string) => ExtractedTriplet | null;
}

export class TripletParser {
  private rules: TripletRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  public parse(text: string): ExtractedTriplet[] {
    const triplets: ExtractedTriplet[] = [];
    const sentences = text
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);

    for (const sentence of sentences) {
      for (const rule of this.rules) {
        const match = rule.pattern.exec(sentence);
        if (match) {
          const triplet = rule.extract(match, sentence);
          if (triplet) {
            // Avoid duplicate subject-predicate-object in same parse run
            const exists = triplets.some(
              (t) =>
                t.subject.toLowerCase() === triplet.subject.toLowerCase() &&
                t.predicate === triplet.predicate &&
                t.object.toLowerCase() === triplet.object.toLowerCase()
            );
            if (!exists) {
              triplets.push(triplet);
            }
          }
        }
      }
    }

    return triplets;
  }

  private registerDefaultRules(): void {
    // 1. Preferences: "I prefer PostgreSQL", "User prefers TypeScript over Python"
    this.rules.push({
      pattern: /(?:i|user|we)\s+(?:strongly\s+)?(?:prefer|favors?|like|love)\s+([^.,;]+)/i,
      extract: (m) => {
        const target = this.cleanEntity(m[1]);
        if (!target) return null;
        return {
          subject: 'User',
          subjectType: 'PERSON',
          predicate: 'PREFERS',
          object: target,
          objectType: this.inferType(target, 'PREFERENCE'),
          confidence: 0.95,
          importance: 0.85,
        };
      },
    });

    // 2. Switched from X to Y: "We switched from Python to TypeScript", "Moved from AWS to GCP"
    this.rules.push({
      pattern: /(?:switched|migrated|moved|transitioned)\s+from\s+([^.,;]+?)\s+to\s+([^.,;]+)/i,
      extract: (m) => {
        const oldTarget = this.cleanEntity(m[1]);
        const newTarget = this.cleanEntity(m[2]);
        if (!newTarget) return null;
        return {
          subject: 'User',
          subjectType: 'PERSON',
          predicate: 'SUPERSEDES',
          object: `${newTarget} (supersedes ${oldTarget})`,
          objectType: this.inferType(newTarget, 'TECHNOLOGY'),
          confidence: 0.98,
          importance: 0.9,
          temporal: { isCurrent: true },
        };
      },
    });

    // 3. Negative Constraints: "Never use ORMs", "Do not use jQuery", "Strictly avoid any mockups"
    this.rules.push({
      pattern: /(?:never\s+use|do\s+not\s+use|avoid|strictly\s+prohibit|no)\s+([^.,;]+)/i,
      extract: (m) => {
        const target = this.cleanEntity(m[1]);
        if (!target) return null;
        return {
          subject: 'Project',
          subjectType: 'PROJECT',
          predicate: 'RESTRICTS',
          object: target,
          objectType: 'CONSTRAINT',
          confidence: 0.95,
          importance: 0.95,
        };
      },
    });

    // 4. Mandatory Constraints: "Always use Tailwind", "Must format database migrations as pure SQL"
    this.rules.push({
      pattern: /(?:always\s+use|always\s+format|must\s+use|must\s+be|require[s]?)\s+([^.,;]+)/i,
      extract: (m) => {
        const target = this.cleanEntity(m[1]);
        if (!target) return null;
        return {
          subject: 'Project',
          subjectType: 'PROJECT',
          predicate: 'REQUIRES',
          object: target,
          objectType: 'CONSTRAINT',
          confidence: 0.95,
          importance: 0.9,
        };
      },
    });

    // 5. Tech Stack & Deployments: "Our production database is PostgreSQL on AWS Aurora"
    this.rules.push({
      pattern: /(?:database|backend|frontend|system|service)\s+is\s+([^.,;]+?)\s+(?:on|in|at|hosted\s+on)\s+([^.,;]+)/i,
      extract: (m) => {
        const tech = this.cleanEntity(m[1]);
        const host = this.cleanEntity(m[2]);
        if (!tech) return null;
        return {
          subject: tech,
          subjectType: 'TECHNOLOGY',
          predicate: 'DEPLOYED_ON',
          object: host,
          objectType: 'TECHNOLOGY',
          confidence: 0.9,
          importance: 0.85,
        };
      },
    });

    // 6. Direct Usage: "We use SQLite", "The project uses React 19"
    this.rules.push({
      pattern: /(?:the\s+)?([a-z0-9_-]+)?\s*(?:uses|is\s+built\s+with|runs\s+on)\s+([^.,;]+)/i,
      extract: (m) => {
        const subj = m[1] ? this.cleanEntity(m[1]) : 'Project';
        const target = this.cleanEntity(m[2]);
        if (!target) return null;
        return {
          subject: subj.length > 2 ? subj : 'Project',
          subjectType: 'PROJECT',
          predicate: 'USES',
          object: target,
          objectType: this.inferType(target, 'TECHNOLOGY'),
          confidence: 0.9,
          importance: 0.8,
        };
      },
    });

    // 7. Dependencies: "AgentMem depends on SQLite", "Service A connects to Redis"
    this.rules.push({
      pattern: /([A-Za-z0-9_.-]+)\s+(?:depends\s+on|connects\s+to|integrates\s+with)\s+([^.,;]+)/i,
      extract: (m) => {
        const subj = this.cleanEntity(m[1]);
        const target = this.cleanEntity(m[2]);
        if (!subj || !target) return null;
        return {
          subject: subj,
          subjectType: 'PROJECT',
          predicate: 'DEPENDS_ON',
          object: target,
          objectType: this.inferType(target, 'TECHNOLOGY'),
          confidence: 0.88,
          importance: 0.75,
        };
      },
    });
  }

  private cleanEntity(str: string): string {
    return str
      .replace(/^(the|a|an|our|their|some)\s+/i, '')
      .replace(/[.!?,;]+$/, '')
      .trim();
  }

  private inferType(name: string, fallback: EntityType): EntityType {
    const lower = name.toLowerCase();
    const techWords = [
      'sqlite', 'postgres', 'postgresql', 'mysql', 'redis', 'react', 'vue',
      'angular', 'node', 'nodejs', 'typescript', 'javascript', 'python',
      'docker', 'aws', 'aurora', 'bedrock', 'tailwind', 'vite', 'graphql',
      'next.js', 'nextjs', 'express', 'vitest', 'jest', 'go', 'golang', 'rust'
    ];

    if (techWords.some((t) => lower.includes(t))) {
      return 'TECHNOLOGY';
    }

    if (lower.includes('user') || lower.includes('developer') || lower.includes('client')) {
      return 'PERSON';
    }

    if (lower.includes('rule') || lower.includes('strict') || lower.includes('constraint')) {
      return 'CONSTRAINT';
    }

    return fallback;
  }
}
