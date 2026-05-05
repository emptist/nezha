import { DatabaseClient } from '../db/DatabaseClient.js';
import { TASK_STATUS } from '../config/constants.js';
import { colors, cli } from '../utils/cli.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import { resolveMeetingId, resolveAgentId } from '../utils/resolve-id.js';

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

export function parseKeyPoints(input: string): string[] {
  return input
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^[-*\d.]+\s*/, ''));
}

interface Meeting {
  id: string;
  topic: string;
  status: string;
  created_by: string;
  created_at: Date;
  consensus: string | null;
  consensus_at: Date | null;
}

interface MeetingOpinion {
  id: string;
  meeting_id: string;
  author: string;
  perspective: string;
  reasoning: string | null;
  position: string | null;
  created_at: Date;
}

export class MeetingDbCommands {
  constructor(protected db: DatabaseClient) {}

  private async resolveAgentNames(agentIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (agentIds.length === 0) return map;
    const uniqueIds = [...new Set(agentIds)];
    const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await this.db.query<{ id: string; display_name: string | null }>(
      `SELECT id, display_name FROM agent_identities WHERE id IN (${placeholders})`,
      uniqueIds
    );
    for (const id of uniqueIds) {
      const row = result.rows.find(r => r.id === id);
      if (row?.display_name) {
        map.set(id, row.display_name);
      } else if (id.startsWith('S-TRAE-')) {
        const parts = id.split('-');
        const project = parts[2];
        map.set(id, project ? `TRAE-${project}` : 'TRAE');
      } else if (id.startsWith('S-nezha-')) {
        map.set(id, 'nezha');
      } else if (id.startsWith('Big-Pickle')) {
        map.set(id, 'Big-Pickle');
      } else if (id.startsWith('S-')) {
        const project = id.split('-')[1];
        map.set(id, project || id.slice(0, 8));
      } else if (id.startsWith('bot_')) {
        map.set(id, 'bot');
      } else {
        map.set(id, id.slice(0, 8));
      }
    }
    return map;
  }

