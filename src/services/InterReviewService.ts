import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'events';
import { AIProvider, AIProviderFactory } from './ai/index.js';
import { getSelfImprovement } from './SelfImprovementService.js';
import { BroadcastService } from './BroadcastService.js';
import { getCommitDiff } from '../utils/git.js';
import { AgentIdentityService } from './AgentIdentityService.js';

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
  private broadcastService: BroadcastService | null = null;
  private getSessionId: () => string | null;

  constructor(db: DatabaseClient, aiProvider: AIProvider, getSessionId?: () => string | null) {
    super();
    this.db = db;
    this.aiProvider = aiProvider;
    this.getSessionId = getSessionId || (() => null);
  }

  static async create(
    db: DatabaseClient,
    getSessionId?: () => string | null
  ): Promise<InterReviewService> {
    const aiProvider = await AIProviderFactory.createInnerProvider(db);
    const service = new InterReviewService(db, aiProvider, getSessionId);
    service.broadcastService = await BroadcastService.create(db);
    return service;
  }

  private async ensureBroadcastService(): Promise<BroadcastService> {
    if (!this.broadcastService) {
      this.broadcastService = await BroadcastService.create(this.db);
    }
    return this.broadcastService;
  }

  private isAIAvailable(): boolean {
    return this.aiProvider !== null;
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
      const existing = await this.db.query<{ id: string }>(
        `SELECT id FROM skills WHERE name = $1`,
        [promptName]
      );

      if (existing.rows.length > 0) {
        await this.db.query(`UPDATE skills SET content = $2, updated_at = NOW() WHERE name = $1`, [
          promptName,
          JSON.stringify({ markdown: content }),
        ]);
      } else {
        await this.db.query(
          `INSERT INTO skills (id, name, content, version, source, created_at, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, '1.0', 'ai-built', NOW(), NOW())`,
          [promptName, JSON.stringify({ markdown: content })]
        );
      }
      logger.info(`[InterReview] Saved prompt to skills: ${promptName}`);
    } catch (error) {
      logger.error(`[InterReview] Failed to save prompt to skills:`, error);
    }
  }

  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.aiProvider.complete(userPrompt, systemPrompt);
    return response.content;
  }

  async requestReview(request: ReviewRequest, broadcast: boolean = true): Promise<string> {
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

    if (broadcast) {
      try {
        const bs = await this.ensureBroadcastService();
        const taskInfo = request.taskId ? `Task: ${request.taskId}` : '';
        const commitInfo = request.commitHash ? `Commit: ${request.commitHash.slice(0, 7)}` : '';
        const msg = `🔍 Inter-review requested${taskInfo ? ` (${taskInfo})` : ''}${commitInfo ? ` - ${commitInfo}` : ''}. Please review: ${reviewId}`;
        await bs.sendBroadcast(msg, { priority: 'normal' });
        logger.info(`[InterReview] Broadcasted review request: ${reviewId}`);
      } catch (broadcastErr) {
        logger.warn(`[InterReview] Broadcast failed: ${broadcastErr}`);
      }
    }

    return reviewId;
  }

  async performReview(reviewId: string, prompt: string): Promise<ReviewResult> {
    await this.db.query(
      `UPDATE inter_reviews SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
      [reviewId]
    );

    this.emit(InterReviewEvent.REVIEW_STARTED, { reviewId });

    let reviewResult: ReviewResult;
    let rawResponse: string;

    try {
      const result = await this.executeReviewPrompt(reviewId, prompt);
      reviewResult = result.reviewResult;
      rawResponse = result.rawResponse;

      await this.db.query('BEGIN');
      logger.debug(`[InterReview] Transaction started for review: ${reviewId}`);

      const currentIdentity = await AgentIdentityService.getResolvedIdentity(true);
      const reviewedBy = currentIdentity.id;

      await this.db.query(
        `SELECT update_inter_review($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          reviewId,
          'completed',
          reviewResult.summary,
          JSON.stringify(reviewResult.findings),
          JSON.stringify(reviewResult.findings.filter(f => f.type === 'suggestion')),
          JSON.stringify(reviewResult.findings.filter(f => f.type === 'issue')),
          JSON.stringify(reviewResult.findings.filter(f => f.type === 'praise')),
          reviewResult.overallScore,
          reviewResult.codeQualityScore,
          reviewResult.testCoverageScore,
          reviewResult.documentationScore,
          rawResponse,
          reviewedBy,
        ]
      );
      logger.debug(`[InterReview] update_inter_review completed for: ${reviewId} (reviewed_by: ${reviewedBy})`);

      if (reviewResult.learnings.length > 0) {
        const review = await this.getReview(reviewId);
        await this.saveLearningsToMemory(reviewResult, review?.taskId || undefined);
        logger.info(`[InterReview] Saved ${reviewResult.learnings.length} learnings to memory`);
      }

      await this.db.query('COMMIT');
      logger.debug(`[InterReview] Transaction committed for review: ${reviewId}`);

      logger.info(
        `[InterReview] Review completed: ${reviewId} (score: ${reviewResult.overallScore})`
      );
      this.emit(InterReviewEvent.REVIEW_COMPLETED, { reviewId, result: reviewResult });

      if (reviewResult.learnings.length > 0) {
        logger.info(`[InterReview] Calling suggestPromptUpdatesFromLearnings...`);
        try {
          await this.suggestPromptUpdatesFromLearnings(reviewResult, undefined);
        } catch (promptErr) {
          logger.warn(`[InterReview] suggestPromptUpdatesFromLearnings failed: ${promptErr}`);
        }
      }

      if (
        reviewResult.overallScore < 80 ||
        reviewResult.findings.filter(f => f.type === 'issue').length > 0
      ) {
        const issueCount = reviewResult.findings.filter(f => f.type === 'issue').length;
        const msg = `## Inter-Review Completed\n\n**Score**: ${reviewResult.overallScore}/100\n**Issues Found**: ${issueCount}\n**Summary**: ${reviewResult.summary.substring(0, 200)}...\n\n${
          issueCount > 0
            ? '**Key Issues**:\n' +
              reviewResult.findings
                .filter(f => f.type === 'issue')
                .slice(0, 3)
                .map(f => `- ${f.message}`)
                .join('\n')
            : ''
        }`;

        try {
          const bs = await this.ensureBroadcastService();
          await bs.sendBroadcast(msg, {
            priority: reviewResult.overallScore < 60 ? 'high' : 'normal',
          });
          logger.info(
            `[InterReview] Broadcasted review findings (score: ${reviewResult.overallScore})`
          );
        } catch (broadcastErr) {
          logger.warn(`[InterReview] Broadcast failed: ${broadcastErr}`);
        }
      }

      const review = await this.getReview(reviewId);
      const taskCreatedCount = await this.createTasksFromFindings(
        reviewResult,
        review?.taskId || undefined
      );
      if (taskCreatedCount > 0) {
        logger.info(`[InterReview] Created ${taskCreatedCount} task(s) from review findings`);
      }

      return reviewResult;
    } catch (error) {
      logger.error(`[InterReview] Review failed: ${reviewId}`, error);
      logger.error(`[InterReview] Stack trace:`, error instanceof Error ? error.stack : error);

      try {
        await this.db.query('ROLLBACK');
        logger.debug(`[InterReview] Transaction rolled back for review: ${reviewId}`);
      } catch (rollbackErr) {
        logger.error(`[InterReview] Rollback failed for review ${reviewId}:`, rollbackErr);
      }

      try {
        await this.db.query(
          `SELECT update_inter_review($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [reviewId, 'failed', null, null, null, null, null, null, null, null, null, null, null]
        );
        logger.debug(`[InterReview] Marked review as failed: ${reviewId}`);
      } catch (updateErr) {
        logger.error(`[InterReview] Failed to mark review as failed: ${reviewId}`, updateErr);
      }

      this.emit(InterReviewEvent.REVIEW_FAILED, { reviewId, error });
      throw error;
    }
  }

  private async executeReviewPrompt(
    reviewId: string,
    systemPrompt: string
  ): Promise<{ reviewResult: ReviewResult; rawResponse: string }> {
    const context = await this.getReviewContext(reviewId);

    // 🆕 Load the inter-review-inner-ai skill for comprehensive system knowledge
    let skillContent = '';
    try {
      const skillJson = await this.loadPromptFromSkills('inter-review-inner-ai');
      if (skillJson) {
        // Handle both string and object (JSONB auto-parse)
        const parsed = typeof skillJson === 'string' ? JSON.parse(skillJson) : skillJson;
        skillContent = parsed.markdown || (typeof skillJson === 'string' ? skillJson : JSON.stringify(skillJson));
        logger.info('[InterReview] Loaded inter-review-inner-ai skill successfully');
      }
    } catch (err) {
      logger.warn('[InterReview] Failed to load inter-review-inner-ai skill:', err);
    }

    // 🆕 Fallback: Load priority learnings and table docs if skill not found
    let fallbackKnowledge = '';
    if (!skillContent) {
      try {
        const priorityLearnings = await this.getPriorityLearnings();
        const tableDocs = await this.getTableDocs();
        fallbackKnowledge = `\n## 🎓 Priority Learnings\n${priorityLearnings}\n\n## 🔧 Nezha CLI Commands\n${tableDocs}\n`;
        logger.info('[InterReview] Using fallback knowledge (priority learnings + table docs)');
      } catch (err) {
        logger.warn('[InterReview] Failed to load fallback knowledge:', err);
      }
    }

    // Build the system prompt with skill content or fallback
    const systemKnowledge = skillContent || fallbackKnowledge;

    const prompt = `${systemKnowledge}\n\n## Review Context\n${context}\n\n## Your Task\nAnalyze the code changes and provide feedback. But more importantly - EXTRACT LEARNING POINTS that can help the AI avoid similar issues in the future.

## Test Detection (Important!)
Carefully check if test files are included in the changes:
- Look for files matching: *.test.ts, *.test.js, *.spec.ts, *.spec.js, *.e2e.ts, etc.
- Check for test directories: __tests__/, test/, tests/
- Look for Python tests: test_*.py, *_test.py
- Consider if the code changes are properly tested
- Set testCoverageScore based on ACTUAL test presence (0-100)

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

## Test Coverage Score Guidelines
- 90-100: Comprehensive tests included with the changes
- 70-89: Some tests included, but could be more thorough
- 50-69: Minimal or basic tests only
- 0-49: No tests detected or changes not tested

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
      const reviewResult = this.parseReviewResponse(response);
      return { reviewResult, rawResponse: response };
    } catch {
      const fallbackResult = this.fallbackReview(context);
      return { reviewResult: fallbackResult, rawResponse: context };
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
      const diff = getCommitDiff(row.commit_hash);
      if (diff.stat && diff.content) {
        context += `## Commit: ${row.commit_hash}\n\`\`\`\n${diff.stat}\n\`\`\`\n\n`;
        context += `## Full Diff\n\`\`\`diff\n${diff.content}\n\`\`\`\n`;
      } else {
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

  private async getPriorityLearnings(): Promise<string> {
    try {
      const result = await this.db.query<{ content: string }>(
        `SELECT content FROM memory WHERE tags @> ARRAY['essential'] OR tags @> ARRAY['tool-discovery'] \n         ORDER BY importance DESC NULLS LAST LIMIT 10`
      );
      return result.rows.map(r => `- ${r.content.slice(0, 150)}`).join('\n');
    } catch (err) {
      logger.warn('[InterReview] Failed to get priority learnings:', err);
      return 'Priority learnings not available';
    }
  }

  private async getTableDocs(): Promise<string> {
    try {
      const result = await this.db.query<{ table_name: string; purpose: string; cli_commands: Array<{cmd: string; desc: string}> }>(
        `SELECT table_name, purpose, cli_commands FROM table_documentation \n         WHERE ai_can_modify = true LIMIT 15`
      );
      return result.rows.map(r => {
        const cmds = r.cli_commands?.map((c: any) => c.cmd).join(', ') || '';
        return `- **${r.table_name}**: ${r.purpose} (${cmds})`;
      }).join('\n');
    } catch (err) {
      logger.warn('[InterReview] Failed to get table docs:', err);
      return 'Table documentation not available';
    }
  }

  private async callReviewAI(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.callAI(systemPrompt, userPrompt);
  }

  private parseReviewResponse(response: string): ReviewResult {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        const findings: ReviewFinding[] = [];

        if (Array.isArray(parsed.findings)) {
          findings.push(
            ...parsed.findings.map((f: Record<string, unknown>) => ({
              type: f.type || 'suggestion',
              severity: f.severity || 'medium',
              file: f.file,
              line: f.line,
              message: f.message || '',
              suggestion: f.suggestion,
            }))
          );
        }

        if (Array.isArray(parsed.issues)) {
          findings.push(
            ...parsed.issues.map((f: Record<string, unknown>) => ({
              type: 'issue' as const,
              severity: f.severity || 'medium',
              file: f.file,
              line: f.line,
              message: f.issue || f.description || '',
            }))
          );
        }

        if (Array.isArray(parsed.suggestions)) {
          findings.push(
            ...parsed.suggestions.map((s: Record<string, unknown>) => ({
              type: 'suggestion' as const,
              severity: s.severity || 'medium',
              file: s.file,
              line: s.line,
              message: s.suggestion || '',
              suggestion: s.suggestion,
            }))
          );
        }

        if (Array.isArray(parsed.praise)) {
          findings.push(
            ...parsed.praise.map((p: Record<string, unknown>) => ({
              type: 'praise' as const,
              severity: 'low' as const,
              message: typeof p === 'string' ? p : p.praise || '',
            }))
          );
        }

        return {
          reviewId: '',
          summary: parsed.summary || 'No summary provided',
          findings,
          learnings: (parsed.learnings || []).map((l: Record<string, string>) => ({
            topic: l.topic || 'general',
            reminder: l.reminder || (typeof l === 'string' ? l : ''),
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

  private detectTestFiles(context: string): { hasTests: boolean; testFiles: string[] } {
    const testFiles: string[] = [];
    
    // Match diff headers to find changed files
    const diffFilePattern = /^diff --git a\/(.+?) b\/(.+?)$/gm;
    let match: RegExpExecArray | null;
    
    while ((match = diffFilePattern.exec(context)) !== null) {
      const fileA = match[1];
      const fileB = match[2];
      const filePath = fileB || fileA;
      if (filePath && this.isTestFile(filePath)) {
        testFiles.push(filePath);
      }
    }
    
    // Also check for test patterns in the context more broadly
    const allFilePattern = /[\w\/\-]+\.(test|spec|e2e)\.[tj]sx?|__tests?__\/[\w\/\-]+\.[tj]sx?|tests?\/[\w\/\-]+\.[tj]sx?|test_[\w\/\-]+\.py|[\w\/\-]+_test\.py/gi;
    let fileMatch: RegExpExecArray | null;
    
    while ((fileMatch = allFilePattern.exec(context)) !== null) {
      const filePath = fileMatch[0];
      if (!testFiles.includes(filePath)) {
        testFiles.push(filePath);
      }
    }
    
    return {
      hasTests: testFiles.length > 0,
      testFiles,
    };
  }
  
  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.test\.[tj]sx?$/,     // *.test.ts, *.test.js, *.test.tsx, *.test.jsx
      /\.spec\.[tj]sx?$/,     // *.spec.ts, *.spec.js, *.spec.tsx, *.spec.jsx
      /\.e2e\.[tj]sx?$/,      // *.e2e.ts, *.e2e.js
      /__tests?__\//,           // __tests__/ directory
      /^[\w\/]*tests?\//,      // test/ or tests/ directory at start
      /\/tests?\//,             // /test/ or /tests/ anywhere
      /test_[\w]+\.py$/,       // test_*.py (Python)
      /[\w]+_test\.py$/,       // *_test.py (Python)
      /Test\.java$/,            // *Test.java
      /Tests\.cs$/,             // *Tests.cs
    ];
    
    return testPatterns.some(pattern => pattern.test(filePath));
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

    const testDetection = this.detectTestFiles(context);
    
    if (!testDetection.hasTests) {
      suggestions.push({
        type: 'suggestion',
        severity: 'medium',
        message: 'No test files detected in changes - consider adding test coverage',
      });
    } else {
      suggestions.push({
        type: 'praise',
        severity: 'low',
        message: `Test files detected (${testDetection.testFiles.length}): ${testDetection.testFiles.slice(0, 3).join(', ')}${testDetection.testFiles.length > 3 ? '...' : ''}`,
      });
    }

    const testCoverageScore = testDetection.hasTests ? 75 : 40;

    return {
      reviewId: '',
      summary: 'Review completed with basic checks',
      findings: [...issues, ...suggestions],
      learnings: [],
      overallScore: 70,
      codeQualityScore: 70,
      testCoverageScore,
      documentationScore: context.includes('docs') || context.includes('comment') ? 75 : 60,
    };
  }

  async respondToReview(
    reviewId: string,
    response: string,
    acceptedSuggestions: string[] = [],
    options?: {
      reviewedBy?: string;
      status?: 'accepted' | 'rejected' | 'partial' | 'superseded';
      leverageRatio?: number;
      reworkCount?: number;
      effortMinutes?: number;
    }
  ): Promise<void> {
    try {
      await this.db.query(`SELECT respond_to_inter_review($1, $2, $3, $4, $5, $6, $7, $8)`, [
        reviewId,
        response,
        JSON.stringify(acceptedSuggestions),
        options?.reviewedBy || null,
        options?.status || 'accepted',
        options?.leverageRatio || null,
        options?.reworkCount || 0,
        options?.effortMinutes || null,
      ]);

      logger.info(`[InterReview] Response recorded for review: ${reviewId}`);
      this.emit(InterReviewEvent.REVIEW_RESPONSE, { reviewId, response });
    } catch (err) {
      logger.error(`Failed to save review response for ${reviewId}:`, err);
      throw err;
    }
  }

  async submitReviewResponse(
    reviewId: string,
    summary: string,
    findings: ReviewFinding[],
    scores: {
      overall?: number;
      codeQuality?: number;
      testCoverage?: number;
      documentation?: number;
    },
    response?: string,
    acceptedSuggestions?: string[],
    options?: {
      reviewedBy?: string;
      status?: 'accepted' | 'rejected' | 'partial' | 'superseded';
      leverageRatio?: number;
      reworkCount?: number;
      effortMinutes?: number;
    }
  ): Promise<void> {
    const logContext = {
      reviewId,
      hasResponse: !!response,
      acceptedCount: acceptedSuggestions?.length ?? 0,
    };
    logger.debug(`[InterReview] submitReviewResponse started:`, logContext);

    try {
      await this.db.query('BEGIN');
      logger.debug(`[InterReview] Transaction started for review: ${reviewId}`);

      const currentIdentity = await AgentIdentityService.getResolvedIdentity();
      const reviewedBy = currentIdentity.id;

      await this.db.query(
        `SELECT update_inter_review($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          reviewId,
          'completed',
          summary,
          JSON.stringify(findings),
          JSON.stringify(findings.filter(f => f.type === 'suggestion')),
          JSON.stringify(findings.filter(f => f.type === 'issue')),
          JSON.stringify(findings.filter(f => f.type === 'praise')),
          scores.overall ?? null,
          scores.codeQuality ?? null,
          scores.testCoverage ?? null,
          scores.documentation ?? null,
          null,
          reviewedBy,
        ]
      );
      logger.debug(`[InterReview] update_inter_review completed for: ${reviewId} (reviewed_by: ${reviewedBy})`);

      if (response || acceptedSuggestions) {
        await this.db.query(`SELECT respond_to_inter_review($1, $2, $3, $4, $5, $6, $7, $8)`, [
          reviewId,
          response || null,
          JSON.stringify(acceptedSuggestions || []),
          options?.reviewedBy || null,
          options?.status || 'accepted',
          options?.leverageRatio || null,
          options?.reworkCount || 0,
          options?.effortMinutes || null,
        ]);
        logger.debug(`[InterReview] respond_to_inter_review completed for: ${reviewId}`);
      }

      await this.db.query('COMMIT');
      logger.info(
        `[InterReview] Review response submitted successfully for review: ${reviewId}`,
        logContext
      );
      this.emit(InterReviewEvent.REVIEW_COMPLETED, { reviewId });
    } catch (err) {
      logger.error(
        `[InterReview] Failed to submit review response for ${reviewId}, rolling back:`,
        err
      );
      try {
        await this.db.query('ROLLBACK');
        logger.debug(`[InterReview] Transaction rolled back for review: ${reviewId}`);
      } catch (rollbackErr) {
        logger.error(`[InterReview] Rollback failed for review ${reviewId}:`, rollbackErr);
      }
      throw err;
    }
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
    for (const [index, learning] of result.learnings.entries()) {
      logger.info(
        `[InterReview] Saving learning ${index + 1}/${result.learnings.length}: ${learning.topic}`
      );
      try {
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
            ['learning', 'review', learning.topic, 'ai-generated'],
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

        const skillName = `review-learning-${learning.topic.toLowerCase().replace(/\s+/g, '-')}`;
        const existing = await this.db.query<{ id: string }>(
          `SELECT id FROM skills WHERE name = $1`,
          [skillName]
        );

        if (existing.rows.length > 0) {
          await this.db.query(
            `UPDATE skills SET content = $2, updated_at = NOW() WHERE name = $1`,
            [skillName, JSON.stringify({ markdown: skillContent })]
          );
        } else {
          await this.db.query(
            `INSERT INTO skills (id, name, content, version, source, created_at, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, '1.0', 'ai-built', NOW(), NOW())`,
            [skillName, JSON.stringify({ markdown: skillContent })]
          );
        }

        logger.info(`[InterReview] Saved learning to memory and skill: ${learning.topic}`);
      } catch (error) {
        logger.error(`[InterReview] Failed to save learning ${learning.topic}:`, error);
      }
    }
  }

  private normalizeTaskTitle(title: string): string {
    return title.replace(/^\[(?:RETRY|issue|Issue|DLQ|dlq)\]\s*/gi, '').trim();
  }

  private static readonly MAX_TASKS_PER_REVIEW = 3;
  private static readonly SYSTEM_LOAD_THRESHOLD = 20;

  private async checkSystemLoad(): Promise<{ isOverloaded: boolean; pendingCount: number }> {
    const result = await this.db.query<{ pending_count: string }>(
      `SELECT COUNT(*) as pending_count FROM tasks WHERE status IN ('PENDING', 'RUNNING')`
    );
    const pendingCount = parseInt(result.rows[0]?.pending_count || '0', 10);
    return {
      isOverloaded: pendingCount >= InterReviewService.SYSTEM_LOAD_THRESHOLD,
      pendingCount,
    };
  }

  private async createTasksFromFindings(result: ReviewResult, taskId?: string): Promise<number> {
    const severityPriority = { critical: 90, high: 75, medium: 50, low: 25, info: 10 };
    let createdCount = 0;

    const { isOverloaded, pendingCount } = await this.checkSystemLoad();
    logger.info(
      `[InterReview] System load check: ${pendingCount} pending tasks, overloaded=${isOverloaded}`
    );

    const eligibleFindings = result.findings.filter(f => {
      if (f.type === 'praise' || f.type === 'question') return false;
      if (isOverloaded && f.severity !== 'critical' && f.severity !== 'high') return false;
      return true;
    });

    const findingsToProcess = eligibleFindings.slice(0, InterReviewService.MAX_TASKS_PER_REVIEW);
    const skippedCount = eligibleFindings.length - findingsToProcess.length;
    if (skippedCount > 0) {
      logger.info(
        `[InterReview] Skipped ${skippedCount} findings due to task limit or system load`
      );
    }

    for (const finding of findingsToProcess) {
      const priority = severityPriority[finding.severity] || 30;
      const msg = finding.message || finding.suggestion || finding.file || 'Review finding';
      const title = `[${finding.type}] ${msg.substring(0, 100)}`;
      const normalizedTitle = this.normalizeTaskTitle(title);

      const existingTask = await this.db.query<{ id: string }>(
        `SELECT id FROM tasks WHERE (title = $1 OR title ILIKE $2) AND status IN ('PENDING', 'RUNNING') LIMIT 1`,
        [title, `%${normalizedTitle}`]
      );

      if (existingTask.rows.length > 0) {
        logger.info(
          `[InterReview] Skipping duplicate finding (task exists): ${title.substring(0, 50)}`
        );
        continue;
      }

      const recentTask = await this.db.query<{ id: string }>(
        `SELECT id FROM tasks WHERE (title = $1 OR title ILIKE $2) AND status = 'COMPLETED' AND completed_at > NOW() - INTERVAL '7 days' LIMIT 1`,
        [title, `%${normalizedTitle}`]
      );

      if (recentTask.rows.length > 0) {
        logger.info(
          `[InterReview] Skipping recently completed finding (last 7 days): ${title.substring(0, 50)}`
        );
        continue;
      }

      const description = `**Severity**: ${finding.severity}
**Source**: Inter-Review (Score: ${result.overallScore}/100)
${finding.file ? `**File**: ${finding.file}${finding.line ? `:${finding.line}` : ''}` : ''}
${finding.code ? `**Code**:\n\`\`\`\n${finding.code}\n\`\`\`` : ''}
${finding.suggestion ? `**Suggestion**:\n${finding.suggestion}` : ''}
${taskId ? `\n**Related Task**: ${taskId}` : ''}`;

      try {
        const sessionId = this.getSessionId();
        await this.db.query(
          `INSERT INTO tasks (id, title, description, status, priority, category, tags, created_at, updated_at, session_id, created_by)
           VALUES (uuid_generate_v4(), $1, $2, 'PENDING', $3, 'review', ARRAY['review', $4, $5], NOW(), NOW(), $6::VARCHAR, COALESCE($6::VARCHAR, 'human'))`,
          [title, description, priority, finding.type, finding.severity, sessionId]
        );
        createdCount++;
        logger.info(`[InterReview] Created task from finding: ${title.substring(0, 50)}`);
      } catch (err) {
        logger.warn(`[InterReview] Failed to create task: ${err}`);
      }
    }

    return createdCount;
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

  private async suggestPromptUpdatesFromLearnings(
    result: ReviewResult,
    taskId?: string
  ): Promise<void> {
    const selfImprovement = getSelfImprovement(this.db);

    for (const learning of result.learnings) {
      if (this.isPromptWorthyLearning(learning)) {
        try {
          await selfImprovement.remember({
            lesson: learning.reminder,
            fromTask: taskId || 'inter-review',
            tags: ['review-learning', learning.topic.toLowerCase().replace(/\s+/g, '-')],
          });
          logger.info(`[InterReview] Created self-improvement reminder for: ${learning.topic}`);
        } catch (error) {
          logger.debug(`[InterReview] Could not create prompt suggestion:`, error);
        }
      }
    }
  }

  private isPromptWorthyLearning(learning: Learning): boolean {
    const highValueTopics = [
      'typescript',
      'patterns',
      'architecture',
      'database',
      'error-handling',
      'testing',
      'async',
      'memory',
    ];
    const topic = learning.topic.toLowerCase();
    const reminder = learning.reminder.toLowerCase();
    return (
      highValueTopics.some(t => topic.includes(t)) ||
      learning.reminder.length > 50 ||
      reminder.includes('always') ||
      reminder.includes('never') ||
      reminder.includes('must')
    );
  }
}
