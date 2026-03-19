import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import { AIProvider, AIProviderFactory } from './ai/index.js';

export interface ReviewFinding {
  type: 'issue' | 'suggestion' | 'praise' | 'question';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file?: string;
  line?: number;
  message: string;
  code?: string;
  suggestion?: string;
}

export interface Learning {
  topic: string;
  reminder: string;
  source?: string;
}

export interface ReviewRequest {
  taskId?: string;
  commitHash?: string;
  branch?: string;
  reviewerId: string;
  context: {
    changes?: string;
    files?: string[];
    taskDescription?: string;
    author?: string;
    message?: string;
  };
}

export interface ReviewResult {
  reviewId: string;
  summary: string;
  findings: ReviewFinding[];
  learnings: Learning[];
  overallScore: number;
  codeQualityScore: number;
  testCoverageScore: number;
  documentationScore: number;
}

export enum InterReviewEvent {
  REVIEW_REQUESTED = 'review:requested',
  REVIEW_STARTED = 'review:started',
  REVIEW_COMPLETED = 'review:completed',
  REVIEW_FAILED = 'review:failed',
  REVIEW_RESPONSE = 'review:response',
}

export class InterReviewService extends EventEmitter {
  private readonly db: DatabaseClient;
  private readonly aiProvider: AIProvider;

  constructor(db: DatabaseClient, aiProvider?: AIProvider) {
    super();
    this.db = db;
    this.aiProvider = aiProvider || AIProviderFactory.createFromEnv();
  }

  async loadPromptFromSkills(promptName: string): Promise<string | null> {
    try {
      const result = await this.db.query<{ content: string }>(
        `SELECT content FROM skills WHERE name = $1 AND status = 'approved' LIMIT 1`,
        [promptName]
      );
      if (result.rows.length > 0) {
        return result.rows[0]!.content;
      }
    } catch {
      logger.debug(`[InterReview] Could not load prompt from skills: ${promptName}`);
    }
    return null;
  }

  async savePromptToSkills(promptName: string, content: string): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO skills (id, name, content, status, version, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, 'approved', '1.0', NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET content = $2, updated_at = NOW()`,
        [promptName, content]
      );
      logger.info(`[InterReview] Saved prompt to skills: ${promptName}`);
    } catch (error) {
      logger.error(`[InterReview] Failed to save prompt to skills:`, error);
    }
  }

  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.aiProvider.complete(userPrompt, systemPrompt);
    return response.content;
  }

  async requestReview(request: ReviewRequest): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `SELECT request_inter_review($1, $2, $3, $4, $5) as id`,
      [
        request.taskId || null,
        request.commitHash || null,
        request.branch || null,
        request.reviewerId,
        JSON.stringify(request.context),
      ]
    );

    const reviewId = result.rows[0]!.id;
    logger.info(`[InterReview] Review requested: ${reviewId}`);
    this.emit(InterReviewEvent.REVIEW_REQUESTED, { reviewId, request });

    return reviewId;
  }

  async performReview(reviewId: string, prompt: string): Promise<ReviewResult> {
    await this.db.query(
      `UPDATE inter_reviews SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
      [reviewId]
    );

    this.emit(InterReviewEvent.REVIEW_STARTED, { reviewId });

    try {
      const reviewResult = await this.executeReviewPrompt(reviewId, prompt);

      await this.db.query(
        `SELECT update_inter_review($1, 'completed', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          reviewId,
          reviewResult.summary,
          JSON.stringify(reviewResult.findings.filter(f => f.type === 'issue')),
          JSON.stringify(reviewResult.findings.filter(f => f.type === 'suggestion')),
          JSON.stringify(reviewResult.findings.filter(f => f.type === 'question')),
          JSON.stringify(reviewResult.findings.filter(f => f.type === 'praise')),
          reviewResult.overallScore,
          reviewResult.codeQualityScore,
          reviewResult.testCoverageScore,
          reviewResult.documentationScore,
        ]
      );

      logger.info(
        `[InterReview] Review completed: ${reviewId} (score: ${reviewResult.overallScore})`
      );
      this.emit(InterReviewEvent.REVIEW_COMPLETED, { reviewId, result: reviewResult });

      if (reviewResult.learnings.length > 0) {
        const review = await this.getReview(reviewId);
        await this.saveLearningsToMemory(reviewResult, review?.taskId || undefined);
        logger.info(`[InterReview] Saved ${reviewResult.learnings.length} learnings to memory`);
      }

      return reviewResult;
    } catch (error) {
      await this.db.query(
        `SELECT update_inter_review($1, 'failed', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
        [reviewId]
      );

      logger.error(`[InterReview] Review failed: ${reviewId}`, error);
      this.emit(InterReviewEvent.REVIEW_FAILED, { reviewId, error });
      throw error;
    }
  }