  async list(options?: { status?: string; limit?: number }): Promise<void> {
    const limit = options?.limit || 20;
    let sql = `SELECT * FROM meetings WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;

    if (options?.status && options.status !== 'all') {
      sql += ` AND status = $${idx++}`;
      params.push(options.status);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await this.db.query<Meeting>(sql, params);

    if (result.rows.length === 0) {
      console.log(`${colors.yellow}No meetings found${colors.reset}`);
      return;
    }

    const creatorIds = result.rows.map(m => m.created_by);
    const nameMap = await this.resolveAgentNames(creatorIds);

    console.log(`\n${colors.bright}Meetings (${result.rows.length}):${colors.reset}\n`);

    for (const meeting of result.rows) {
      const statusIcon =
        meeting.status === 'active'
          ? '🟢'
          : meeting.status === 'completed'
            ? '✅'
            : meeting.status === 'archived'
              ? '📦'
              : '❌';
      const creatorName = nameMap.get(meeting.created_by) || meeting.created_by.slice(0, 8);
      const consensusTag = meeting.consensus ? ' 📋' : '';
      console.log(`${statusIcon} [${meeting.status.padEnd(10)}] ${meeting.topic}${consensusTag}`);
      console.log(
        `   ${colors.gray}#${meeting.id.slice(0, 8)} | ${creatorName} | ${meeting.created_at}${colors.reset}`
      );
    }
    console.log();
  }

  async show(id: string): Promise<void> {
    const resolvedId = await resolveMeetingId(this.db, id);
    const meetingId = resolvedId || id;
    
    const meetingResult = await this.db.query<Meeting>(`SELECT * FROM meetings WHERE id = $1`, [
      meetingId,
    ]);

    if (meetingResult.rows.length === 0) {
      console.log(`${colors.red}Meeting not found${colors.reset}`);
      return;
    }

    const meeting = meetingResult.rows[0]!;
    const opinionsResult = await this.db.query<MeetingOpinion>(
      `SELECT * FROM meeting_opinions WHERE meeting_id = $1 ORDER BY created_at`,
      [id]
    );

    console.log(`\n${colors.bright}Meeting Details${colors.reset}\n`);
    console.log(`${colors.cyan}Topic:${colors.reset} ${meeting.topic}`);
    console.log(`${colors.cyan}Status:${colors.reset} ${meeting.status}`);
    const creatorName = (await this.resolveAgentNames([meeting.created_by])).get(meeting.created_by) || meeting.created_by.slice(0, 8);
    console.log(
      `${colors.cyan}Created by:${colors.reset} ${creatorName} at ${meeting.created_at}`
    );

    if (meeting.consensus) {
      console.log(`\n${colors.green}Consensus:${colors.reset}`);
      console.log(`  ${meeting.consensus}`);
      console.log(`${colors.gray}Reached at: ${meeting.consensus_at}${colors.reset}`);
    }

    if (opinionsResult.rows.length > 0) {
      const authorIds = opinionsResult.rows.map(o => o.author);
      const authorMap = await this.resolveAgentNames(authorIds);
      console.log(`\n${colors.cyan}Opinions (${opinionsResult.rows.length}):${colors.reset}`);
      for (const opinion of opinionsResult.rows) {
        const posIcon =
          opinion.position === 'support' ? '👍' : opinion.position === 'oppose' ? '👎' : '➖';
        const authorName = authorMap.get(opinion.author) || opinion.author.slice(0, 8);
        console.log(`\n  ${posIcon} ${colors.bright}${authorName}${colors.reset}`);
        console.log(`     ${opinion.perspective}`);
        if (opinion.reasoning) {
          console.log(`     ${colors.gray}Reasoning: ${opinion.reasoning}${colors.reset}`);
        }
      }
    }
    console.log();
  }

  async complete(id: string, consensus?: string): Promise<void> {
    const resolvedId = await resolveMeetingId(this.db, id);
    const meetingId = resolvedId || id;

    const existing = await this.db.query<Meeting>(
      `SELECT status FROM meetings WHERE id = $1`,
      [meetingId]
    );

    if (existing.rows.length === 0) {
      console.log(`${colors.red}Meeting not found${colors.reset}`);
      return;
    }

    if (existing.rows[0]!.status === 'completed') {
      console.log(`${colors.yellow}Meeting already completed${colors.reset}`);
      return;
    }

    const consensusText = consensus || `Completed at ${new Date().toISOString()}`;

    await this.db.query(
      `UPDATE meetings SET status = 'completed', consensus = $1, consensus_at = NOW() WHERE id = $2`,
      [consensusText, meetingId]
    );

    console.log(`${colors.green}Meeting completed${colors.reset}`);
  }

  async cleanup(daysOld = 5): Promise<number> {
    const result = await this.db.query(
      `UPDATE meetings SET status = 'completed', consensus = $1, consensus_at = NOW() 
       WHERE status = 'active' AND created_at < NOW() - INTERVAL '1 day' * $2
       RETURNING id, topic`,
      [`Auto-completed: inactive for ${daysOld}+ days`, daysOld]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      console.log(`${colors.yellow}Marked ${count} old meeting(s) as completed${colors.reset}`);
    } else {
      console.log(`${colors.green}No old meetings to clean up${colors.reset}`);
    }
    return count;
  }

  async archive(daysOld = 30): Promise<number> {
    const result = await this.db.query(
      `UPDATE meetings SET status = 'archived', consensus = $1, consensus_at = NOW() 
       WHERE status = 'completed' AND created_at < NOW() - INTERVAL '1 day' * $2
       RETURNING id, topic`,
      [`Archived: older than ${daysOld} days`, daysOld]
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      console.log(`${colors.yellow}Archived ${count} old meeting(s)${colors.reset}`);
    } else {
      console.log(`${colors.green}No old completed meetings to archive${colors.reset}`);
    }
    return count;
  }

  async create(topic: string): Promise<string> {
    const agentId = (await AgentIdentityService.getResolvedIdentity()).id;
    const id = crypto.randomUUID();

    await this.db.query(`INSERT INTO meetings (id, topic, created_by) VALUES ($1, $2, $3)`, [
      id,
      topic,
      agentId,
    ]);

    console.log(`${colors.green}Created meeting: ${topic}${colors.reset}`);
    console.log(`  ID: ${id.slice(0, 8)}`);
    return id;
  }

  async addOpinion(
    meetingId: string,
    author: string,
    perspective: string,
    reasoning?: string,
    position?: 'support' | 'oppose' | 'neutral'
  ): Promise<void> {
    if (!author || author.trim().length === 0) {
      throw new Error('Author is required');
    }
    if (author.trim().length > 100) {
      throw new Error('Author must be 100 characters or less');
    }
    if (!perspective || perspective.trim().length === 0) {
      throw new Error('Perspective is required');
    }
    if (perspective.trim().length > 5000) {
      throw new Error('Perspective must be 5000 characters or less');
    }

    const exists = await this.db.query(`SELECT id FROM meetings WHERE id = $1`, [meetingId]);
    if (exists.rows.length === 0) {
      throw new Error(`Meeting ${meetingId} does not exist`);
    }

    await this.db.query(
      `INSERT INTO meeting_opinions (meeting_id, author, perspective, reasoning, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [meetingId, author.trim(), perspective.trim(), reasoning?.trim() || null, position || null]
    );

    console.log(`${colors.green}Added opinion to meeting #${meetingId.slice(0, 8)}${colors.reset}`);
  }

  async consensus(meetingId: string, consensusText: string): Promise<void> {
    await this.db.query(
      `UPDATE meetings 
       SET consensus = $2, consensus_at = NOW(), status = 'completed'
       WHERE id = $1 AND status = 'active'`,
      [meetingId, consensusText]
    );

    console.log(
      `${colors.green}Consensus reached for meeting #${meetingId.slice(0, 8)}${colors.reset}`
    );
  }

  async cancel(meetingId: string): Promise<void> {
    await this.db.query(`UPDATE meetings SET status = 'cancelled' WHERE id = $1`, [meetingId]);

    console.log(`${colors.yellow}Cancelled meeting #${meetingId.slice(0, 8)}${colors.reset}`);
  }

  async stats(): Promise<void> {
    const total = await this.db.query<{ count: bigint }>(`SELECT COUNT(*) as count FROM meetings`);
    const byStatus = await this.db.query<{ status: string; count: bigint }>(
      `SELECT status, COUNT(*) as count FROM meetings GROUP BY status`
    );
    const withConsensus = await this.db.query<{ count: bigint }>(
      `SELECT COUNT(*) as count FROM meetings WHERE consensus IS NOT NULL`
    );

    console.log(`\n${colors.bright}Meeting Statistics${colors.reset}\n`);
    console.log(`${colors.cyan}Total meetings:${colors.reset} ${total.rows[0]?.count || 0}`);
    console.log(
      `${colors.cyan}With consensus:${colors.reset} ${withConsensus.rows[0]?.count || 0}`
    );

    console.log(`\n${colors.cyan}By Status:${colors.reset}`);
    for (const row of byStatus.rows) {
      console.log(`  • ${row.status}: ${row.count}`);
    }
    console.log();
  }
}

export class MeetingCommands extends MeetingDbCommands {
  constructor(config: MeetingConfig) {
    super(config.db);
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
    const createdBy = (await AgentIdentityService.getResolvedIdentity()).id;

    try {
      await this.db.query('BEGIN');

      await this.db.query(
        `INSERT INTO tasks (id, title, description, status, priority, category, created_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          discussionId,
          `Discussion: ${title}`,
          fullDescription,
          TASK_STATUS.PENDING,
          priority,
          'collaboration',
          createdBy,
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
          { type: 'discussion', participants },
        ]
      );

      await this.db.query(
        `INSERT INTO meetings (id, topic, status, created_by, metadata)
         VALUES ($1, $2, 'active', $3, $4)`,
        [discussionId, title, createdBy, { description, participants }]
      );

      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }

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

    const createdBy = (await AgentIdentityService.getResolvedIdentity()).id;
    await this.db.query(
      `INSERT INTO tasks (id, title, description, status, priority, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        consensusId,
        `Consensus: ${topic}`,
        consensusContent,
        TASK_STATUS.PENDING,
        10,
        'collaboration',
        createdBy,
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
