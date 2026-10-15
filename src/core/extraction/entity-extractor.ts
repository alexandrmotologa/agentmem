import { EntityType, EntityNode } from '../types.js';

export interface ExtractedEntityCandidate {
  name: string;
  normalizedName: string;
  entityType: EntityType;
  properties: Record<string, unknown>;
  confidence: number;
}

export class EntityExtractor {
  private canonicalDictionary: Map<string, { name: string; type: EntityType }> = new Map();

  constructor() {
    this.populateCanonicalDictionary();
  }

  public extractEntities(text: string): ExtractedEntityCandidate[] {
    const candidates: ExtractedEntityCandidate[] = [];
    const seen = new Set<string>();

    // 1. Dictionary and regex matching for technologies and platforms
    for (const [pattern, canonical] of this.canonicalDictionary.entries()) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'i');
      if (regex.test(text)) {
        if (!seen.has(canonical.name.toLowerCase())) {
          seen.add(canonical.name.toLowerCase());

          // Extract optional version number: e.g. "PostgreSQL 16", "React 19"
          const versionMatch = new RegExp(`\\b${pattern}\\s+([0-9]+(?:\\.[0-9]+)*)\\b`, 'i').exec(text);
          const properties: Record<string, unknown> = {};
          if (versionMatch) {
            properties.version = versionMatch[1];
          }

          candidates.push({
            name: canonical.name,
            normalizedName: canonical.name,
            entityType: canonical.type,
            properties,
            confidence: 0.95,
          });
        }
      }
    }

    // 2. Extract constraint expressions
    const constraintMatches = text.match(/(?:strictly avoid|never use|always format|must be|prohibit)\s+([A-Za-z0-9_\s-]+)/gi);
    if (constraintMatches) {
      for (const m of constraintMatches) {
        const cleaned = m.replace(/^(strictly avoid|never use|always format|must be|prohibit)\s+/i, '').trim();
        if (cleaned.length > 2 && !seen.has(cleaned.toLowerCase())) {
          seen.add(cleaned.toLowerCase());
          candidates.push({
            name: cleaned,
            normalizedName: cleaned,
            entityType: 'CONSTRAINT',
            properties: { rule: m.trim() },
            confidence: 0.88,
          });
        }
      }
    }

    // 3. Extract capitalized project or role names
    const capitalizedTokens = text.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g) || [];
    for (const token of capitalizedTokens) {
      const lower = token.toLowerCase();
      if (['The', 'Our', 'When', 'Then', 'What', 'How', 'Always', 'Never', 'This', 'That', 'With', 'From', 'Into'].includes(token)) {
        continue;
      }
      if (!seen.has(lower)) {
        seen.add(lower);
        candidates.push({
          name: token,
          normalizedName: token,
          entityType: 'CONCEPT',
          properties: {},
          confidence: 0.7,
        });
      }
    }

    return candidates;
  }

  public normalizeName(name: string): { canonicalName: string; type?: EntityType } {
    const lower = name.toLowerCase().trim();
    const entry = this.canonicalDictionary.get(lower);
    if (entry) {
      return { canonicalName: entry.name, type: entry.type };
    }
    return { canonicalName: name.trim() };
  }

  private populateCanonicalDictionary(): void {
    const entries: Array<[string[], string, EntityType]> = [
      [['postgresql', 'postgres', 'pg', 'psql'], 'PostgreSQL', 'TECHNOLOGY'],
      [['sqlite', 'sqlite3', 'node:sqlite', 'better-sqlite3'], 'SQLite', 'TECHNOLOGY'],
      [['mysql', 'mariadb'], 'MySQL', 'TECHNOLOGY'],
      [['redis', 'valkey'], 'Redis', 'TECHNOLOGY'],
      [['typescript', 'ts'], 'TypeScript', 'TECHNOLOGY'],
      [['javascript', 'js', 'es6', 'es2022'], 'JavaScript', 'TECHNOLOGY'],
      [['python', 'py', 'python3'], 'Python', 'TECHNOLOGY'],
      [['react', 'react.js', 'react 19', 'reactjs'], 'React', 'TECHNOLOGY'],
      [['next.js', 'nextjs', 'next'], 'Next.js', 'TECHNOLOGY'],
      [['node.js', 'node', 'nodejs'], 'Node.js', 'TECHNOLOGY'],
      [['docker', 'dockerfile', 'compose'], 'Docker', 'TECHNOLOGY'],
      [['kubernetes', 'k8s'], 'Kubernetes', 'TECHNOLOGY'],
      [['aws', 'amazon web services'], 'AWS', 'TECHNOLOGY'],
      [['aurora', 'aws aurora'], 'AWS Aurora', 'TECHNOLOGY'],
      [['bedrock', 'aws bedrock'], 'AWS Bedrock', 'TECHNOLOGY'],
      [['tailwind', 'tailwindcss'], 'Tailwind CSS', 'TECHNOLOGY'],
      [['vite', 'vitejs'], 'Vite', 'TECHNOLOGY'],
      [['graphql', 'gql'], 'GraphQL', 'TECHNOLOGY'],
      [['vitest'], 'Vitest', 'TECHNOLOGY'],
      [['express', 'express.js'], 'Express', 'TECHNOLOGY'],
      [['user', 'developer', 'client', 'admin'], 'User', 'PERSON'],
      [['pure sql', 'no orm', 'raw sql'], 'Pure SQL (No ORM)', 'CONSTRAINT'],
    ];

    for (const [aliases, canonicalName, type] of entries) {
      for (const alias of aliases) {
        this.canonicalDictionary.set(alias.toLowerCase(), { name: canonicalName, type });
      }
    }
  }
}