  private async executeReviewPrompt(reviewId: string, systemPrompt: string): Promise<ReviewResult> {
    const context = await this.getReviewContext(reviewId);

    const prompt = `You are a senior code reviewer with expertise in TypeScript, Node.js, and software best practices. Be constructive and thorough.

## Review Context
${context}

## Your Task
Analyze the code changes and provide feedback. But more importantly - EXTRACT LEARNING POINTS that can help the AI avoid similar issues in the future.

## Output Format
Return JSON with:
1. "summary": Brief summary of what changed
2. "learnings": Array of "skill snippets" - specific reminders/prompts the AI should remember for future work
3. "issues": Problems found (if any)
4. "suggestions": Improvements (if any)
5. "praise": What was done well
6. Scores (0-100) for overall, code quality, test coverage, documentation

## Important
The "learnings" field is the most valuable output. Write specific, actionable reminders like:
- "When modifying TaskWatchdogService, always update process_pids table"
- "Use non-null assertion (!) after checking rows.length"
- "Import Config from config/Config.js, not db/DatabaseClient.js"

Format:
{
  "summary": "...",
  "learnings": [
    {"topic": "TypeScript patterns", "reminder": "Always check array access with rows[0]"},
    {"topic": "Database patterns", "reminder": "Use uuid_generate_v4() for new records"}
  ],
  "findings": [...],
  "overallScore": 85,
  ...
}`;

    try {
      const response = await this.callReviewAI(systemPrompt, prompt);
      return this.parseReviewResponse(response);
    } catch (error) {
      return this.fallbackReview(context);
    }
  }

  private async getReviewContext(reviewId: string): Promise<string> {
    const result = await this.db.query<{
      task_id: string | null;
      commit_hash: string | null;
      branch: string | null;
      review_context: object;
    }>(`SELECT task_id, commit_hash, branch, review_context FROM inter_reviews WHERE id = $1`, [
      reviewId,
    ]);

    if (result.rows.length === 0) {
      return 'No context available';
    }

    const row = result.rows[0]!;
    let context = '';

    if (row.commit_hash) {
      try {
        const diff = execSync(`git diff ${row.commit_hash}^..${row.commit_hash} --stat`, {
          encoding: 'utf-8',
          timeout: 10000,
        });
        context += `## Commit: ${row.commit_hash}\n\`\`\`\n${diff}\n\`\`\`\n\n`;

        const diffContent = execSync(`git diff ${row.commit_hash}^..${row.commit_hash}`, {
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
        });
        context += `## Full Diff\n\`\`\`diff\n${diffContent}\n\`\`\`\n`;
      } catch {
        context += `## Commit: ${row.commit_hash}\n(Git diff not available)\n`;
      }
    }

    if (row.review_context) {
      const ctx = row.review_context as Record<string, unknown>;
      if (ctx.taskDescription) {
        context += `## Task Description\n${ctx.taskDescription}\n\n`;
      }
      if (ctx.message) {
        context += `## Commit Message\n${ctx.message}\n\n`;
      }
    }

    return context || 'Review context not available';
  }

  private async callReviewAI(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.callAI(systemPrompt, userPrompt);
  }

