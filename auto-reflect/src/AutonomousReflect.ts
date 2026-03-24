import pg, { Pool, PoolClient } from 'pg';

export interface AutonomousReflectConfig {
  databaseUrl?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

function getAuthor(): string {
  return process.env.NEZHA_AGENT_ID || process.env.AUTHOR || 'areflect';
}

export interface AutoLearnMarker {
  insight: string;
  context?: string;
}

export interface AutoPromptUpdateMarker {
  current: string;
  suggested: string;
  reason: string;
}

export interface AutoIssueMarker {
  title: string;
  description?: string;
  type?: string;
  severity?: string;
  tags?: string[];
}

export interface AutoReviewResponseMarker {
  reviewId: string;
  response: string;
  acceptedSuggestions?: string[];
}

export interface AutoOpinionMarker {
  meetingId: string;
  author: string;
  perspective: string;
  reasoning?: string;
  position?: 'support' | 'oppose' | 'neutral';
}

export interface AutoTaskMarker {
  title: string;
  description?: string;
  priority?: number;
  type?: string;
  tags?: string[];
}

export interface AutoAnnounceMarker {
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  targetAgent?: string;
}

export interface AutoScheduleMarker {
  title: string;
  cron: string;
  description?: string;
  priority?: number;
}

export interface AutoIssueResolveMarker {
  id: string;
  resolution: string;
}

export interface AutoTaskCompleteMarker {
  id: string;
  result?: string;
}

export interface AutoIssueCommentMarker {
  id: string;
  comment: string;
  internal?: boolean;
}

export interface AutonomousReflectResult {
  learnings: number;
  promptUpdates: number;
  issues: number;
  issuesResolved: number;
  issueComments: number;
  tasks: number;
  tasksCompleted: number;
  reviewResponses: number;
  opinions: number;
  announces: number;
  schedules: number;
  total: number;
}

export class AutonomousReflect {
  private pool: Pool | null = null;
  private externalClient: PoolClient | null = null;
  private config: AutonomousReflectConfig;

