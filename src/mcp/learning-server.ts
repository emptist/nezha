import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';

const server = new Server(
  { name: 'nezha-learning', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

let db: DatabaseClient | null = null;

function getDb(): DatabaseClient {
  if (!db) {
    db = new DatabaseClient(Config.getInstance());
  }
  return db;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'learn',
        description:
          'Save an important insight or learning for future reference. Use this after discovering something valuable during your work.',
        inputSchema: {
          type: 'object',
          properties: {
            insight: {
              type: 'string',
              description: 'The key insight or learning to save',
            },
            context: {
              type: 'string',
              description: 'Optional context about when/why this insight was discovered',
            },
          },
          required: ['insight'],
        },
      },
      {
        name: 'memory_search',
        description: 'Search long-term memory for relevant past learnings, solutions, or patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to find relevant memories',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
              default: 10,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'suggest_prompt_update',
        description:
          'Suggest an improvement to a system prompt. Useful when you discover a better way to instruct AI agents.',
        inputSchema: {
          type: 'object',
          properties: {
            current_prompt: {
              type: 'string',
              description: 'The current prompt text to improve',
            },
            suggested_prompt: {
              type: 'string',
              description: 'Your suggested improvement',
            },
            reason: {
              type: 'string',
              description: 'Why this improvement would be beneficial',
            },
          },
          required: ['current_prompt', 'suggested_prompt', 'reason'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'learn') {
      const { insight, context } = args as { insight: string; context?: string };
      const database = getDb();

      await database.query(
        `INSERT INTO memory (content, tags, source, importance, metadata) 
         VALUES ($1, ARRAY['learning', 'reflection'], 'mcp-learn', $2, $3)`,
        [insight, context ? 5 : 3, JSON.stringify({ context })]
      );

      return {
        content: [
          {
            type: 'text',
            text: `Learning saved successfully: "${insight.substring(0, 100)}${insight.length > 100 ? '...' : ''}"`,
          },
        ],
      };
    }

    if (name === 'memory_search') {
      const { query, limit = 10 } = args as { query: string; limit?: number };
      const database = getDb();

      const result = await database.query(
        `SELECT id, content, metadata, created_at 
         FROM memory 
         WHERE content ILIKE $1 
         ORDER BY importance DESC, created_at DESC 
         LIMIT $2`,
        [`%${query}%`, limit]
      );

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: `No memories found for: "${query}"` }],
        };
      }

      const formatted = result.rows
        .map(
          (row, i) =>
            `${i + 1}. ${row.content?.substring(0, 200)}${row.content.length > 200 ? '...' : ''}\n   ID: ${row.id}`
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.rows.length} memories:\n\n${formatted}`,
          },
        ],
      };
    }

    if (name === 'suggest_prompt_update') {
      const { current_prompt, suggested_prompt, reason } = args as {
        current_prompt: string;
        suggested_prompt: string;
        reason: string;
      };
      const database = getDb();

      await database.query(
        `INSERT INTO prompt_suggestions (current_prompt, suggested_prompt, reason, status)
         VALUES ($1, $2, $3, 'pending')`,
        [current_prompt, suggested_prompt, reason]
      );

      return {
        content: [
          {
            type: 'text',
            text: `Prompt update suggested and saved for review: "${reason.substring(0, 100)}${reason.length > 100 ? '...' : ''}"`,
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Nezha Learning MCP Server running...');
}

main().catch(console.error);
