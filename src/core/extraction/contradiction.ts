import { GraphRepository } from '../storage/graph-repo.js';
import { RelationEdge } from '../types.js';

export interface ContradictionResolution {
  detected: boolean;
  conflictingRelationId?: string;
  supersededEntityName?: string;
  actionTaken?: 'SUPERSEDED' | 'INVALIDATED' | 'NONE';
}

export class ContradictionResolver {
  private graphRepo: GraphRepository;
  private exclusivePredicates = new Set([
    'PREFERS',
    'DEPLOYED_ON',
    'PRIMARY_LANGUAGE',
    'DEFAULT_DATABASE',
    'ARCHITECTED_AS',
  ]);

  constructor(graphRepo: GraphRepository) {
    this.graphRepo = graphRepo;
  }

  /**
   * Checks if a new relationship contradicts an existing active relationship.
   * If contradiction exists, updates valid_until and superseded_by on the older relationship.
   */
  public resolveContradiction(
    sourceEntityId: string,
    targetEntityId: string,
    relationType: string,
    newRelationId: string
  ): ContradictionResolution {
    const normRelationType = relationType.toUpperCase();

    // Check if predicate is mutually exclusive
    if (!this.exclusivePredicates.has(normRelationType)) {
      return { detected: false, actionTaken: 'NONE' };
    }

    // Find existing active relations with same source and same relation type
    const activeRelations = this.graphRepo.listRelations({
      sourceId: sourceEntityId,
      relationType: normRelationType,
      activeOnly: true,
    });

    for (const existing of activeRelations) {
      if (existing.targetEntityId !== targetEntityId) {
        // We found a contradiction! (e.g. User prefers X vs User prefers Y)
        this.graphRepo.markRelationSuperseded(existing.id, newRelationId);

        // Also add an explicit SUPERSEDES relation between new target and old target
        this.graphRepo.upsertRelation({
          sourceEntityId: targetEntityId,
          targetEntityId: existing.targetEntityId,
          relationType: 'SUPERSEDES',
          confidence: 0.95,
        });

        return {
          detected: true,
          conflictingRelationId: existing.id,
          supersededEntityName: existing.targetEntityName,
          actionTaken: 'SUPERSEDED',
        };
      }
    }

    return { detected: false, actionTaken: 'NONE' };
  }
}