  private static readonly LEARN_PATTERN =
    /\[LEARN\]\s*insight:\s*(.+?)(?:\s*context:\s*(.+?))?\s*(?=\[|$)/gis;
  private static readonly PROMPT_PATTERN =
    /\[PROMPT_UPDATE\]\s*current:\s*(.+?)\s*suggested:\s*(.+?)\s*reason:\s*(.+?)\s*(?=\[|$)/gis;
  private static readonly ISSUE_PATTERN =
    /\[ISSUE\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*type:\s*(\w+))?(?:\s*severity:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;
  private static readonly REVIEW_RESPONSE_PATTERN =
    /\[REVIEW_RESPONSE\]\s*reviewId:\s*(.+?)\s*response:\s*([\s\S]*?)\s*(?=\[|accepted:|$)(?:\s*accepted:\s*([\s\S]*?))?\s*(?=\[|$)/gi;
  private static readonly OPINION_PATTERN =
    /\[OPINION\]\s*meetingId:\s*(.+?)\s*perspective:\s*(.+?)(?:\s*reasoning:\s*(.+?))?(?:\s*position:\s*(\w+))?\s*(?=\[|$)/gis;
  private static readonly TASK_PATTERN =
    /\[TASK\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*priority:\s*(\d+))?(?:\s*type:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;
  private static readonly ANNOUNCE_PATTERN =
    /\[ANNOUNCE\]\s*message:\s*(.+?)(?:\s*priority:\s*(low|normal|high|critical))?(?:\s*to:\s*(.+?))?\s*(?=\[|$)/gis;
  private static readonly SCHEDULE_PATTERN =
    /\[SCHEDULE\]\s*title:\s*(.+?)(?:\s*cron:\s*(.+?))?(?:\s*description:\s*(.+?))?(?:\s*priority:\s*(\d+))?\s*(?=\[|$)/gis;
  private static readonly ISSUE_RESOLVE_PATTERN =
    /\[ISSUE_RESOLVE\]\s*id:\s*([a-f0-9-]+)\s+resolution:\s*(.+?)\s*(?=\[|$)/gis;
  private static readonly TASK_COMPLETE_PATTERN =
    /\[TASK_COMPLETE\]\s*id:\s*([a-f0-9-]+)(?:\s+result:\s*(.+?))?\s*(?=\[|$)/gis;
  private static readonly ISSUE_COMMENT_PATTERN =
    /\[ISSUE_COMMENT\]\s*id:\s*([a-f0-9-]+)\s+comment:\s*(.+?)(?:\s+internal:\s*(true|false))?\s*(?=\[|$)/gis;

  constructor(config: AutonomousReflectConfig = {}) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool) return;

    this.pool = new pg.Pool({
      connectionString: this.config.databaseUrl || process.env.DATABASE_URL,
      host: this.config.host || process.env.DB_HOST || 'localhost',
      port: this.config.port || parseInt(process.env.DB_PORT || '5432', 10),
      database: this.config.database || process.env.DB_NAME || 'nezha',
      user: this.config.user || process.env.DB_USER || 'postgres',
      password: this.config.password || process.env.DB_PASSWORD || '',
    });
  }

  setExternalClient(client: PoolClient): void {
    this.externalClient = client;
  }

  private getClient(): Pool | PoolClient {
    if (this.externalClient) return this.externalClient;
    if (!this.pool) throw new Error('Not connected. Call connect() first.');
    return this.pool;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  parseLearnMarkers(text: string): AutoLearnMarker[] {
    const markers: AutoLearnMarker[] = [];
    let match;

    while ((match = AutonomousReflect.LEARN_PATTERN.exec(text)) !== null) {
      const insight = match[1]?.trim();
      const context = match[2]?.trim();

      if (insight) {
        markers.push({ insight, context });
      }
    }

    return markers;
  }

  parsePromptUpdateMarkers(text: string): AutoPromptUpdateMarker[] {
    const markers: AutoPromptUpdateMarker[] = [];
    let match;

    while ((match = AutonomousReflect.PROMPT_PATTERN.exec(text)) !== null) {
      const current = match[1]?.trim();
      const suggested = match[2]?.trim();
      const reason = match[3]?.trim();

      if (current && suggested) {
        markers.push({ current, suggested, reason: reason || '' });
      }
    }

    return markers;
  }

  parseIssueMarkers(text: string): AutoIssueMarker[] {
    const markers: AutoIssueMarker[] = [];
    let match;

    while ((match = AutonomousReflect.ISSUE_PATTERN.exec(text)) !== null) {
      const title = match[1]?.trim();
      const description = match[2]?.trim();
      const type = match[3]?.trim();
      const severity = match[4]?.trim();
      const tagsStr = match[5]?.trim();

      if (title) {
        markers.push({
          title,
          description,
          type: type || 'bug',
          severity: severity || 'medium',
          tags: tagsStr ? tagsStr.split(',').map(t => t.trim()) : [],
        });
      }
    }

    return markers;
  }

  parseReviewResponseMarkers(text: string): AutoReviewResponseMarker[] {
    const markers: AutoReviewResponseMarker[] = [];
    let match;

    while ((match = AutonomousReflect.REVIEW_RESPONSE_PATTERN.exec(text)) !== null) {
      const reviewId = match[1]?.trim();
      const response = match[2]?.trim();
      const acceptedStr = match[3]?.trim();

      if (reviewId && response) {
        markers.push({
          reviewId,
          response,
          acceptedSuggestions: acceptedStr
            ? acceptedStr
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            : [],
        });
      }
    }

    return markers;
  }

  parseOpinionMarkers(text: string): AutoOpinionMarker[] {
    const markers: AutoOpinionMarker[] = [];
    let match;

    while ((match = AutonomousReflect.OPINION_PATTERN.exec(text)) !== null) {
      const meetingId = match[1]?.trim();
      const perspective = match[2]?.trim();
      const reasoning = match[3]?.trim();
      const position = match[4]?.trim() as 'support' | 'oppose' | 'neutral' | undefined;

      if (meetingId && perspective) {
        markers.push({
          meetingId,
          author: getAuthor(),
          perspective,
          reasoning,
          position: position || undefined,
        });
      }
    }

    return markers;
  }

  parseTaskMarkers(text: string): AutoTaskMarker[] {
    const markers: AutoTaskMarker[] = [];
    let match;

    while ((match = AutonomousReflect.TASK_PATTERN.exec(text)) !== null) {
      const title = match[1]?.trim();
      const description = match[2]?.trim();
      const priorityStr = match[3]?.trim();
      const type = match[4]?.trim();
      const tagsStr = match[5]?.trim();

      if (title) {
        markers.push({
          title,
          description,
          priority: priorityStr ? Math.min(10, Math.max(1, parseInt(priorityStr, 10) || 5)) : 5,
          type: type || 'implementation',
          tags: tagsStr ? tagsStr.split(',').map(t => t.trim()) : [],
        });
      }
    }

    return markers;
  }

  parseAnnounceMarkers(text: string): AutoAnnounceMarker[] {
    const markers: AutoAnnounceMarker[] = [];
    let match;

    while ((match = AutonomousReflect.ANNOUNCE_PATTERN.exec(text)) !== null) {
      const message = match[1]?.trim();
      const priority = match[2]?.trim() as 'low' | 'normal' | 'high' | 'critical' | undefined;
      const targetAgent = match[3]?.trim();

      if (message) {
        markers.push({
          message,
          priority: priority || 'normal',
          targetAgent,
        });
      }
    }

    return markers;
  }

  parseScheduleMarkers(text: string): AutoScheduleMarker[] {
    const markers: AutoScheduleMarker[] = [];
    let match;

    while ((match = AutonomousReflect.SCHEDULE_PATTERN.exec(text)) !== null) {
      const title = match[1]?.trim();
      const cron = match[2]?.trim();
      const description = match[3]?.trim();
      const priorityStr = match[4]?.trim();

      if (title && cron) {
        markers.push({
          title,
          cron,
          description,
          priority: priorityStr ? Math.min(10, Math.max(1, parseInt(priorityStr, 10) || 5)) : 5,
        });
      }
    }

    return markers;
  }

  parseIssueResolveMarkers(text: string): AutoIssueResolveMarker[] {
    const markers: AutoIssueResolveMarker[] = [];
    let match;

    while ((match = AutonomousReflect.ISSUE_RESOLVE_PATTERN.exec(text)) !== null) {
      const id = match[1]?.trim();
      const resolution = match[2]?.trim();

      if (id && resolution) {
        markers.push({ id, resolution });
      }
    }

    return markers;
  }

  parseTaskCompleteMarkers(text: string): AutoTaskCompleteMarker[] {
    const markers: AutoTaskCompleteMarker[] = [];
    let match;

    while ((match = AutonomousReflect.TASK_COMPLETE_PATTERN.exec(text)) !== null) {
      const id = match[1]?.trim();
      const result = match[2]?.trim();

      if (id) {
        markers.push({ id, result });
      }
    }

    return markers;
  }

  parseIssueCommentMarkers(text: string): AutoIssueCommentMarker[] {
    const markers: AutoIssueCommentMarker[] = [];
    let match;

    while ((match = AutonomousReflect.ISSUE_COMMENT_PATTERN.exec(text)) !== null) {
      const id = match[1]?.trim();
      const comment = match[2]?.trim();
      const internalStr = match[3]?.trim();

      if (id && comment) {
        markers.push({ id, comment, internal: internalStr === 'true' });
      }
    }

    return markers;
  }

  async saveOpinion(marker: AutoOpinionMarker): Promise<void> {
    const client = this.getClient();

    const exists = await client.query(`SELECT id FROM meetings WHERE id = $1`, [marker.meetingId]);
    if (exists.rows.length === 0) {
      throw new Error(`Meeting ${marker.meetingId} does not exist`);
    }

    await client.query(
      `INSERT INTO meeting_opinions (meeting_id, author, perspective, reasoning, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        marker.meetingId,
        marker.author,
        marker.perspective,
        marker.reasoning || null,
        marker.position || null,
      ]
    );
  }

  async saveLearning(marker: AutoLearnMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO memory (content, tags, source, importance, metadata) 
       VALUES ($1, ARRAY['learning', 'reflection'], 'areflect', $2, $3)`,
      [
        marker.insight,
        7,
        JSON.stringify({
          context: marker.context || null,
          source: 'areflect',
          author: getAuthor(),
        }),
      ]
    );
  }

  async savePromptUpdate(marker: AutoPromptUpdateMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO prompt_suggestions (id, current_prompt, suggested_prompt, reason, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending')`,
      [marker.current, marker.suggested, marker.reason]
    );
  }

  async saveIssue(marker: AutoIssueMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO issues (title, description, issue_type, severity, tags, discovered_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        marker.title,
        marker.description || null,
        marker.type || 'bug',
        marker.severity || 'medium',
        marker.tags || [],
        getAuthor(),
      ]
    );
  }

  async saveReviewResponse(marker: AutoReviewResponseMarker): Promise<void> {
    try {
      const client = this.getClient();
      await client.query(`SELECT respond_to_inter_review($1::uuid, $2::text, $3::jsonb)`, [
        marker.reviewId,
        marker.response,
        JSON.stringify(marker.acceptedSuggestions || []),
      ]);
    } catch (err) {
      console.error(`Failed to save review response for ${marker.reviewId}:`, err);
      throw err;
    }
  }

  async saveTask(marker: AutoTaskMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO tasks (title, description, priority, type, tags, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
      [
        marker.title,
        marker.description || null,
        marker.priority || 5,
        marker.type || 'implementation',
        marker.tags || [],
        getAuthor(),
      ]
    );
  }

  async saveAnnounce(marker: AutoAnnounceMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO project_communications (from_ai, to_ai, message_type, content, priority)
       VALUES ($1, $2, 'broadcast', $3, $4)`,
      [getAuthor(), marker.targetAgent || null, marker.message, marker.priority || 'normal']
    );
  }

  async saveSchedule(marker: AutoScheduleMarker): Promise<void> {
    const client = this.getClient();
    const { Cron } = await import('croner');
    const cronJob = new Cron(marker.cron, { timezone: 'UTC' });
    const nextRun = cronJob.nextRun() || new Date(Date.now() + 3600000);

    await client.query(
      `INSERT INTO scheduled_tasks (name, description, cron_expression, priority, enabled, next_run)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [marker.title, marker.description || null, marker.cron, marker.priority || 5, nextRun]
    );
  }

  async resolveIssue(marker: AutoIssueResolveMarker): Promise<void> {
    const client = this.getClient();
    const author = getAuthor();

    const result = await client.query<{ title: string }>(
      `SELECT title FROM issues WHERE id = $1 AND status != 'resolved'`,
      [marker.id]
    );

    if (result.rows.length === 0) {
      const existsResult = await client.query<{ status: string }>(
        `SELECT status FROM issues WHERE id = $1`,
        [marker.id]
      );
      if (existsResult.rows.length === 0) {
        console.log(`Issue not found: ${marker.id}`);
      } else {
        console.log(`Issue already resolved: ${marker.id} (status: ${existsResult.rows[0].status})`);
      }
      return;
    }

    await client.query(
      `UPDATE issues 
       SET status = 'resolved', resolution = $2, resolved_at = NOW(), resolved_by = $3
       WHERE id = $1`,
      [marker.id, marker.resolution, author]
    );
  }

  async completeTask(marker: AutoTaskCompleteMarker): Promise<void> {
    const client = this.getClient();

    const result = await client.query<{ title: string }>(
      `SELECT title FROM tasks WHERE id = $1 AND status NOT IN ('COMPLETED', 'FAILED')`,
      [marker.id]
    );

    if (result.rows.length === 0) {
      const existsResult = await client.query<{ status: string }>(
        `SELECT status FROM tasks WHERE id = $1`,
        [marker.id]
      );
      if (existsResult.rows.length === 0) {
        console.log(`Task not found: ${marker.id}`);
      } else {
        console.log(`Task already ${existsResult.rows[0].status}: ${marker.id}`);
      }
      return;
    }

    await client.query(
      `UPDATE tasks 
       SET status = 'COMPLETED', result = $2, completed_at = NOW()
       WHERE id = $1`,
      [marker.id, marker.result ? JSON.stringify({ message: marker.result }) : null]
    );
  }

  async commentOnIssue(marker: AutoIssueCommentMarker): Promise<void> {
    const client = this.getClient();
    const author = getAuthor();

    const result = await client.query<{ title: string }>(
      `SELECT title FROM issues WHERE id = $1`,
      [marker.id]
    );

    if (result.rows.length === 0) {
      console.log(`Issue not found: ${marker.id}`);
      return;
    }

    await client.query(
      `INSERT INTO issue_comments (issue_id, author, content, is_internal)
       VALUES ($1, $2, $3, $4)`,
      [marker.id, author, marker.comment, marker.internal || false]
    );
  }

  async reflect(text: string): Promise<AutonomousReflectResult> {
    const result: AutonomousReflectResult = {
      learnings: 0,
      promptUpdates: 0,
      issues: 0,
      issuesResolved: 0,
      issueComments: 0,
      tasks: 0,
      tasksCompleted: 0,
      reviewResponses: 0,
      opinions: 0,
      announces: 0,
      schedules: 0,
      total: 0,
    };

    const learnMarkers = this.parseLearnMarkers(text);
    for (const marker of learnMarkers) {
      await this.saveLearning(marker);
      result.learnings++;
      console.log(`✓ Saved learning: ${marker.insight.substring(0, 60)}...`);
    }

    const promptMarkers = this.parsePromptUpdateMarkers(text);
    for (const marker of promptMarkers) {
      await this.savePromptUpdate(marker);
      result.promptUpdates++;
      console.log(`✓ Saved prompt suggestion: ${marker.suggested.substring(0, 40)}...`);
    }

    const issueMarkers = this.parseIssueMarkers(text);
    for (const marker of issueMarkers) {
      await this.saveIssue(marker);
      result.issues++;
      console.log(`✓ Created issue: ${marker.title.substring(0, 50)}...`);
    }

    const reviewResponseMarkers = this.parseReviewResponseMarkers(text);
    for (const marker of reviewResponseMarkers) {
      await this.saveReviewResponse(marker);
      result.reviewResponses++;
      console.log(`✓ Saved review response for: ${marker.reviewId}`);
    }

    const opinionMarkers = this.parseOpinionMarkers(text);
    for (const marker of opinionMarkers) {
      await this.saveOpinion(marker);
      result.opinions++;
      console.log(`✓ Saved opinion for meeting: ${marker.meetingId.substring(0, 8)}`);
    }

    const taskMarkers = this.parseTaskMarkers(text);
    for (const marker of taskMarkers) {
      await this.saveTask(marker);
      result.tasks++;
      console.log(`✓ Created task: ${marker.title.substring(0, 50)}...`);
    }

    const announceMarkers = this.parseAnnounceMarkers(text);
    for (const marker of announceMarkers) {
      await this.saveAnnounce(marker);
      result.announces++;
      console.log(`✓ Sent broadcast: ${marker.message.substring(0, 50)}...`);
    }

    const scheduleMarkers = this.parseScheduleMarkers(text);
    for (const marker of scheduleMarkers) {
      await this.saveSchedule(marker);
      result.schedules++;
      console.log(`✓ Created schedule: ${marker.title.substring(0, 50)}...`);
    }

    const issueResolveMarkers = this.parseIssueResolveMarkers(text);
    for (const marker of issueResolveMarkers) {
      await this.resolveIssue(marker);
      result.issuesResolved++;
      console.log(`✓ Resolved issue: ${marker.id.substring(0, 8)}...`);
    }

    const taskCompleteMarkers = this.parseTaskCompleteMarkers(text);
    for (const marker of taskCompleteMarkers) {
      await this.completeTask(marker);
      result.tasksCompleted++;
      console.log(`✓ Completed task: ${marker.id.substring(0, 8)}...`);
    }

    const issueCommentMarkers = this.parseIssueCommentMarkers(text);
    for (const marker of issueCommentMarkers) {
      await this.commentOnIssue(marker);
      result.issueComments++;
      console.log(`✓ Commented on issue: ${marker.id.substring(0, 8)}...`);
    }

    result.total =
      result.learnings +
      result.promptUpdates +
      result.issues +
      result.issuesResolved +
      result.issueComments +
      result.reviewResponses +
      result.opinions +
      result.tasks +
      result.tasksCompleted +
      result.announces +
      result.schedules;

    if (result.total > 0) {
      await this.postReflectionChecks();
    }

    return result;
  }

  private async postReflectionChecks(): Promise<void> {
    await this.checkUncommittedChanges();
    await this.checkPendingTasks();
  }

  private async checkUncommittedChanges(): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });

      if (status.trim()) {
        const author = getAuthor();
        console.log(
          `\n[Git Reminder] [${author}] You have uncommitted changes. Consider committing with your ID in the message.`
        );
        console.log(status.substring(0, 500));
      }
    } catch {
      // Not a git repo or git not available
    }
  }

  async checkPendingTasks(): Promise<void> {
    try {
      const client = this.getClient();
      const result = await client.query(
        `SELECT id, title, priority FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC LIMIT 3`
      );

      if (result.rows.length > 0) {
        const author = getAuthor();
        console.log(
          `\n[Task Reminder] [${author}] You have ${result.rows.length} pending task(s):`
        );
        for (const task of result.rows) {
          console.log(`  • [${task.priority}] ${task.title.substring(0, 60)}`);
        }
      }
    } catch (err) {
      // Table might not exist or other error
    }
  }

  async getRecentLearnings(
    limit: number = 10
  ): Promise<{ content: string; source: string; created_at: Date }[]> {
    const client = this.getClient();

    const result = await client.query<{
      content: string;
      source: string;
      created_at: Date;
    }>(
      `SELECT content, source, created_at 
       FROM memory 
       WHERE 'learning' = ANY(tags) 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  async getPendingTasks(): Promise<number> {
    const client = this.getClient();

    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM tasks WHERE status IN ('PENDING', 'RUNNING')`
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async getUnresolvedDLQ(): Promise<number> {
    const client = this.getClient();

    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM dead_letter_queue WHERE resolved = false`
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async getOpenIssues(): Promise<number> {
    const client = this.getClient();

    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM issues WHERE status = 'open'`
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async checkPendingWork(): Promise<{
    tasks: number;
    dlq: number;
    issues: number;
    hasWork: boolean;
  }> {
    const [tasks, dlq, issues] = await Promise.all([
      this.getPendingTasks(),
      this.getUnresolvedDLQ(),
      this.getOpenIssues(),
    ]);

    return {
      tasks,
      dlq,
      issues,
      hasWork: tasks > 0 || dlq > 0 || issues > 0,
    };
  }
}
