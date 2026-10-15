import { GraphRepository } from '../storage/graph-repo.js';
import { EntityNode, RelationEdge } from '../types.js';

export interface TraversalResult {
  seedEntity: EntityNode;
  neighbors: Array<{
    relation: string;
    targetName: string;
    targetType: string;
    targetId: string;
    direction: 'outgoing' | 'incoming';
    confidence: number;
  }>;
}

export class GraphTraversal {
  private graphRepo: GraphRepository;

  constructor(graphRepo: GraphRepository) {
    this.graphRepo = graphRepo;
  }

  public traverseNeighborhood(entityId: string, maxHops: number = 1): TraversalResult | null {
    const seed = this.graphRepo.getEntityById(entityId);
    if (!seed || seed.isArchived) return null;

    const { nodes, edges } = this.graphRepo.getConnectedNeighborhood(entityId, maxHops);
    const nodeMap = new Map<string, EntityNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    const neighbors: TraversalResult['neighbors'] = [];

    for (const edge of edges) {
      if (edge.sourceEntityId === entityId) {
        const targetNode = nodeMap.get(edge.targetEntityId);
        if (targetNode && !targetNode.isArchived) {
          neighbors.push({
            relation: edge.relationType,
            targetName: targetNode.name,
            targetType: targetNode.entityType,
            targetId: targetNode.id,
            direction: 'outgoing',
            confidence: edge.confidence,
          });
        }
      } else if (edge.targetEntityId === entityId) {
        const sourceNode = nodeMap.get(edge.sourceEntityId);
        if (sourceNode && !sourceNode.isArchived) {
          neighbors.push({
            relation: edge.relationType,
            targetName: sourceNode.name,
            targetType: sourceNode.entityType,
            targetId: sourceNode.id,
            direction: 'incoming',
            confidence: edge.confidence,
          });
        }
      }
    }

    return {
      seedEntity: seed,
      neighbors,
    };
  }
}
