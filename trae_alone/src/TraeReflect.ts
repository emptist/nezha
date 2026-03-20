import pg, { Pool, PoolClient } from 'pg';

export interface TraeReflectConfig {
  databaseUrl?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export interface TraeLearnMarker {
  insight: string;
  context?: string;
}

export interface TraePromptUpdateMarker {
  current: string;
  suggested: string;
  reason: string;
}

export interface TraeIssueMarker {
  title: string;
  description?: string;
  type?: string;
  severity?: string;
  tags?: string[];
}

export interface TraeReflectResult {
  learnings: number;
  promptUpdates: number;
  issues: number;
  total: number;
}

export class TraeReflect {
  private pool: Pool | null = null;
  private externalClient: PoolClient | null = null;
  private config: TraeReflectConfig;

  private static readonly LEARN_PATTERN = /\[LEARN\]\s*insight:\s*(.+?)(?:\s*context:\s*(.+?))?\s*(?=\[|$)/gis;
  private static readonly PROMPT_PATTERN = /\[PROMPT_UPDATE\]\s*current:\s*(.+?)\s*suggested:\s*(.+?)\s*reason:\s*(.+?)\s*(?=\[|$)/gis;
  private static readonly ISSUE_PATTERN = /\[ISSUE\]\s*title:\s*(.+?)(?:\s*description:\s*(.+?))?(?:\s*type:\s*(\w+))?(?:\s*severity:\s*(\w+))?(?:\s*tags:\s*(.+?))?\s*(?=\[|$)/gis;

  constructor(config: TraeReflectConfig = {}) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool) return;

    this.pool = new pg.Pool({
      connectionString: this.config.databaseUrl || process.env.DATABASE_URL,
      host: this.config.host || process.env.DB_HOST || 'localhost',
      port: this.config.port || parseInt(process.env.DB_PORT || '5432'),
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

  parseLearnMarkers(text: string): TraeLearnMarker[] {
    const markers: TraeLearnMarker[] = [];
    let match;

    while ((match = TraeReflect.LEARN_PATTERN.exec(text)) !== null) {
      const insight = match[1]?.trim();
      const context = match[2]?.trim();

      if (insight) {
        markers.push({ insight, context });
      }
    }

    return markers;
  }

  parsePromptUpdateMarkers(text: string): TraePromptUpdateMarker[] {
    const markers: TraePromptUpdateMarker[] = [];
    let match;

    while ((match = TraeReflect.PROMPT_PATTERN.exec(text)) !== null) {
      const current = match[1]?.trim();
      const suggested = match[2]?.trim();
      const reason = match[3]?.trim();

      if (current && suggested) {
        markers.push({ current, suggested, reason: reason || '' });
      }
    }

    return markers;
  }

  parseIssueMarkers(text: string): TraeIssueMarker[] {
    const markers: TraeIssueMarker[] = [];
    let match;

    while ((match = TraeReflect.ISSUE_PATTERN.exec(text)) !== null) {
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

  async saveLearning(marker: TraeLearnMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO memory (content, tags, source, importance, metadata) 
       VALUES ($1, ARRAY['learning', 'reflection'], 'trae-reflect', $2, $3)`,
      [
        marker.insight,
        7,
        JSON.stringify({ context: marker.context || null, source: 'trae-alone' }),
      ]
    );
  }

  async savePromptUpdate(marker: TraePromptUpdateMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO prompt_suggestions (id, current_prompt, suggested_prompt, reason, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending')`,
      [marker.current, marker.suggested, marker.reason]
    );
  }

  async saveIssue(marker: TraeIssueMarker): Promise<void> {
    const client = this.getClient();

    await client.query(
      `INSERT INTO issues (title, description, issue_type, severity, tags)
       VALUES ($1, $2, $3, $4, $5)`,
      [marker.title, marker.description || null, marker.type || 'bug', marker.severity || 'medium', marker.tags || []]
    );
  }

  async reflect(text: string): Promise<TraeReflectResult> {
    const result: TraeReflectResult = {
      learnings: 0,
      promptUpdates: 0,
      issues: 0,
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

    result.total = result.learnings + result.promptUpdates + result.issues;

    return result;
  }

  async getRecentLearnings(limit: number = 10): Promise<{ content: string; source: string; created_at: Date }[]> {
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
