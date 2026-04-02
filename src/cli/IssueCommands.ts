import { DatabaseClient } from '../db/DatabaseClient.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';

const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

interface Issue {
  id: string;
  title: string;
  description: string;
  issue_type: string;
  severity: string;
  status: string;
  discovered_by: string;
  discovered_at: Date;
  resolution: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

export class IssueCommands {
  constructor(private db: DatabaseClient) {}

  async list(options?: { status?: string; severity?: string; limit?: number }): Promise<void> {
    const limit = options?.limit || 50;
    let sql = `SELECT * FROM issues WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;

    if (options?.status && options.status !== 'all') {
      sql += ` AND status = $${idx++}`;
      params.push(options.status);
    }

    if (options?.severity) {
      sql += ` AND severity = $${idx++}`;
      params.push(options.severity);
    }

    sql += ` ORDER BY 
      CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT $${idx}`;
    params.push(limit);

    const result = await this.db.query<Issue>(sql, params);

    if (result.rows.length === 0) {
      console.log(`${C.yellow}No issues found${C.reset}`);
      return;
    }

    console.log(`\n${C.bright}Found ${result.rows.length} issue(s):${C.reset}\n`);

    for (const issue of result.rows) {
      const statusIcon = issue.status === 'open' ? '⚠️' : '✅';
      const severityColor =
        issue.severity === 'critical' ? C.red : issue.severity === 'high' ? C.yellow : C.gray;
      console.log(
        `${statusIcon} [${issue.status.padEnd(8)}] ${severityColor}${issue.severity.padEnd(8)}${C.reset} ${issue.title}`
      );
      console.log(
        `   ${C.gray}#${issue.id.slice(0, 8)} | ${issue.issue_type} | ${issue.discovered_by}${C.reset}`
      );
      if (issue.tags.length > 0) {
        console.log(`   ${C.cyan}Tags:${C.reset} ${issue.tags.join(', ')}`);
      }
      console.log();
    }
  }

  async show(id: string): Promise<void> {
    const result = await this.db.query<Issue>(`SELECT * FROM issues WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      console.log(`${C.red}Issue not found: ${id}${C.reset}`);
      return;
    }

    const issue = result.rows[0]!;

    console.log(`\n${C.bright}Issue Details${C.reset}\n`);
    console.log(`${C.cyan}ID:${C.reset}      ${issue.id}`);
    console.log(`${C.cyan}Title:${C.reset}   ${issue.title}`);
    console.log(`${C.cyan}Status:${C.reset}  ${issue.status}`);
    console.log(`${C.cyan}Severity:${C.reset} ${issue.severity}`);
    console.log(`${C.cyan}Type:${C.reset}    ${issue.issue_type}`);
    console.log(`${C.cyan}Discovered:${C.reset} ${issue.discovered_by} at ${issue.discovered_at}`);
    console.log(`\n${C.cyan}Description:${C.reset}`);
    console.log(`  ${issue.description || '(none)'}`);

    if (issue.resolution) {
      console.log(`\n${C.green}Resolution:${C.reset} ${issue.resolution}`);
      console.log(`${C.cyan}Resolved by:${C.reset} ${issue.resolved_by} at ${issue.resolved_at}`);
    }

    if (issue.tags.length > 0) {
      console.log(`\n${C.cyan}Tags:${C.reset} ${issue.tags.join(', ')}`);
    }

    console.log();
  }

  async create(
    title: string,
    description: string,
    options?: {
      type?: string;
      severity?: string;
      tags?: string[];
    }
  ): Promise<string> {
    const agentId = (await AgentIdentityService.getResolvedIdentity()).id;
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO issues (id, title, description, issue_type, severity, status, discovered_by, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, '{}')`,
      [
        id,
        title,
        description,
        options?.type || 'improvement',
        options?.severity || 'medium',
        agentId,
        options?.tags || [],
      ]
    );

    console.log(`${C.green}Created issue #${id.slice(0, 8)}: ${title}${C.reset}`);
    return id;
  }

  async resolve(id: string, notes?: string): Promise<void> {
    const agentId = (await AgentIdentityService.getResolvedIdentity()).id;

    const result = await this.db.query<{ title: string }>(
      `SELECT title FROM issues WHERE id = $1 AND status = 'open'`,
      [id]
    );

    if (result.rows.length === 0) {
      console.log(`${C.yellow}Issue not found or already resolved: ${id}${C.reset}`);
      return;
    }

    await this.db.query(
      `UPDATE issues 
       SET status = 'resolved', resolution = $2, resolved_at = NOW(), resolved_by = $3
       WHERE id = $1`,
      [id, notes || 'Resolved', agentId]
    );

    console.log(`${C.green}Resolved issue: ${result.rows[0]!.title}${C.reset}`);
  }

  async stats(): Promise<void> {
    const total = await this.db.query<{ count: bigint }>(`SELECT COUNT(*) as count FROM issues`);
    const byStatus = await this.db.query<{ status: string; count: bigint }>(
      `SELECT status, COUNT(*) as count FROM issues GROUP BY status`
    );
    const bySeverity = await this.db.query<{ severity: string; count: bigint }>(
      `SELECT severity, COUNT(*) as count FROM issues WHERE status = 'open' GROUP BY severity ORDER BY count DESC`
    );
    const byType = await this.db.query<{ issue_type: string; count: bigint }>(
      `SELECT issue_type, COUNT(*) as count FROM issues GROUP BY issue_type ORDER BY count DESC`
    );

    console.log(`\n${C.bright}Issue Statistics${C.reset}\n`);
    console.log(`${C.cyan}Total issues:${C.reset} ${total.rows[0]?.count || 0}`);

    console.log(`\n${C.cyan}By Status:${C.reset}`);
    for (const row of byStatus.rows) {
      const icon = row.status === 'open' ? '⚠️' : '✅';
      console.log(`  ${icon} ${row.status}: ${row.count}`);
    }

    console.log(`\n${C.cyan}Open by Severity:${C.reset}`);
    for (const row of bySeverity.rows) {
      console.log(`  • ${row.severity}: ${row.count}`);
    }

    console.log(`\n${C.cyan}By Type:${C.reset}`);
    for (const row of byType.rows) {
      console.log(`  • ${row.issue_type}: ${row.count}`);
    }

    console.log();
  }

  async comment(id: string, content: string, options?: { internal?: boolean }): Promise<void> {
    const agentId = (await AgentIdentityService.getResolvedIdentity()).id;

    const issueExists = await this.db.query<{ id: string }>(`SELECT id FROM issues WHERE id = $1`, [
      id,
    ]);

    if (issueExists.rows.length === 0) {
      console.log(`${C.red}Issue not found: ${id}${C.reset}`);
      return;
    }

    await this.db.query(
      `INSERT INTO issue_comments (issue_id, author, content, is_internal)
       VALUES ($1, $2, $3, $4)`,
      [id, agentId, content, options?.internal || false]
    );

    console.log(`${C.green}Added comment to issue #${id.slice(0, 8)}${C.reset}`);
  }

  async comments(id: string): Promise<void> {
    const result = await this.db.query<{
      id: string;
      author: string;
      content: string;
      is_internal: boolean;
      created_at: Date;
    }>(
      `SELECT id, author, content, is_internal, created_at 
       FROM issue_comments 
       WHERE issue_id = $1 
       ORDER BY created_at ASC`,
      [id]
    );

    if (result.rows.length === 0) {
      console.log(`${C.yellow}No comments on this issue${C.reset}`);
      return;
    }

    console.log(`\n${C.bright}Comments (${result.rows.length}):${C.reset}\n`);

    for (const comment of result.rows) {
      const internalTag = comment.is_internal ? ` ${C.yellow}[internal]${C.reset}` : '';
      console.log(`${C.gray}---${C.reset}`);
      console.log(`${C.cyan}${comment.author}${C.reset}${internalTag} at ${comment.created_at}`);
      console.log(`  ${comment.content}`);
    }
    console.log();
  }

  async events(id: string): Promise<void> {
    const result = await this.db.query<{
      event_type: string;
      actor: string;
      old_value: string | null;
      new_value: string | null;
      created_at: Date;
    }>(
      `SELECT event_type, actor, old_value, new_value, created_at 
       FROM issue_events 
       WHERE issue_id = $1 
       ORDER BY created_at ASC`,
      [id]
    );

    if (result.rows.length === 0) {
      console.log(`${C.yellow}No events on this issue${C.reset}`);
      return;
    }

    console.log(`\n${C.bright}Activity (${result.rows.length} events):${C.reset}\n`);

    for (const event of result.rows) {
      const icon = this.eventIcon(event.event_type);
      console.log(
        `${icon} ${C.gray}${event.created_at}${C.reset} ${C.cyan}${event.actor}${C.reset}`
      );
      console.log(`   ${this.eventDescription(event)}`);
    }
    console.log();
  }

  private eventIcon(type: string): string {
    const icons: Record<string, string> = {
      created: '🆕',
      status_changed: '📋',
      closed: '✅',
      reopened: '↩️',
      assigned: '👤',
      unassigned: '👤',
      labeled: '🏷️',
      unlabeled: '🏷️',
      commented: '💬',
    };
    return icons[type] || '•';
  }

  private eventDescription(event: {
    event_type: string;
    old_value: string | null;
    new_value: string | null;
  }): string {
    switch (event.event_type) {
      case 'created':
        return 'created this issue';
      case 'status_changed':
        return `changed status from ${event.old_value} to ${event.new_value}`;
      case 'closed':
        return 'resolved this issue';
      case 'reopened':
        return 'reopened this issue';
      case 'assigned':
        return `assigned to ${event.new_value}`;
      case 'unassigned':
        return `unassigned ${event.old_value}`;
      default:
        return `${event.event_type}: ${event.old_value || ''} → ${event.new_value || ''}`;
    }
  }

  async assign(id: string, assignee: string): Promise<void> {
    await this.db.query(`UPDATE issues SET assignee = $2 WHERE id = $1`, [id, assignee]);

    console.log(`${C.green}Assigned issue #${id.slice(0, 8)} to ${assignee}${C.reset}`);
  }

  async labels(options?: { list?: boolean }): Promise<void> {
    if (options?.list) {
      const result = await this.db.query<{ name: string; color: string; description: string }>(
        `SELECT name, color, description FROM labels ORDER BY name`
      );

      console.log(`\n${C.bright}Available Labels:${C.reset}\n`);
      for (const label of result.rows) {
        console.log(`  ${C.cyan}${label.name.padEnd(15)}${C.reset} ${label.description || ''}`);
      }
      console.log();
    }
  }

  async milestone(title: string, description?: string): Promise<void> {
    const id = crypto.randomUUID();

    await this.db.query(`INSERT INTO milestones (id, title, description) VALUES ($1, $2, $3)`, [
      id,
      title,
      description || '',
    ]);

    console.log(`${C.green}Created milestone: ${title}${C.reset}`);
  }

  async toTask(id: string, priority?: number): Promise<void> {
    const result = await this.db.query<{
      title: string;
      description: string;
      severity: string;
      discovered_by: string;
    }>(`SELECT title, description, severity, discovered_by FROM issues WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      console.log(`${C.red}Issue not found: ${id}${C.reset}`);
      return;
    }

    const issue = result.rows[0]!;
    const taskId = crypto.randomUUID();
    const taskPriority =
      priority ??
      (issue.severity === 'critical'
        ? 9
        : issue.severity === 'high'
          ? 7
          : issue.severity === 'medium'
            ? 5
            : 3);

    await this.db.query(
      `INSERT INTO tasks (id, title, description, status, priority, category, created_by, tags)
       VALUES ($1, $2, $3, 'PENDING', $4, 'issue-resolution', $5, $6)`,
      [
        taskId,
        `[Issue] ${issue.title}`,
        issue.description || `Created from issue ${id}`,
        taskPriority,
        issue.discovered_by,
        ['from-issue', issue.severity],
      ]
    );

    await this.db.query(`UPDATE issues SET status = 'in_progress', task_id = $1 WHERE id = $2`, [
      taskId,
      id,
    ]);

    console.log(`${C.green}Created task from issue #${id.slice(0, 8)}${C.reset}`);
    console.log(`  Task ID: ${taskId.slice(0, 8)}`);
    console.log(`  Priority: ${taskPriority}`);
  }

  async linkReview(id: string, reviewId: string): Promise<void> {
    await this.db.query(`UPDATE issues SET review_id = $2 WHERE id = $1`, [id, reviewId]);
    console.log(
      `${C.green}Linked issue #${id.slice(0, 8)} to review #${reviewId.slice(0, 8)}${C.reset}`
    );
  }

  async listLabels(): Promise<void> {
    const result = await this.db.query(`SELECT * FROM labels ORDER BY name`);
    if (result.rows.length === 0) {
      console.log(`${C.yellow}No labels found${C.reset}`);
      return;
    }
    console.log(`\n${C.bright}Labels:${C.reset}`);
    for (const label of result.rows) {
      console.log(`  ${C.cyan}${label.name}${C.reset} - ${label.description || 'no description'}`);
    }
    console.log();
  }

  async addLabel(issueId: string, labelName: string): Promise<void> {
    const labelResult = await this.db.query<{ id: string }>(
      `SELECT id FROM labels WHERE name = $1`,
      [labelName]
    );
    if (labelResult.rows.length === 0) {
      console.log(`${C.red}Label not found: ${labelName}${C.reset}`);
      return;
    }
    const labelId = labelResult.rows[0]!.id;
    await this.db.query(
      `INSERT INTO issue_labels (issue_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [issueId, labelId]
    );
    console.log(`${C.green}Added label '${labelName}' to issue #${issueId.slice(0, 8)}${C.reset}`);
  }

  async removeLabel(issueId: string, labelName: string): Promise<void> {
    const labelResult = await this.db.query<{ id: string }>(
      `SELECT id FROM labels WHERE name = $1`,
      [labelName]
    );
    if (labelResult.rows.length === 0) return;
    const labelId = labelResult.rows[0]!.id;
    await this.db.query(`DELETE FROM issue_labels WHERE issue_id = $1 AND label_id = $2`, [
      issueId,
      labelId,
    ]);
    console.log(
      `${C.green}Removed label '${labelName}' from issue #${issueId.slice(0, 8)}${C.reset}`
    );
  }

  async listMilestones(): Promise<void> {
    const result = await this.db.query(`SELECT * FROM milestones ORDER BY created_at DESC`);
    if (result.rows.length === 0) {
      console.log(`${C.yellow}No milestones found${C.reset}`);
      return;
    }
    console.log(`\n${C.bright}Milestones:${C.reset}`);
    for (const ms of result.rows) {
      const icon = ms.status === 'open' ? '○' : '●';
      const due = ms.due_date ? ` (due: ${new Date(ms.due_date).toLocaleDateString()})` : '';
      console.log(`  ${icon} ${ms.title}${due}`);
      if (ms.description) console.log(`    ${ms.description}`);
    }
    console.log();
  }

  async createMilestone(title: string, description?: string, dueDate?: string): Promise<void> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO milestones (id, title, description, due_date) VALUES ($1, $2, $3, $4)`,
      [id, title, description || null, dueDate || null]
    );
    console.log(`${C.green}Created milestone: ${title}${C.reset}`);
  }

  async addComment(issueId: string, content: string, author: string): Promise<void> {
    const id = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO issue_comments (id, issue_id, author, content) VALUES ($1, $2, $3, $4)`,
      [id, issueId, author, content]
    );
    console.log(`${C.green}Added comment to issue #${issueId.slice(0, 8)}${C.reset}`);
  }

  async listComments(issueId: string): Promise<void> {
    const result = await this.db.query(
      `SELECT * FROM issue_comments WHERE issue_id = $1 ORDER BY created_at`,
      [issueId]
    );
    if (result.rows.length === 0) {
      console.log(`${C.yellow}No comments on this issue${C.reset}`);
      return;
    }
    console.log(`\n${C.bright}Comments:${C.reset}`);
    for (const comment of result.rows) {
      const time = new Date(comment.created_at).toLocaleString();
      console.log(`  ${C.cyan}${comment.author}${C.reset} at ${time}:`);
      console.log(`    ${comment.content}`);
    }
    console.log();
  }

  async assignIssue(issueId: string, assignee: string): Promise<void> {
    await this.db.query(`UPDATE issues SET assignee = $2 WHERE id = $1`, [issueId, assignee]);
    console.log(`${C.green}Assigned issue #${issueId.slice(0, 8)} to ${assignee}${C.reset}`);
  }

  async setMilestone(issueId: string, milestoneId: string): Promise<void> {
    await this.db.query(`UPDATE issues SET milestone_id = $2 WHERE id = $1`, [
      issueId,
      milestoneId,
    ]);
    console.log(`${C.green}Set milestone on issue #${issueId.slice(0, 8)}${C.reset}`);
  }

  async addReaction(issueId: string, reaction: string): Promise<void> {
    await this.db.query(
      `INSERT INTO issue_events (issue_id, event_type, actor, metadata) VALUES ($1, 'reaction', 'system', $2)`,
      [issueId, JSON.stringify({ reaction })]
    );
    console.log(
      `${C.green}Added reaction '${reaction}' to issue #${issueId.slice(0, 8)}${C.reset}`
    );
  }
}
