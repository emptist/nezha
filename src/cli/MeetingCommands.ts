import { DatabaseClient } from '../db/DatabaseClient.js';
import { TASK_STATUS } from '../config/constants.js';
import { colors, cli } from '../utils/cli.js';

export interface MeetingConfig {
  db: DatabaseClient;
}

export interface Opinion {
  id: string;
  author: string;
  perspective: string;
  keyPoints: string[];
  reasoning: string;
  concerns: string[];
  suggestions: string[];
  timestamp: Date;
}

export interface Consensus {
  topic: string;
  participants: string[];
  agreedPoints: string[];
  decision: string;
  nextSteps: string[];
  timestamp: Date;
}

export class MeetingCommands {
  private readonly db: DatabaseClient;

  constructor(config: MeetingConfig) {
    this.db = config.db;
  }

  async createDiscussion(
    title: string,
    description: string,
    participants?: string[],
    priority: number = 5
  ): Promise<void> {
    const fullDescription = `## AI Discussion

### Topic
${title}

### Context
${description}

### Participation
${
  participants && participants.length > 0
    ? `Participants: ${participants.join(', ')}`
    : 'All AI agents are invited to participate.'
}

### Discussion Format
Please follow the meeting-protocol skill:

1. **Join the Discussion** - Read the topic and form your opinion
2. **Express Your Opinion** - Use this format:
\`\`\`markdown
## Opinion from [Your AI ID]

**Perspective**: [Your unique viewpoint]

**Key Points**:
1. [Point 1]
2. [Point 2]
3. [Point 3]

**Reasoning**: [Why you think this way]

**Concerns**: [Any concerns or risks]

**Suggestions**: [Concrete suggestions]
\`\`\`
3. **Respond to Others** - Build upon previous ideas, find consensus
4. **Reach Consensus** - Document agreement when reached`;

    const discussionId = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO tasks (id, title, description, status, priority, type, category) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        discussionId,
        `Discussion: ${title}`,
        fullDescription,
        TASK_STATUS.PENDING,
        priority,
        'discussion',
        'collaboration',
      ]
    );

    await this.db.query(
      `INSERT INTO task_audit_log (task_id, task_title, previous_status, new_status, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        discussionId,
        `Discussion: ${title}`,
        null,
        TASK_STATUS.PENDING,
        'Discussion created',
        JSON.stringify({ type: 'discussion', participants }),
      ]
    );

    cli.success(`Discussion created: "${title}"`);
    console.log(`   ID: ${discussionId}`);
    if (participants && participants.length > 0) {
      console.log(`   Participants: ${participants.join(', ')}`);
    }
    console.log('');
  }

  async listDiscussions(status?: string): Promise<void> {
    let query = `
      SELECT id, title, status, priority, category, created_at, completed_at
      FROM tasks
      WHERE type = 'discussion' OR title LIKE 'Discussion:%' OR title LIKE 'Consensus:%'
    `;
    const params: (string | number)[] = [];

    if (status) {
      query += ` AND status = $1`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await this.db.query<{
      id: string;
      title: string;
      status: string;
      priority: number;
      category: string;
      created_at: Date;
      completed_at: Date | null;
    }>(query, params);

    if (result.rows.length === 0) {
      cli.info('No discussions found');
      return;
    }

    console.log(`\n${colors.bright}AI Discussions:${colors.reset}\n`);
    cli.table(
      ['Status', 'Priority', 'Title', 'Created'],
      result.rows.map(row => [
        row.status,
        row.priority.toString(),
        row.title.substring(0, 40) + (row.title.length > 40 ? '...' : ''),
        new Date(row.created_at).toLocaleDateString(),
      ])
    );
    console.log('');
  }

  async showDiscussion(id?: string): Promise<void> {
    let query = `
      SELECT id, title, description, status, priority, category, created_at, completed_at
      FROM tasks
      WHERE (type = 'discussion' OR title LIKE 'Discussion:%' OR title LIKE 'Consensus:%')
    `;
    const params: string[] = [];

    if (id) {
      query += ` AND id = $1`;
      params.push(id);
    }

    query += ` ORDER BY created_at DESC LIMIT 1`;

    const result = await this.db.query<{
      id: string;
      title: string;
      description: string;
      status: string;
      priority: number;
      category: string;
      created_at: Date;
      completed_at: Date | null;
    }>(query, params);

    if (result.rows.length === 0) {
      cli.error(`Discussion not found: ${id || 'no recent discussions'}`);
      return;
    }

    const discussion = result.rows[0]!;
    console.log(`\n${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}${discussion.title}${colors.reset}`);
    console.log(`   Status: ${discussion.status}`);
    console.log(`   Priority: ${discussion.priority}`);
    console.log(`   Created: ${new Date(discussion.created_at).toLocaleString()}`);
    console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

    if (discussion.description.length > 200) {
      console.log(discussion.description.substring(0, 200) + '...\n');
    } else {
      console.log(discussion.description + '\n');
    }
  }

  async addOpinion(
    discussionId: string,
    author: string,
    perspective: string,
    keyPoints: string[],
    reasoning: string,
    concerns: string[],
    suggestions: string[]
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO memory (content, project_id, metadata, importance)
       VALUES ($1, $2, $3, $4)`,
      [
        `## Opinion from ${author}

**Perspective**: ${perspective}

**Key Points**:
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

**Reasoning**: ${reasoning}

**Concerns**:
${concerns.length > 0 ? concerns.map(c => `- ${c}`).join('\n') : 'None'}

**Suggestions**:
${suggestions.length > 0 ? suggestions.map(s => `- ${s}`).join('\n') : 'None'}

_Recorded for discussion: ${discussionId}_`,
        null,
        JSON.stringify({ type: 'opinion', discussionId, author }),
        7,
      ]
    );

    cli.success(`Opinion recorded from ${author}`);
    console.log('');
  }

  async reachConsensus(
    topic: string,
    participants: string[],
    agreedPoints: string[],
    decision: string,
    nextSteps: string[]
  ): Promise<void> {
    const consensusId = crypto.randomUUID();
    const consensusContent = `## Consensus Reached

**Topic**: ${topic}

**Participants**: ${participants.join(', ')}

**Agreed Points**:
${agreedPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

**Decision**: ${decision}

**Next Steps**:
${nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

_Reached at: ${new Date().toISOString()}_`;

    await this.db.query(
      `INSERT INTO memory (content, project_id, metadata, importance)
       VALUES ($1, $2, $3, $4)`,
      [consensusContent, null, JSON.stringify({ type: 'consensus', topic, participants }), 9]
    );

    await this.db.query(
      `INSERT INTO tasks (id, title, description, status, priority, type, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        consensusId,
        `Consensus: ${topic}`,
        consensusContent,
        TASK_STATUS.PENDING,
        10,
        'decision',
        'collaboration',
      ]
    );

    cli.success(`Consensus reached on: "${topic}"`);
    console.log(`   Participants: ${participants.join(', ')}`);
    console.log(`   Decision: ${decision}`);
    console.log('');
  }

  async listConsensus(limit: number = 20): Promise<void> {
    const result = await this.db.query<{
      id: string;
      content: string;
      created_at: Date;
    }>(
      `SELECT id, content, created_at FROM memory
       WHERE metadata->>'type' = 'consensus'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    if (result.rows.length === 0) {
      cli.info('No consensus reached yet');
      return;
    }

    console.log(`\n${colors.bright}AI Consensus History:${colors.reset}\n`);
    for (const row of result.rows) {
      const topicMatch = row.content.match(/\*\*Topic\*\*: (.+)/);
      const decisionMatch = row.content.match(/\*\*Decision\*\*: (.+)/);
      const topic = topicMatch ? topicMatch[1] : 'Unknown';
      const decision = decisionMatch
        ? (decisionMatch[1] ?? 'No decision recorded')
        : 'No decision recorded';

      console.log(
        `${colors.cyan}${new Date(row.created_at).toLocaleDateString()}${colors.reset} | ${topic}`
      );
      console.log(`   ${colors.dim}${decision.substring(0, 60)}${colors.reset}`);
      console.log('');
    }
  }
}

export function parseKeyPoints(input: string): string[] {
  return input
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^[-*\d.]+\s*/, ''));
}
