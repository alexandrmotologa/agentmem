import fs from 'node:fs';
import path from 'node:path';
import { GraphRepository } from '../storage/graph-repo.js';
import { VectorStore } from '../storage/vector-store.js';
import { TripletParser } from './triplet-parser.js';
import { EntityExtractor } from './entity-extractor.js';
import { DocumentIngestResult, EntityType } from '../types.js';

export class DocumentExtractor {
  private graphRepo: GraphRepository;
  private vectorStore: VectorStore;
  private tripletParser: TripletParser;
  private entityExtractor: EntityExtractor;

  constructor(graphRepo: GraphRepository, vectorStore: VectorStore) {
    this.graphRepo = graphRepo;
    this.vectorStore = vectorStore;
    this.tripletParser = new TripletParser();
    this.entityExtractor = new EntityExtractor();
  }

  public async ingestMarkdownFile(
    filePath: string,
    options?: {
      namespace?: string;
      projectName?: string;
    }
  ): Promise<DocumentIngestResult> {
    const startTime = Date.now();
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const namespace = options?.namespace || 'default';
    const fallbackProject = options?.projectName || path.basename(filePath, path.extname(filePath));

    return await this.ingestMarkdownContent(content, resolvedPath, {
      namespace,
      projectName: fallbackProject,
      startTime,
    });
  }

  public async ingestMarkdownContent(
    content: string,
    sourcePath: string = 'inline_document.md',
    options?: {
      namespace?: string;
      projectName?: string;
      startTime?: number;
    }
  ): Promise<DocumentIngestResult> {
    const startTime = options?.startTime || Date.now();
    const namespace = options?.namespace || 'default';
    const lines = content.split('\n');

    let currentSection = 'Overview';
    let projectName = options?.projectName || 'Project';
    let sectionsCount = 0;
    let entitiesCreated = 0;
    let relationsCreated = 0;
    let tripletsExtracted = 0;

    // 1. Detect main document/project title from # Heading
    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) {
        projectName = h1Match[1].trim().replace(/[#*_`]/g, '');
        break;
      }
    }

    // Root project entity
    const projectEntity = this.graphRepo.upsertEntity({
      name: projectName,
      entityType: 'PROJECT',
      importanceScore: 0.95,
      properties: { sourceFile: sourcePath },
      namespace,
    });
    entitiesCreated++;

    await this.vectorStore.storeEmbedding(
      'ENTITY',
      projectEntity.id,
      `${projectEntity.name} PROJECT ${sourcePath}`,
      namespace
    );

    // 2. Process sections and bullet points
    const sectionBuffers: Array<{ heading: string; lines: string[] }> = [];
    let currentBuffer: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);