  private parseReviewResponse(response: string): ReviewResult {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          reviewId: '',
          summary: parsed.summary || 'No summary provided',
          findings: (parsed.findings || []).map((f: Record<string, unknown>) => ({
            type: f.type || 'suggestion',
            severity: f.severity || 'medium',
            file: f.file,
            line: f.line,
            message: f.message || '',
            suggestion: f.suggestion,
          })),
          learnings: (parsed.learnings || []).map((l: Record<string, string>) => ({
            topic: l.topic || 'general',
            reminder: l.reminder || '',
            source: 'inter-review',
          })),
          overallScore: parsed.overallScore || 50,
          codeQualityScore: parsed.codeQualityScore || 50,
          testCoverageScore: parsed.testCoverageScore || 50,
          documentationScore: parsed.documentationScore || 50,
        };
      } catch {
        // Fall through to fallback
      }
    }

    return this.fallbackReview(response);
  }

  private fallbackReview(context: string): ReviewResult {
    const issues: ReviewFinding[] = [];
    const suggestions: ReviewFinding[] = [];

    if (context.includes('TODO') || context.includes('FIXME')) {
      issues.push({
        type: 'suggestion',
        severity: 'low',
        message: 'Found TODO/FIXME comments - ensure they are tracked',
      });
    }

    if (!context.includes('test') && !context.includes('Test')) {
      suggestions.push({
        type: 'suggestion',
        severity: 'medium',
        message: 'No tests detected - consider adding test coverage',
      });
    }

    return {
      reviewId: '',
      summary: 'Review completed with basic checks',
      findings: [...issues, ...suggestions],
      learnings: [],
      overallScore: 70,
      codeQualityScore: 70,
      testCoverageScore: context.includes('test') ? 80 : 50,
      documentationScore: context.includes('docs') || context.includes('comment') ? 75 : 60,
    };
  }

  async respondToReview(
    reviewId: string,
    response: string,
    acceptedSuggestions: string[] = []
  ): Promise<void> {
    await this.db.query(`SELECT respond_to_inter_review($1, $2, $3)`, [
      reviewId,
      response,
      JSON.stringify(acceptedSuggestions),
    ]);

    logger.info(`[InterReview] Response recorded for review: ${reviewId}`);
    this.emit(InterReviewEvent.REVIEW_RESPONSE, { reviewId, response });
  }

  async getReview(reviewId: string): Promise<{
    id: string;
    taskId: string | null;
    status: string;
    summary: string | null;
    findings: ReviewFinding[];
    overallScore: number | null;
    response: string | null;
    requestedAt: Date;
    completedAt: Date | null;
  } | null> {
    const result = await this.db.query<{
      id: string;
      task_id: string | null;
      status: string;
      summary: string | null;
      findings: ReviewFinding[];
      overall_score: number | null;
      response: string | null;
      requested_at: Date;
      completed_at: Date | null;
    }>(`SELECT * FROM inter_reviews WHERE id = $1`, [reviewId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    return {
      id: row.id,
      taskId: row.task_id,
      status: row.status,
      summary: row.summary,
      findings: row.findings || [],
      overallScore: row.overall_score,
      response: row.response,
      requestedAt: row.requested_at,
      completedAt: row.completed_at,
    };
  }

  async getPendingReviews(): Promise<
    Array<{
      id: string;
      taskId: string | null;
      reviewerId: string;
      requestedAt: Date;
      pendingMinutes: number;
    }>
  > {
    const result = await this.db.query<{
      id: string;
      task_id: string | null;
      reviewer_id: string;
      requested_at: Date;
      pending_minutes: number;
    }>(`SELECT id, task_id, reviewer_id, requested_at, pending_minutes FROM pending_inter_reviews`);

    return result.rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      reviewerId: row.reviewer_id,
      requestedAt: row.requested_at,
      pendingMinutes: row.pending_minutes,
    }));
  }

  async getReviewStats(): Promise<{
    pendingCount: number;
    completedCount: number;
    failedCount: number;
    avgScore: number | null;
    avgCodeQuality: number | null;
    avgTestCoverage: number | null;
    avgDocumentation: number | null;
  }> {
    const result = await this.db.query<{
      pending_count: string;
      completed_count: string;
      failed_count: string;
      avg_score: string | null;
      avg_code_quality: string | null;
      avg_test_coverage: string | null;
      avg_documentation: string | null;
    }>(`SELECT * FROM inter_review_stats`);

    const row = result.rows[0]!;
    return {
      pendingCount: parseInt(row.pending_count, 10),
      completedCount: parseInt(row.completed_count, 10),
      failedCount: parseInt(row.failed_count, 10),
      avgScore: row.avg_score ? parseFloat(row.avg_score) : null,
      avgCodeQuality: row.avg_code_quality ? parseFloat(row.avg_code_quality) : null,
      avgTestCoverage: row.avg_test_coverage ? parseFloat(row.avg_test_coverage) : null,
      avgDocumentation: row.avg_documentation ? parseFloat(row.avg_documentation) : null,
    };
  }

  async saveLearningsToMemory(result: ReviewResult, taskId?: string): Promise<void> {
    for (const learning of result.learnings) {
      const memoryContent = `## AI Learning from Inter-Review

**Topic**: ${learning.topic}

**Reminder**: ${learning.reminder}

---
This is a reminder extracted from code review. Future AI should remember this when working on similar tasks.`;

      await this.db.query(
        `INSERT INTO memory (id, content, metadata, tags, importance, source, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          memoryContent,
          JSON.stringify({
            topic: learning.topic,
            source: 'inter-review',
            taskId,
            score: result.overallScore,
          }),
          JSON.stringify(['learning', 'review', learning.topic, 'ai-generated']),
          7,
          'inter-review',
        ]
      );

      const skillContent = `## AI Review Learning: ${learning.topic}

### Reminder
${learning.reminder}

### When to Apply
Apply this when working on tasks related to: ${learning.topic}

### Source
Extracted from Inter-Review #${taskId || 'unknown'} (Score: ${result.overallScore}/100)`;

      await this.db.query(
        `INSERT INTO skills (id, name, content, status, version, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, 'approved', '1.0', NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET content = $2, updated_at = NOW()`,
        [`review-learning-${learning.topic.toLowerCase().replace(/\s+/g, '-')}`, skillContent]
      );

      logger.info(`[InterReview] Saved learning to memory and skill: ${learning.topic}`);
    }
  }

  async getLearningsForAIContext(topic?: string, limit: number = 10): Promise<string> {
    let query = `
      SELECT content, metadata 
      FROM memory 
      WHERE source = 'inter-review' AND content ILIKE $1
      ORDER BY importance DESC, created_at DESC
      LIMIT $2
    `;

    if (!topic) {
      query = `
        SELECT content, metadata 
        FROM memory 
        WHERE source = 'inter-review'
        ORDER BY importance DESC, created_at DESC
        LIMIT $1
      `;
    }

    const result = topic
      ? await this.db.query(query, [`%${topic}%`, limit])
      : await this.db.query(query, [limit]);

    if (result.rows.length === 0) {
      return '';
    }

    const context = `## AI Review Learnings (${result.rows.length} recent)

${result.rows.map((row, idx) => `${idx + 1}. ${(row.metadata as Record<string, string>)?.topic || 'General'}: ${row.content.replace(/^## AI Learning.*?\n\n/, '').replace(/\n\n---.*$/s, '')}`).join('\n')}

---
These learnings were extracted from code reviews. Apply them to avoid similar issues.`;

    return context;
  }

  async getSkillsFromLearnings(): Promise<Array<{ name: string; content: string }>> {
    const result = await this.db.query<{ name: string; content: string }>(
      `SELECT name, content FROM skills WHERE name LIKE 'review-learning-%' AND status = 'approved' ORDER BY updated_at DESC`
    );
    return result.rows;
  }

  async extractPatternsFromReviews(limit: number = 20): Promise<
    Array<{
      topic: string;
      reminder: string;
      frequency: number;
    }>
  > {
    const result = await this.db.query<{
      topic: string;
      reminder: string;
      frequency: string;
    }>(
      `SELECT 
        (metadata->>'topic') as topic,
        content as reminder,
        COUNT(*) as frequency
       FROM memory 
       WHERE source = 'inter-review' AND metadata->>'topic' IS NOT NULL
       GROUP BY (metadata->>'topic'), content
       ORDER BY frequency DESC, COUNT(*) DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      topic: row.topic,
      reminder: row.reminder
        .replace(/^## AI Learning from Inter-Review\n\n\*\*Topic\*\*:.*?\n\n/, '')
        .replace(/\n\n---\n\n.*$/s, ''),
      frequency: parseInt(row.frequency, 10),
    }));
  }
}
