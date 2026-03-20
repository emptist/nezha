import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';

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
    const agentId = Config.getInstance().getAgentId();
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
    const agentId = Config.getInstance().getAgentId();

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
}
