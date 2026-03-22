import pg, { Pool, PoolClient } from 'pg';

export interface AutoReflectConfig {
  databaseUrl?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
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

export interface AutoReflectResult {
  learnings: number;
  promptUpdates: number;
  issues: number;
  reviewResponses: number;
  opinions: number;
  total: number;
}

export class AutoReflect {
  private pool: Pool | null = null;
  private externalClient: PoolClient | null = null;
  private config: AutoReflectConfig;

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

  constructor(config: AutoReflectConfig = {}) {
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

  parseLearnMarkers(text: string): AutoLearnMarker[] {
    const markers: AutoLearnMarker[] = [];
    let match;

    while ((match = AutoReflect.LEARN_PATTERN.exec(text)) !== null) {
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

    while ((match = AutoReflect.PROMPT_PATTERN.exec(text)) !== null) {
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

    while ((match = AutoReflect.ISSUE_PATTERN.exec(text)) !== null) {
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

    while ((match = AutoReflect.REVIEW_RESPONSE_PATTERN.exec(text)) !== null) {
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

    while ((match = AutoReflect.OPINION_PATTERN.exec(text)) !== null) {
      const meetingId = match[1]?.trim();
      const perspective = match[2]?.trim();
      const reasoning = match[3]?.trim();
      const position = match[4]?.trim() as 'support' | 'oppose' | 'neutral' | undefined;

      if (meetingId && perspective) {
        markers.push({
          meetingId,
          author: 'auto-reflect',
          perspective,
          reasoning,
          position: position || undefined,
        });
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
       VALUES ($1, ARRAY['learning', 'reflection'], 'auto-reflect', $2, $3)`,
      [
        marker.insight,
        7,
        JSON.stringify({ context: marker.context || null, source: 'auto-reflect' }),
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
      `INSERT INTO issues (title, description, issue_type, severity, tags)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        marker.title,
        marker.description || null,
        marker.type || 'bug',
        marker.severity || 'medium',
        marker.tags || [],
      ]
    );
  }

  async saveReviewResponse(marker: AutoReviewResponseMarker): Promise<void> {
    try {
      const client = this.getClient();
      await client.query(`SELECT respond_to_inter_review($1, $2, $3)`, [
        marker.reviewId,
        marker.response,
        JSON.stringify(marker.acceptedSuggestions || []),
      ]);
    } catch (err) {
      console.error(`Failed to save review response for ${marker.reviewId}:`, err);
      throw err;
    }
  }

  async reflect(text: string): Promise<AutoReflectResult> {
    const result: AutoReflectResult = {
      learnings: 0,
      promptUpdates: 0,
      issues: 0,
      reviewResponses: 0,
      opinions: 0,
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

    result.total =
      result.learnings +
      result.promptUpdates +
      result.issues +
      result.reviewResponses +
      result.opinions;

    return result;
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
