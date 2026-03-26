import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';

const server = new Server({ name: 'areflect', version: '1.0.0' }, { capabilities: { tools: {} } });

let db: DatabaseClient | null = null;

function getDb(): DatabaseClient {
  if (!db) {
    db = new DatabaseClient(Config.getInstance());
  }
  return db;
}

const LEARN_PATTERN = /\[LEARN\]\s*insight:\s*(.+?)(?:\s*context:\s*(.+?))?\s*(?=\[|$)/gis;
const PROMPT_PATTERN =
  /\[PROMPT_UPDATE\]\s*current:\s*(.+?)\s*suggested:\s*(.+?)\s*reason:\s*(.+?)\s*(?=\[|$)/gis;
const ISSUE_PATTERN =
  /\[ISSUE\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*type:\s*(\w+))?(?:\s*severity:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;
const TASK_PATTERN =
  /\[TASK\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*priority:\s*(\d+))?(?:\s*type:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;
const ANNOUNCE_PATTERN =
  /\[ANNOUNCE\]\s*message:\s*(.+?)(?:\s*priority:\s*(low|normal|high|critical))?(?:\s*to:\s*(.+?))?\s*(?=\[|$)/gis;
const SCHEDULE_PATTERN =
  /\[SCHEDULE\]\s*title:\s*(.+?)(?:\s*cron:\s*(.+?))?(?:\s*description:\s*(.+?))?(?:\s*priority:\s*(\d+))?\s*(?=\[|$)/gis;
const ISSUE_RESOLVE_PATTERN =
  /\[ISSUE_RESOLVE\]\s*id:\s*([a-f0-9-]+)\s+resolution:\s*(.+?)\s*(?=\[|$)/gis;
const TASK_COMPLETE_PATTERN =
  /\[TASK_COMPLETE\]\s*id:\s*([a-f0-9-]+)(?:\s+result:\s*(.+?))?\s*(?=\[|$)/gis;
const ISSUE_COMMENT_PATTERN =
  /\[ISSUE_COMMENT\]\s*id:\s*([a-f0-9-]+)\s+comment:\s*(.+?)(?:\s+internal:\s*(true|false))?\s*(?=\[|$)/gis;

interface ReflectResult {
  learnings: number;
  promptUpdates: number;
  issues: number;
  issuesResolved: number;
  issueComments: number;
  tasks: number;
  tasksCompleted: number;
  reviewResponses: number;
  announces: number;
  schedules: number;
  total: number;
}

async function reflect(text: string): Promise<ReflectResult> {
  const result: ReflectResult = {
    learnings: 0,
    promptUpdates: 0,
    issues: 0,
    issuesResolved: 0,
    issueComments: 0,
    tasks: 0,
    tasksCompleted: 0,
    reviewResponses: 0,
    announces: 0,
    schedules: 0,
    total: 0,
  };

  const database = getDb();
  const identity = await AgentIdentityService.getResolvedIdentity();
  const author = identity.id;

  let match;
  while ((match = LEARN_PATTERN.exec(text)) !== null) {
    const insight = match[1]?.trim();
    const context = match[2]?.trim();
    if (insight) {
      await database.query(
        `INSERT INTO memory (content, tags, source, importance, metadata) 
         VALUES ($1, ARRAY['learning', 'reflection'], 'areflect-mcp', $2, $3)`,
        [insight, 7, JSON.stringify({ context, source: 'areflect-mcp', author })]
      );
      result.learnings++;
    }
  }

  while ((match = PROMPT_PATTERN.exec(text)) !== null) {
    const current = match[1]?.trim();
    const suggested = match[2]?.trim();
    const reason = match[3]?.trim();
    if (current && suggested) {
      await database.query(
        `INSERT INTO prompt_suggestions (id, current_prompt, suggested_prompt, reason, status)
         VALUES (gen_random_uuid(), $1, $2, $3, 'pending')`,
        [current, suggested, reason]
      );
      result.promptUpdates++;
    }
  }

  while ((match = ISSUE_PATTERN.exec(text)) !== null) {
    const title = match[1]?.trim();
    const description = match[2]?.trim();
    const issueType = match[3]?.trim() || 'bug';
    const severity = match[4]?.trim() || 'medium';
    const tagsStr = match[5]?.trim();
    const tags = tagsStr ? tagsStr.split(',').map((t: string) => t.trim()) : [];
    if (title) {
      await database.query(
        `INSERT INTO issues (title, description, issue_type, severity, tags, discovered_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [title, description, issueType, severity, tags, author]
      );
      result.issues++;
    }
  }

  while ((match = TASK_PATTERN.exec(text)) !== null) {
    const title = match[1]?.trim();
    const description = match[2]?.trim();
    const priorityStr = match[3]?.trim();
    const taskType = match[4]?.trim() || 'implementation';
    const tagsStr = match[5]?.trim();
    const tags = tagsStr ? tagsStr.split(',').map((t: string) => t.trim()) : [];
    const priority = priorityStr ? Math.min(10, Math.max(1, parseInt(priorityStr, 10) || 5)) : 5;
    if (title) {
      await database.query(
        `INSERT INTO tasks (title, description, priority, type, tags, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
        [title, description, priority, taskType, tags, author]
      );
      result.tasks++;
    }
  }

  while ((match = ANNOUNCE_PATTERN.exec(text)) !== null) {
    const message = match[1]?.trim();
    const priority = match[2]?.trim() || 'normal';
    const targetAgent = match[3]?.trim() || null;
    if (message) {
      await database.query(
        `INSERT INTO project_communications (from_ai, to_ai, message_type, content, priority)
         VALUES ($1, $2, 'broadcast', $3, $4)`,
        [author, targetAgent, message, priority]
      );
      result.announces++;
    }
  }

  while ((match = SCHEDULE_PATTERN.exec(text)) !== null) {
    const title = match[1]?.trim();
    const cron = match[2]?.trim();
    const description = match[3]?.trim() || null;
    const priorityStr = match[4]?.trim();
    const priority = priorityStr ? Math.min(10, Math.max(1, parseInt(priorityStr, 10) || 5)) : 5;
    if (title && cron) {
      const { Cron } = await import('croner');
      const cronJob = new Cron(cron, { timezone: 'UTC' });
      const nextRun = cronJob.nextRun() || new Date(Date.now() + 3600000);
      await database.query(
        `INSERT INTO scheduled_tasks (name, description, cron_expression, priority, enabled, next_run)
         VALUES ($1, $2, $3, $4, true, $5)`,
        [title, description, cron, priority, nextRun]
      );
      result.schedules++;
    }
  }

  while ((match = ISSUE_RESOLVE_PATTERN.exec(text)) !== null) {
    const id = match[1]?.trim();
    const resolution = match[2]?.trim();
    if (id && resolution) {
      const resultCheck = await database.query<{ title: string }>(
        `SELECT title FROM issues WHERE id = $1 AND status != 'resolved'`,
        [id]
      );
      if (resultCheck.rows.length > 0) {
        await database.query(
          `UPDATE issues 
           SET status = 'resolved', resolution = $2, resolved_at = NOW(), resolved_by = $3
           WHERE id = $1`,
          [id, resolution, author]
        );
        result.issuesResolved++;
      }
    }
  }

  while ((match = TASK_COMPLETE_PATTERN.exec(text)) !== null) {
    const id = match[1]?.trim();
    const taskResult = match[2]?.trim();
    if (id) {
      const resultCheck = await database.query<{ title: string }>(
        `SELECT title FROM tasks WHERE id = $1 AND status NOT IN ('COMPLETED', 'FAILED')`,
        [id]
      );
      if (resultCheck.rows.length > 0) {
        await database.query(
          `UPDATE tasks 
           SET status = 'COMPLETED', result = $2, completed_at = NOW()
           WHERE id = $1`,
          [id, taskResult ? JSON.stringify({ message: taskResult }) : null]
        );
        result.tasksCompleted++;
      }
    }
  }

  while ((match = ISSUE_COMMENT_PATTERN.exec(text)) !== null) {
    const id = match[1]?.trim();
    const comment = match[2]?.trim();
    const internalStr = match[3]?.trim();
    if (id && comment) {
      const resultCheck = await database.query<{ title: string }>(
        `SELECT title FROM issues WHERE id = $1`,
        [id]
      );
      if (resultCheck.rows.length > 0) {
        await database.query(
          `INSERT INTO issue_comments (issue_id, author, content, is_internal)
           VALUES ($1, $2, $3, $4)`,
          [id, author, comment, internalStr === 'true']
        );
        result.issueComments++;
      }
    }
  }

  result.total =
    result.learnings +
    result.promptUpdates +
    result.issues +
    result.issuesResolved +
    result.issueComments +
    result.tasks +
    result.tasksCompleted +
    result.reviewResponses +
    result.announces +
    result.schedules;

  return result;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'reflect',
        description:
          'Parse and save reflection markers from text. Supports: LEARN, PROMPT_UPDATE, ISSUE, TASK, ANNOUNCE, SCHEDULE, ISSUE_RESOLVE, TASK_COMPLETE, ISSUE_COMMENT',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                'Text containing reflection markers. Example: "[LEARN] insight: Check git log first [TASK] title: Fix bug priority: 8"',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'check_pending_work',
        description: 'Check for pending work: tasks and open issues.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_recent_learnings',
        description: 'Get recent learnings from memory.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of learnings to return (default: 10)',
              default: 10,
            },
          },
        },
      },
      {
        name: 'parse_markers',
        description: 'Parse reflection markers without saving to database. Useful for preview.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text containing reflection markers to parse',
            },
          },
          required: ['text'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'reflect') {
      const { text } = args as { text: string };
      const result = await reflect(text);

      return {
        content: [
          {
            type: 'text',
            text: `Reflection saved:\n- Learnings: ${result.learnings}\n- Prompt Updates: ${result.promptUpdates}\n- Issues Created: ${result.issues}\n- Issues Resolved: ${result.issuesResolved}\n- Tasks Created: ${result.tasks}\n- Tasks Completed: ${result.tasksCompleted}\n- Broadcasts: ${result.announces}\n- Schedules: ${result.schedules}\n- Total: ${result.total}`,
          },
        ],
      };
    }

    if (name === 'check_pending_work') {
      const database = getDb();
      const tasksResult = await database.query<{ count: string }>(
        `SELECT COUNT(*) FROM tasks WHERE status = 'PENDING'`
      );
      const issuesResult = await database.query<{ count: string }>(
        `SELECT COUNT(*) FROM issues WHERE status = 'open'`
      );
      const tasks = parseInt(tasksResult.rows[0]?.count || '0', 10);
      const issues = parseInt(issuesResult.rows[0]?.count || '0', 10);

      return {
        content: [
          {
            type: 'text',
            text: `Pending Work:\n- Tasks: ${tasks}\n- Open Issues: ${issues}\n- Has Work: ${tasks > 0 || issues > 0 ? 'Yes' : 'No'}`,
          },
        ],
      };
    }

    if (name === 'get_recent_learnings') {
      const { limit = 10 } = args as { limit?: number };
      const database = getDb();
      const result = await database.query<{ content: string; source: string; created_at: Date }>(
        `SELECT content, source, created_at 
         FROM memory 
         WHERE 'learning' = ANY(tags) 
         ORDER BY created_at DESC 
         LIMIT $1`,
        [limit]
      );

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: 'No learnings found.' }],
        };
      }

      const formatted = result.rows
        .map(
          (l: { content: string; source: string }, i: number) =>
            `${i + 1}. [${l.source}] ${l.content.substring(0, 100)}...`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Recent Learnings (${result.rows.length}):\n${formatted}`,
          },
        ],
      };
    }

    if (name === 'parse_markers') {
      const { text } = args as { text: string };

      const markers = {
        learn: [] as { insight?: string; context?: string }[],
        issue: [] as { title?: string; description?: string; type?: string; severity?: string }[],
        task: [] as { title?: string; description?: string; priority?: string; type?: string }[],
        announce: [] as { message?: string }[],
        schedule: [] as { title?: string }[],
      };

      let match;
      while ((match = LEARN_PATTERN.exec(text)) !== null) {
        markers.learn.push({ insight: match[1]?.trim(), context: match[2]?.trim() });
      }
      LEARN_PATTERN.lastIndex = 0;

      while ((match = ISSUE_PATTERN.exec(text)) !== null) {
        markers.issue.push({
          title: match[1]?.trim(),
          description: match[2]?.trim(),
          type: match[3]?.trim(),
          severity: match[4]?.trim(),
        });
      }
      ISSUE_PATTERN.lastIndex = 0;

      while ((match = TASK_PATTERN.exec(text)) !== null) {
        markers.task.push({
          title: match[1]?.trim(),
          description: match[2]?.trim(),
          priority: match[3]?.trim(),
          type: match[4]?.trim(),
        });
      }
      TASK_PATTERN.lastIndex = 0;

      return {
        content: [
          {
            type: 'text',
            text: `Parsed Markers:\n${JSON.stringify(markers, null, 2)}`,
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
  console.error('Areflect MCP Server running...');
}

main().catch(console.error);
