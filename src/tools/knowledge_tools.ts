import { DatabaseClient } from '../db/DatabaseClient.js';
import { KnowledgeGraphService, type LinkRelation } from '../core/KnowledgeGraph.js';
import { logger } from '../utils/logger.js';

export interface MemoryLinkInput {
  fromId: string;
  toId: string;
  relation?: LinkRelation;
  confidence?: number;
  context?: string;
}

export async function memory_link(
  db: DatabaseClient,
  input: MemoryLinkInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const id = await kgService.createLink({
    fromType: 'memory',
    fromId: input.fromId,
    toType: 'memory',
    toId: input.toId,
    relation: input.relation || 'relates-to',
    confidence: input.confidence ?? 0.5,
    context: input.context,
  });

  logger.info(`[KnowledgeTools] Linked memory ${input.fromId} -> ${input.toId}`);
  return id;
}

export interface LinkPatternInput {
  fromId: string;
  toId: string;
  relation: LinkRelation;
  confidence?: number;
  context?: string;
}

export async function pattern_link(
  db: DatabaseClient,
  input: LinkPatternInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const id = await kgService.createLink({
    fromType: 'pattern',
    fromId: input.fromId,
    toType: 'pattern',
    toId: input.toId,
    relation: input.relation,
    confidence: input.confidence ?? 0.5,
    context: input.context,
  });

  logger.info(`[KnowledgeTools] Linked pattern ${input.fromId} -> ${input.toId}`);
  return id;
}

export interface LinkMemoryToPatternInput {
  memoryId: string;
  patternId: string;
  relation?: LinkRelation;
  context?: string;
}

export async function memory_to_pattern_link(
  db: DatabaseClient,
  input: LinkMemoryToPatternInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const id = await kgService.createLink({
    fromType: 'memory',
    fromId: input.memoryId,
    toType: 'pattern',
    toId: input.patternId,
    relation: input.relation || 'relates-to',
    confidence: 0.7,
    context: input.context,
  });

  logger.info(`[KnowledgeTools] Linked memory ${input.memoryId} -> pattern ${input.patternId}`);
  return id;
}

export interface GetConnectedNodesInput {
  nodeType: 'memory' | 'pattern' | 'outcome';
  nodeId: string;
  relation?: LinkRelation;
}

export async function get_connected_nodes(
  db: DatabaseClient,
  input: GetConnectedNodesInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const connected = await kgService.findConnectedNodes(
    input.nodeType,
    input.nodeId,
    input.relation
  );

  if (connected.length === 0) {
    return 'No connected nodes found.';
  }

  const formatted = connected.map((item, i) => 
    `${i + 1}. [${item.node.type.toUpperCase()}] ${item.node.content.substring(0, 80)}...\n` +
    `   Relation: ${item.relation}, Confidence: ${Math.round(item.confidence * 100)}%`
  ).join('\n\n');

  return `## Connected Nodes\n\n${formatted}`;
}

export interface GetKnowledgeSubgraphInput {
  nodeType: 'memory' | 'pattern' | 'outcome';
  nodeId: string;
  depth?: number;
  limit?: number;
}

export async function get_knowledge_subgraph(
  db: DatabaseClient,
  input: GetKnowledgeSubgraphInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const result = await kgService.getSubgraph(
    input.nodeType,
    input.nodeId,
    input.depth ?? 2,
    input.limit ?? 50
  );

  const nodeList = result.nodes.map((n, i) => 
    `${i + 1}. [${n.type.toUpperCase()}] ${n.content.substring(0, 60)}... (${n.connections} connections)`
  ).join('\n');

  const linkList = result.links.map(l => 
    `${l.fromType}:${l.fromId.substring(0, 8)}... --[${l.relation}]--> ${l.toType}:${l.toId.substring(0, 8)}...`
  ).join('\n');

  return `## Knowledge Subgraph\n\n### Nodes (${result.nodes.length})\n${nodeList}\n\n### Links (${result.links.length})\n${linkList}`;
}

export interface SuggestLinksInput {
  memoryId: string;
  limit?: number;
}

export async function suggest_links(
  db: DatabaseClient,
  input: SuggestLinksInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const suggestions = await kgService.suggestLinks(
    input.memoryId,
    input.limit ?? 3
  );

  if (suggestions.length === 0) {
    return 'No link suggestions available.';
  }

  const formatted = suggestions.map((s, i) => 
    `${i + 1}. [${s.suggestedType.toUpperCase()}] ${s.suggestedContent.substring(0, 80)}...\n` +
    `   Reason: ${s.reason}, Confidence: ${Math.round(s.confidence * 100)}%`
  ).join('\n\n');

  return `## Suggested Links for Memory\n\n${formatted}`;
}

export interface GetRelatedMemoriesInput {
  memoryId: string;
  limit?: number;
}

export async function get_related_memories(
  db: DatabaseClient,
  input: GetRelatedMemoriesInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const related = await kgService.findRelatedMemories(
    input.memoryId,
    input.limit ?? 5
  );

  if (related.length === 0) {
    return 'No related memories found.';
  }

  const formatted = related.map((m, i) => 
    `${i + 1}. ${m.content.substring(0, 100)}...`
  ).join('\n\n');

  return `## Related Memories\n\n${formatted}`;
}

export async function auto_build_links(
  db: DatabaseClient,
  projectId?: string
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  const count = await kgService.autoBuildLinks(projectId);
  return `Auto-built ${count} knowledge links.`;
}

export async function get_knowledge_stats(
  db: DatabaseClient
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  const stats = await kgService.getKnowledgeStats();

  const relationStats = Object.entries(stats.byRelation)
    .map(([rel, count]) => `- ${rel}: ${count}`)
    .join('\n');

  const typeStats = Object.entries(stats.byType)
    .map(([type, count]) => `- ${type}: ${count}`)
    .join('\n');

  return `## Knowledge Graph Statistics

### Overall
- Total Links: ${stats.totalLinks}
- Average Confidence: ${Math.round(stats.avgConfidence * 100)}%

### By Relation
${relationStats}

### By Node Type
${typeStats}`;
}

export interface LinkSolutionToErrorInput {
  solutionPatternId: string;
  errorPatternId: string;
  context?: string;
}

export async function link_solution_to_error(
  db: DatabaseClient,
  input: LinkSolutionToErrorInput
): Promise<string> {
  const kgService = new KnowledgeGraphService(db);
  
  const id = await kgService.linkSolutionToError(
    input.solutionPatternId,
    input.errorPatternId,
    input.context
  );

  logger.info(`[KnowledgeTools] Linked solution ${input.solutionPatternId} to error ${input.errorPatternId}`);
  return id;
}
