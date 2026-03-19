import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES } from '../config/constants.js';
import { type KnowledgeLink, type Memory } from '../config/types.js';
import { EmbeddingProvider } from '../services/embedding/index.js';
import { logger } from '../utils/logger.js';

export type LinkFromType = 'memory' | 'pattern' | 'outcome';
export type LinkToType = 'memory' | 'pattern' | 'outcome';
export type LinkRelation =
  | 'relates-to'
  | 'causes'
  | 'solves'
  | 'contradicts'
  | 'improves'
  | 'confirms';

export interface CreateLinkInput {
  fromType: LinkFromType;
  fromId: string;
  toType: LinkToType;
  toId: string;
  relation: LinkRelation;
  confidence?: number;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraphNode {
  id: string;
  type: LinkFromType;
  content: string;
  metadata?: Record<string, unknown>;
  connections?: number;
}

export interface KnowledgeGraphResult {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeLink[];
}

export class KnowledgeGraphService {
  private readonly db: DatabaseClient;
  private readonly embedding?: EmbeddingProvider;

  constructor(db: DatabaseClient, embedding?: EmbeddingProvider) {
    this.db = db;
    this.embedding = embedding;
  }

  async createLink(input: CreateLinkInput): Promise<string> {
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.KNOWLEDGE_LINKS} 
       (id, from_type, from_id, to_type, to_id, relation, confidence, context, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (from_type, from_id, to_type, to_id, relation) DO UPDATE
       SET confidence = $7, context = $8, metadata = $9`,
      [
        id,
        input.fromType,
        input.fromId,
        input.toType,
        input.toId,
        input.relation,
        input.confidence ?? 0.5,
        input.context ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    logger.info(
      `[KnowledgeGraph] Created link: ${input.fromType}:${input.fromId} -> ${input.relation} -> ${input.toType}:${input.toId}`
    );
    return id;
  }

  async createMultipleLinks(links: CreateLinkInput[]): Promise<string[]> {
    const ids: string[] = [];
    for (const link of links) {
      const id = await this.createLink(link);
      ids.push(id);
    }
    return ids;
  }

  async deleteLink(linkId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM ${DATABASE_TABLES.KNOWLEDGE_LINKS} WHERE id = $1`,
      [linkId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getLinksForNode(
    nodeType: LinkFromType,
    nodeId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<KnowledgeLink[]> {
    let query: string;
    const params: unknown[] = [nodeType, nodeId];

    if (direction === 'outgoing') {
      query = `
        SELECT id, from_type as "fromType", from_id as "fromId", 
               to_type as "toType", to_id as "toId", relation, confidence, 
               context, metadata, created_at as "createdAt"
        FROM ${DATABASE_TABLES.KNOWLEDGE_LINKS}
        WHERE from_type = $1 AND from_id = $2
        ORDER BY confidence DESC`;
    } else if (direction === 'incoming') {
      query = `
        SELECT id, from_type as "fromType", from_id as "fromId", 
               to_type as "toType", to_id as "toId", relation, confidence, 
               context, metadata, created_at as "createdAt"
        FROM ${DATABASE_TABLES.KNOWLEDGE_LINKS}
        WHERE to_type = $1 AND to_id = $2
        ORDER BY confidence DESC`;
    } else {
      query = `
        SELECT id, from_type as "fromType", from_id as "fromId", 
               to_type as "toType", to_id as "toId", relation, confidence, 
               context, metadata, created_at as "createdAt"
        FROM ${DATABASE_TABLES.KNOWLEDGE_LINKS}
        WHERE (from_type = $1 AND from_id = $2) OR (to_type = $1 AND to_id = $2)
        ORDER BY confidence DESC`;
    }

    const result = await this.db.query<KnowledgeLink>(query, params);
    return result.rows;
  }

  async getSubgraph(
    nodeType: LinkFromType,
    nodeId: string,
    depth: number = 2,
    limit: number = 50
  ): Promise<KnowledgeGraphResult> {
    const visited = new Set<string>();
    const nodes: KnowledgeGraphNode[] = [];
    const links: KnowledgeLink[] = [];

    const addNode = async (type: LinkFromType, id: string) => {
      const key = `${type}:${id}`;
      if (visited.has(key)) return;
      visited.add(key);

      const content = await this.getNodeContent(type, id);
      if (content) {
        nodes.push({
          id,
          type,
          content: content.content,
          metadata: content.metadata,
        });
      }
    };

    const traverse = async (type: LinkFromType, id: string, currentDepth: number) => {
      if (currentDepth > depth) return;

      await addNode(type, id);

      const nodeLinks = await this.getLinksForNode(type, id, 'both');
      for (const link of nodeLinks) {
        if (!links.find(l => l.id === link.id)) {
          links.push(link);
        }
        await traverse(link.toType, link.toId, currentDepth + 1);
        await traverse(link.fromType, link.fromId, currentDepth + 1);
      }
    };

    await traverse(nodeType, nodeId, 0);

    const limitedNodes = nodes.slice(0, limit);
    const nodeIds = new Set(limitedNodes.map(n => `${n.type}:${n.id}`));
    const filteredLinks = links.filter(
      l => nodeIds.has(`${l.fromType}:${l.fromId}`) && nodeIds.has(`${l.toType}:${l.toId}`)
    );

    return {
      nodes: limitedNodes.map(n => ({
        ...n,
        connections: filteredLinks.filter(l => l.fromId === n.id || l.toId === n.id).length,
      })),
      links: filteredLinks,
    };
  }

  private async getNodeContent(
    type: LinkFromType,
    id: string
  ): Promise<{ content: string; metadata?: Record<string, unknown> } | null> {
    if (type === 'memory') {
      const result = await this.db.query<Memory>(
        `SELECT content, metadata FROM ${DATABASE_TABLES.MEMORY} WHERE id = $1`,
        [id]
      );
      if (result.rows.length > 0 && result.rows[0]) {
        return { content: result.rows[0].content, metadata: result.rows[0].metadata };
      }
    } else if (type === 'pattern') {
      const result = await this.db.query<{
        pattern_content: string;
        metadata: Record<string, unknown>;
      }>(`SELECT pattern_content, metadata FROM ${DATABASE_TABLES.TASK_PATTERNS} WHERE id = $1`, [
        id,
      ]);
      if (result.rows.length > 0 && result.rows[0]) {
        return { content: result.rows[0].pattern_content, metadata: result.rows[0].metadata };
      }
    }
    return null;
  }

  async findConnectedNodes(
    nodeType: LinkFromType,
    nodeId: string,
    relation?: LinkRelation
  ): Promise<Array<{ node: KnowledgeGraphNode; relation: LinkRelation; confidence: number }>> {
    const links = await this.getLinksForNode(nodeType, nodeId, 'both');

    const filteredLinks = relation ? links.filter(l => l.relation === relation) : links;

    const results: Array<{ node: KnowledgeGraphNode; relation: LinkRelation; confidence: number }> =
      [];

    for (const link of filteredLinks) {
      const connectedType =
        link.fromId === nodeId && link.fromType === nodeType ? link.toType : link.fromType;
      const connectedId =
        link.fromId === nodeId && link.fromType === nodeType ? link.toId : link.fromId;

      const content = await this.getNodeContent(connectedType, connectedId);
      if (content) {
        results.push({
          node: {
            id: connectedId,
            type: connectedType,
            content: content.content,
            metadata: content.metadata,
          },
          relation: link.relation,
          confidence: link.confidence,
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  async autoBuildLinks(_projectId?: string): Promise<number> {
    const result = await this.db.query<{ auto_build_knowledge_links: number }>(
      `SELECT auto_build_knowledge_links()`
    );
    const count = result.rows[0]?.auto_build_knowledge_links ?? 0;
    logger.info(`[KnowledgeGraph] Auto-built ${count} links`);
    return count;
  }

  async linkMemoryToPattern(
    memoryId: string,
    patternId: string,
    context?: string
  ): Promise<string> {
    return this.createLink({
      fromType: 'memory',
      fromId: memoryId,
      toType: 'pattern',
      toId: patternId,
      relation: 'relates-to',
      confidence: 0.7,
      context,
    });
  }

  async linkPatternToPattern(
    fromPatternId: string,
    toPatternId: string,
    relation: LinkRelation,
    confidence: number = 0.5
  ): Promise<string> {
    return this.createLink({
      fromType: 'pattern',
      fromId: fromPatternId,
      toType: 'pattern',
      toId: toPatternId,
      relation,
      confidence,
    });
  }

  async linkSolutionToError(
    solutionPatternId: string,
    errorPatternId: string,
    context?: string
  ): Promise<string> {
    return this.createLink({
      fromType: 'pattern',
      fromId: solutionPatternId,
      toType: 'pattern',
      toId: errorPatternId,
      relation: 'solves',
      confidence: 0.8,
      context: context || 'This pattern successfully resolves the error pattern',
    });
  }

  async getKnowledgeStats(): Promise<{
    totalLinks: number;
    byRelation: Record<string, number>;
    byType: Record<string, number>;
    avgConfidence: number;
  }> {
    const result = await this.db.query<{
      total_links: string;
      by_relation: Record<string, number>;
      by_type: Record<string, number>;
      avg_confidence: string;
    }>(
      `SELECT 
        COUNT(*) as total_links,
        jsonb_object_agg(relation, count) as by_relation,
        (SELECT jsonb_object_agg(type, count) FROM (
          SELECT from_type as type, COUNT(*) as count FROM ${DATABASE_TABLES.KNOWLEDGE_LINKS} GROUP BY from_type
          UNION ALL
          SELECT to_type as type, COUNT(*) as count FROM ${DATABASE_TABLES.KNOWLEDGE_LINKS} GROUP BY to_type
        ) t GROUP BY type) as by_type,
        AVG(confidence) as avg_confidence
       FROM ${DATABASE_TABLES.KNOWLEDGE_LINKS}`
    );

    const row = result.rows[0];
    return {
      totalLinks: parseInt(row?.total_links || '0', 10),
      byRelation: (row?.by_relation || {}) as Record<string, number>,
      byType: (row?.by_type || {}) as Record<string, number>,
      avgConfidence: parseFloat(row?.avg_confidence || '0.5'),
    };
  }

  async findRelatedMemories(memoryId: string, limit: number = 5): Promise<Memory[]> {
    const links = await this.getLinksForNode('memory', memoryId, 'outgoing');
    const incomingLinks = await this.getLinksForNode('memory', memoryId, 'incoming');

    const relatedIds = [
      ...links.filter(l => l.toType === 'memory').map(l => l.toId),
      ...incomingLinks.filter(l => l.fromType === 'memory').map(l => l.fromId),
    ];

    if (relatedIds.length === 0) return [];

    const result = await this.db.query<Memory>(
      `SELECT id, project_id as "projectId", content, metadata, 
              created_at as "createdAt", updated_at as "updatedAt"
       FROM ${DATABASE_TABLES.MEMORY}
       WHERE id = ANY($1)
       LIMIT $2`,
      [relatedIds, limit]
    );

    return result.rows;
  }

  async suggestLinks(
    memoryId: string,
    limit: number = 3
  ): Promise<
    Array<{
      suggestedType: LinkToType;
      suggestedId: string;
      suggestedContent: string;
      confidence: number;
      reason: string;
    }>
  > {
    const memoryResult = await this.db.query<Memory>(
      `SELECT * FROM ${DATABASE_TABLES.MEMORY} WHERE id = $1`,
      [memoryId]
    );

    if (memoryResult.rows.length === 0 || !memoryResult.rows[0]) return [];

    const memory = memoryResult.rows[0];
    const suggestions: Array<{
      suggestedType: LinkToType;
      suggestedId: string;
      suggestedContent: string;
      confidence: number;
      reason: string;
    }> = [];

    const patternResult = await this.db.query<{
      id: string;
      pattern_content: string;
      pattern_category: string;
    }>(
      `SELECT id, pattern_content, pattern_category
       FROM ${DATABASE_TABLES.TASK_PATTERNS}
       WHERE is_active = TRUE
         AND pattern_content ILIKE ANY(ARRAY[('%' || word || '%')])
       LIMIT $1`,
      [limit]
    );

    for (const pattern of patternResult.rows) {
      suggestions.push({
        suggestedType: 'pattern',
        suggestedId: pattern.id,
        suggestedContent: pattern.pattern_content,
        confidence: 0.6,
        reason: `Pattern related to ${pattern.pattern_category}`,
      });
    }

    const memoryResult2 = await this.db.query<{ id: string; content: string; tags: string[] }>(
      `SELECT id, content, tags
       FROM ${DATABASE_TABLES.MEMORY}
       WHERE id != $1
         AND tags && $2::TEXT[]
       LIMIT $3`,
      [memoryId, memory.metadata?.tags || [], limit]
    );

    for (const related of memoryResult2.rows) {
      suggestions.push({
        suggestedType: 'memory',
        suggestedId: related.id,
        suggestedContent: related.content.substring(0, 100),
        confidence: 0.7,
        reason: 'Shares common tags',
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
  }
}
