import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import { SoulService } from '../services/SoulService.js';

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
      {
        name: 'check_broadcasts',
        description:
          'Check for pending broadcasts, discussions, and action items from other AIs. Call this regularly to stay informed about system updates and discussions.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of broadcasts to return (default: 5)',
              default: 5,
            },
          },
        },
      },
      {
        name: 'respond_to_broadcast',
        description:
          'Save your response or opinion to a broadcast. Use this to participate in discussions and share your perspective.',
        inputSchema: {
          type: 'object',
          properties: {
            broadcast_id: {
              type: 'string',
              description: 'The ID of the broadcast to respond to',
            },
            response: {
              type: 'string',
              description: 'Your response or opinion',
            },
          },
          required: ['broadcast_id', 'response'],
        },
      },
      {
        name: 'whoami',
        description:
          'Get the current agent identity. Returns the agent ID, session ID, and display name. Use this to verify your identity in the Nezha system.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_system_info',
        description:
          'Get system information for onboarding: current session status, open issues, active tasks, and essential skills. Use this to get context when starting in Nezha.',
        inputSchema: {
          type: 'object',
          properties: {
            include_issues: {
              type: 'boolean',
              description: 'Include open issues (default: true)',
              default: true,
            },
            include_tasks: {
              type: 'boolean',
              description: 'Include active tasks (default: true)',
              default: true,
            },
            include_skills: {
              type: 'boolean',
              description: 'Include essential skills (default: true)',
              default: true,
            },
          },
        },
      },
      {
        name: 'get_skill',
        description:
          'Get a skill by name. Skills define behavior for AI agents. Use this to load Nezha skills like nezha-essential, ai-qc, meeting-protocol, self-improvement.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the skill to retrieve',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_soul',
        description:
          "Get the soul/personality of an AI agent. Returns the agent's identity, content (SOUL.md), and traits.",
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: {
              type: 'string',
              description: 'Agent ID to get the soul for (defaults to self)',
            },
          },
        },
      },
      {
        name: 'save_soul',
        description:
          'Save or update your soul/personality. Use this to persist your AI identity, values, and working style.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Display name for this AI',
            },
            content: {
              type: 'string',
              description:
                'Soul content - your identity, values, working style, and SOUL.md content',
            },
            traits: {
              type: 'object',
              description: "Key traits that define this AI's personality",
            },
          },
        },
      },
      {
        name: 'get_tasks',
        description: 'Get pending tasks from the task queue. Returns tasks ordered by priority.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'],
              description: 'Task status filter (default: PENDING)',
              default: 'PENDING',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of tasks to return (default: 10)',
              default: 10,
            },
          },
        },
      },
      {
        name: 'get_inter_review_stats',
        description:
          'Get Inter-Review system statistics. Shows recent reviews, scores, and pending actions.',
        inputSchema: {
          type: 'object',
          properties: {},
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
      const identity = await AgentIdentityService.getResolvedIdentity();
      const agentId = identity.id;

      await database.query(
        `INSERT INTO memory (agent_id, content, tags, source, importance, metadata) 
         VALUES ($1, $2, ARRAY['learning', 'reflection'], 'mcp-learn', $3, $4)`,
        [agentId, insight, context ? 5 : 3, JSON.stringify({ context })]
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
      const identity = await AgentIdentityService.getResolvedIdentity();
      const agentId = identity.id;

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

      // Mark memories as viewed
      for (const row of result.rows) {
        await database.query(
          `UPDATE memory SET viewers = array_distinct(viewers || $1) WHERE id = $2`,
          [agentId, row.id]
        );
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

    if (name === 'check_broadcasts') {
      const { limit = 5 } = args as { limit?: number };
      const database = getDb();

      const result = await database.query(
        `SELECT id, from_ai, to_ai, message_type, content, metadata, created_at
         FROM project_communications
         WHERE to_ai IS NULL
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: 'No pending broadcasts or discussions.' }],
        };
      }

      // Mark broadcasts as viewed
      for (const row of result.rows) {
        await database.query(`UPDATE project_communications SET read_at = NOW() WHERE id = $1`, [
          row.id,
        ]);
      }

      const formatted = result.rows
        .map(
          row =>
            `[${row.message_type.toUpperCase()}] From: ${row.from_ai}\n` +
            `ID: ${row.id}\n` +
            `Content: ${row.content.substring(0, 300)}${row.content.length > 300 ? '...' : ''}\n` +
            `Time: ${new Date(row.created_at).toLocaleString()}`
        )
        .join('\n\n---\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${result.rows.length} broadcasts/discussions:\n\n${formatted}`,
          },
        ],
      };
    }

    if (name === 'respond_to_broadcast') {
      const { broadcast_id, response } = args as {
        broadcast_id: string;
        response: string;
      };
      const database = getDb();

      const broadcastResult = await database.query(
        `SELECT project_id, from_ai, content FROM project_communications WHERE id = $1`,
        [broadcast_id]
      );

      const broadcast = broadcastResult.rows[0];
      if (!broadcast) {
        return {
          content: [{ type: 'text', text: `Broadcast ${broadcast_id} not found.` }],
          isError: true,
        };
      }

      await database.query(
        `INSERT INTO project_communications (project_id, from_ai, to_ai, message_type, content, metadata)
         VALUES ($1, 'nezha-daemon', $2, 'answer', $3, $4)`,
        [
          broadcast.project_id,
          broadcast.from_ai,
          response,
          JSON.stringify({ in_response_to: broadcast_id, original_content: broadcast.content }),
        ]
      );

      return {
        content: [
          {
            type: 'text',
            text: `Response saved to broadcast ${broadcast_id}. Your opinion has been recorded.`,
          },
        ],
      };
    }

    if (name === 'whoami') {
      const identity = await AgentIdentityService.getResolvedIdentity();
      const agentId = identity.id;
      const sessionId = identity.id;
      const configDisplayName = identity.displayName;

      let displayName = configDisplayName || '(not set)';
      if (!configDisplayName) {
        try {
          const db = getDb();
          const result = await db.query(
            'SELECT display_name FROM agent_identity WHERE agent_name = $1',
            [agentId.replace('bot_', '')]
          );
          if (result.rows.length > 0) {
            const row = result.rows[0];
            if (row && row.display_name) {
              displayName = row.display_name;
            }
          }
        } catch {
          // Fallback to config value
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Agent Identity:\n- Agent ID: ${agentId}\n- Session ID: ${sessionId}\n- Display Name: ${displayName}\n- Agent Name: ${identity.displayName || agentId}`,
          },
        ],
      };
    }

    if (name === 'get_system_info') {
      const {
        include_issues = true,
        include_tasks = true,
        include_skills = true,
      } = args as {
        include_issues?: boolean;
        include_tasks?: boolean;
        include_skills?: boolean;
      };
      const database = getDb();
      const lines: string[] = ['=== System Information ==='];

      if (include_skills) {
        const skillsResult = await database.query(
          `SELECT name, description FROM skills WHERE status = 'approved' AND name IN ('ai-qc', 'meeting-protocol', 'self-improvement', 'nezha-essential') ORDER BY name LIMIT 10`
        );
        lines.push('\n--- Essential Skills ---');
        if (skillsResult.rows.length > 0) {
          lines.push(skillsResult.rows.map(s => `• ${s.name}: ${s.description}`).join('\n'));
        } else {
          lines.push('No essential skills found');
        }
      }

      if (include_issues) {
        const issuesResult = await database.query(
          `SELECT id, title, severity, status FROM issues WHERE status = 'OPEN' ORDER BY severity DESC, created_at DESC LIMIT 5`
        );
        lines.push('\n--- Open Issues ---');
        if (issuesResult.rows.length > 0) {
          lines.push(
            issuesResult.rows
              .map(i => `• [${i.severity}] ${i.title} (${i.id?.substring(0, 8)})`)
              .join('\n')
          );
          const identity = await AgentIdentityService.getResolvedIdentity();
          const agentId = identity.id;
          for (const issue of issuesResult.rows) {
            await database.query(
              `UPDATE issues SET viewers = array_distinct(viewers || $1) WHERE id = $2`,
              [agentId, issue.id]
            );
          }
        } else {
          lines.push('No open issues');
        }
      }

      if (include_tasks) {
        const tasksResult = await database.query(
          `SELECT id, title, status, priority FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 5`
        );
        lines.push('\n--- Active Tasks ---');
        if (tasksResult.rows.length > 0) {
          lines.push(
            tasksResult.rows.map(t => `• [${t.priority}] ${t.title.substring(0, 50)}`).join('\n')
          );
        } else {
          lines.push('No active tasks');
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n'),
          },
        ],
      };
    }

    if (name === 'get_skill') {
      const { name: skillName } = args as { name: string };
      const database = getDb();
      const identity = await AgentIdentityService.getResolvedIdentity();
      const agentId = identity.id;

      const result = await database.query(
        `SELECT id, name, content, description FROM skills WHERE name = $1 AND status = 'approved'`,
        [skillName]
      );

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: `Skill "${skillName}" not found or not approved.` }],
          isError: true,
        };
      }

      const skill = result.rows[0];
      if (!skill) {
        return {
          content: [{ type: 'text', text: `Skill "${skillName}" not found.` }],
          isError: true,
        };
      }

      // Mark skill as viewed
      await database.query(
        `UPDATE skills SET viewers = array_distinct(viewers || $1) WHERE id = $2`,
        [agentId, skill.id]
      );

      return {
        content: [
          {
            type: 'text',
            text: `# ${skill.name}\n\n${skill.description ?? ''}\n\n---\n\n${skill.content ?? ''}`,
          },
        ],
      };
    }

    if (name === 'get_soul') {
      const { agent_id } = args as { agent_id?: string };
      const database = getDb();
      const soulService = new SoulService(database);
      const identity = await AgentIdentityService.getResolvedIdentity();

      const targetAgentId = agent_id || identity.id;
      const soul = await soulService.getSoul(targetAgentId);

      if (!soul) {
        return {
          content: [
            {
              type: 'text',
              text: `No soul found for agent "${targetAgentId}". Use save_soul to create one.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `## Soul: ${soul.name || targetAgentId}\n\n**Agent ID:** ${soul.agentId}\n\n---\n\n${soul.content || '(no content)'}\n\n---\n\n**Traits:** ${JSON.stringify(soul.traits, null, 2)}`,
          },
        ],
      };
    }

    if (name === 'save_soul') {
      const { name, content, traits } = args as {
        name?: string;
        content?: string;
        traits?: Record<string, unknown>;
      };
      const database = getDb();
      const soulService = new SoulService(database);
      const identity = await AgentIdentityService.getResolvedIdentity();

      const id = await soulService.saveSoul(identity.id, name, content, traits);

      return {
        content: [
          {
            type: 'text',
            text: `Soul saved successfully. ID: ${id}`,
          },
        ],
      };
    }

    if (name === 'get_tasks') {
      const { status = 'PENDING', limit = 10 } = args as {
        status?: string;
        limit?: number;
      };
      const database = getDb();

      const result = await database.query(
        `SELECT id, title, description, priority, status, created_at, retry_count
         FROM tasks
         WHERE status = $1
         ORDER BY priority DESC, created_at ASC
         LIMIT $2`,
        [status, limit]
      );

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: `No tasks with status: ${status}` }],
        };
      }

      const lines = result.rows.map(
        t => `[${t.priority}] ${t.title} (${t.id?.substring(0, 8)}) - ${t.status}`
      );

      return {
        content: [
          {
            type: 'text',
            text: `## Tasks (${status})\n\n${lines.join('\n')}`,
          },
        ],
      };
    }

    if (name === 'get_inter_review_stats') {
      const database = getDb();

      const statsResult = await database.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          AVG(overall_score) FILTER (WHERE overall_score IS NOT NULL) as avg_score
        FROM inter_reviews
        WHERE requested_at > NOW() - INTERVAL '7 days'
      `);

      const recentResult = await database.query(`
        SELECT id, summary, overall_score, status, requested_at
        FROM inter_reviews
        ORDER BY requested_at DESC
        LIMIT 5
      `);

      const stats = statsResult.rows[0];
      const lines = [
        `## Inter-Review Stats (7 days)`,
        `**Completed:** ${stats?.completed ?? 0}`,
        `**Pending:** ${stats?.pending ?? 0}`,
        `**Failed:** ${stats?.failed ?? 0}`,
      ];

      if (stats?.avg_score) {
        lines.push(`**Avg Score:** ${Number(stats.avg_score).toFixed(1)}`);
      }

      lines.push('\n## Recent Reviews');
      for (const r of recentResult.rows) {
        const summary = r.summary?.substring(0, 40) || r.id?.substring(0, 8);
        lines.push(`[${r.status}] ${summary} - Score: ${r.overall_score ?? 'N/A'}`);
      }

      lines.push('\n## Recent Reviews');
      for (const r of recentResult.rows) {
        lines.push(
          `[${r.status}] ${r.title?.substring(0, 40) || r.id?.substring(0, 8)} - Score: ${r.overall_score ?? 'N/A'}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n'),
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