      if (headingMatch) {
        if (currentBuffer.length > 0) {
          sectionBuffers.push({ heading: currentSection, lines: currentBuffer });
          currentBuffer = [];
        }
        currentSection = headingMatch[2].trim().replace(/[#*_`]/g, '');
        sectionsCount++;
      } else if (line.length > 0) {
        currentBuffer.push(line);
      }
    }
    if (currentBuffer.length > 0) {
      sectionBuffers.push({ heading: currentSection, lines: currentBuffer });
      sectionsCount++;
    }

    // 3. Extract knowledge from each section
    for (const sec of sectionBuffers) {
      // Create section topic entity
      const sectionEntity = this.graphRepo.upsertEntity({
        name: sec.heading,
        entityType: 'CONCEPT',
        importanceScore: 0.7,
        namespace,
      });
      entitiesCreated++;

      // Project HAS_SECTION section
      this.graphRepo.upsertRelation({
        sourceEntityId: projectEntity.id,
        targetEntityId: sectionEntity.id,
        relationType: 'HAS_SECTION',
        confidence: 0.9,
        namespace,
      });
      relationsCreated++;

      // Process lines in section
      for (const rawLine of sec.lines) {
        // Strip bullet markdown markers
        const cleanLine = rawLine.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').trim();
        if (cleanLine.length < 5) continue;

        // A. Extract triplets from sentence
        const triplets = this.tripletParser.parse(cleanLine);
        for (const t of triplets) {
          tripletsExtracted++;

          const sEnt = this.graphRepo.upsertEntity({
            name: t.subject,
            entityType: t.subjectType,
            importanceScore: t.importance,
            namespace,
          });
          entitiesCreated++;

          const oEnt = this.graphRepo.upsertEntity({
            name: t.object,
            entityType: t.objectType,
            importanceScore: t.importance,
            namespace,
          });
          entitiesCreated++;

          this.graphRepo.upsertRelation({
            sourceEntityId: sEnt.id,
            targetEntityId: oEnt.id,
            relationType: t.predicate,
            confidence: t.confidence,
            namespace,
          });
          relationsCreated++;

          await this.vectorStore.storeEmbedding('ENTITY', sEnt.id, `${sEnt.name} ${sEnt.entityType}`, namespace);
          await this.vectorStore.storeEmbedding('ENTITY', oEnt.id, `${oEnt.name} ${oEnt.entityType}`, namespace);
        }

        // B. Check for technology, dependency or architectural patterns
        this.extractTechPatterns(cleanLine, projectEntity.id, namespace, (createdEnts, createdRels) => {
          entitiesCreated += createdEnts;
          relationsCreated += createdRels;
        });

        // C. Named entity recognition
        const entities = this.entityExtractor.extractEntities(cleanLine);
        for (const e of entities) {
          const ent = this.graphRepo.upsertEntity({
            name: e.name,
            entityType: e.entityType,
            importanceScore: 0.75,
            properties: e.properties,
            namespace,
          });
          entitiesCreated++;

          // Link to project if relevant
          if (ent.id !== projectEntity.id) {
            this.graphRepo.upsertRelation({
              sourceEntityId: projectEntity.id,
              targetEntityId: ent.id,
              relationType: 'RELATES_TO',
              confidence: 0.8,
              namespace,
            });
            relationsCreated++;
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      filePath: sourcePath,
      sectionsProcessed: sectionsCount,
      entitiesCreated,
      relationsCreated,
      tripletsExtracted,
      durationMs,
    };
  }

  private extractTechPatterns(
    line: string,
    projectId: string,
    namespace: string,
    onCreated: (ents: number, rels: number) => void
  ): void {
    const patterns = [
      { regex: /(?:written in|built with|implemented in)\s+([A-Za-z0-9+#_.-]+)/i, relation: 'WRITTEN_IN', type: 'TECHNOLOGY' as EntityType },
      { regex: /(?:uses|utilizes|powered by|backed by)\s+([A-Za-z0-9+#_.-]+)/i, relation: 'USES', type: 'TECHNOLOGY' as EntityType },
      { regex: /(?:runs on|deployed on|hosted on)\s+([A-Za-z0-9+#_.-]+)/i, relation: 'DEPLOYED_ON', type: 'TECHNOLOGY' as EntityType },
      { regex: /(?:requires|depends on)\s+([A-Za-z0-9+#_.-]+)/i, relation: 'REQUIRES', type: 'TECHNOLOGY' as EntityType },
      { regex: /(?:port|runs on port)\s*[:=]?\s*(\d{2,5})/i, relation: 'RUNS_ON_PORT', type: 'CONCEPT' as EntityType },
      { regex: /(?:database|storage engine)\s*[:=]?\s*([A-Za-z0-9+#_.-]+)/i, relation: 'USES_DATABASE', type: 'TECHNOLOGY' as EntityType },
    ];

    for (const pat of patterns) {
      const match = line.match(pat.regex);
      if (match && match[1]) {
        const val = match[1].trim();
        if (val.length > 1 && !['a', 'an', 'the', 'this', 'that'].includes(val.toLowerCase())) {
          const target = this.graphRepo.upsertEntity({
            name: val,
            entityType: pat.type,
            importanceScore: 0.85,
            namespace,
          });

          this.graphRepo.upsertRelation({
            sourceEntityId: projectId,
            targetEntityId: target.id,
            relationType: pat.relation,
            confidence: 0.95,
            namespace,
          });

          onCreated(1, 1);
        }
      }
    }
  }
}
