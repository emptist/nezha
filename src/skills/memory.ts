import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { logger } from '../utils/logger.js';

let _db: DatabaseClient | null = null;

async function getDatabaseClient(): Promise<DatabaseClient> {
  if (!_db) {
    const config = Config.getInstance();
    _db = new DatabaseClient(config);
  }
  return _db;
}

interface MemorySaveParams {
  content: string;
  tags?: string[];
  context?: string;
  source?: string;
  importance?: number;
}

interface MemorySearchParams {
  query: string;
  tags?: string[];
  limit?: number;
}

interface MemoryLinkParams {
  source_id: string;
  target_id: string;
  relationship: string;
}

export const memorySkills = {
  memory_save: {
    description: 'Save learned knowledge to permanent memory',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The knowledge or pattern learned',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization',
        },
        context: {
          type: 'string',
          description: 'When/where this knowledge is useful',
        },
        source: {
          type: 'string',
          description: 'Where this knowledge came from',
        },
        importance: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Importance score',
        },
      },
      required: ['content'],
    },
    execute: async (params: MemorySaveParams) => {
      const { content, tags, context, source, importance } = params;
      const query = `INSERT INTO memories (content, tags, context, source, importance)
                    VALUES ($1, $2, $3, $4, $5)`;
      const values = [content, tags, context, source, importance];

      try {
        const db = await getDatabaseClient();
        await db.query(query, values);
        logger.info('[MemorySkill] Saved memory successfully');
      } catch (error) {
        logger.error('[MemorySkill] Error saving memory:', error);
        throw new Error('Failed to save memory', { cause: error });
      }
    },
  },

  memory_search: {
    description: 'Search for relevant knowledge in memory',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags',
        },
        limit: {
          type: 'integer',
          default: 10,
        },
      },
      required: ['query'],
    },
    execute: async (params: MemorySearchParams) => {
      logger.info(`[MemorySkill] Searching memory: ${params.query}`);
    },
  },

  memory_link: {
    description: 'Connect related pieces of knowledge',
    parameters: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'Source memory ID',
        },
        target_id: {
          type: 'string',
          description: 'Target memory ID',
        },
        relationship: {
          type: 'string',
          description: 'How they are related',
        },
      },
      required: ['source_id', 'target_id', 'relationship'],
    },
    execute: async (params: MemoryLinkParams) => {
      logger.info(`[MemorySkill] Linking ${params.source_id} → ${params.target_id} (${params.relationship})`);
    },
  },
};
