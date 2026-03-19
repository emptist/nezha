import { EventBus } from '../core/EventBus.js';
import { SCHEDULER_EVENTS } from '../core/Scheduler.js';
import { InterReviewService, type ReviewRequest } from './InterReviewService.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
// Config imported for potential future use
import { logger } from '../utils/logger.js';
import { execSync } from 'child_process';

export interface AutoReviewConfig {
  enabled: boolean;
  minScoreThreshold?: number;
  reviewOnFailure?: boolean;
  reviewOnSuccess?: boolean;
  reviewerId: string;
}

export class AutoReviewService {
  private readonly eventBus: EventBus;
  private readonly reviewService: InterReviewService;
  private readonly config: AutoReviewConfig;
  private isListening: boolean = false;

  constructor(eventBus: EventBus, db: DatabaseClient, config?: Partial<AutoReviewConfig>) {
    this.eventBus = eventBus;
    this.reviewService = new InterReviewService(db);
    this.config = {
      enabled: config?.enabled ?? true,
      minScoreThreshold: config?.minScoreThreshold ?? 0,
      reviewOnFailure: config?.reviewOnFailure ?? true,
      reviewOnSuccess: config?.reviewOnSuccess ?? true,
      reviewerId: config?.reviewerId ?? `nezha-auto-${Date.now()}`,
    };
  }

  start(): void {
    if (this.isListening) {
      logger.warn('[AutoReview] Already listening for events');
      return;
    }

    if (!this.config.enabled) {
      logger.debug('[AutoReview] Disabled, skipping event subscription');
      return;
    }

    this.eventBus.subscribe(SCHEDULER_EVENTS.TASK_COMPLETED, this.handleTaskCompleted.bind(this));
    this.eventBus.subscribe(SCHEDULER_EVENTS.TASK_FAILED, this.handleTaskFailed.bind(this));
    this.isListening = true;

    logger.info('[AutoReview] Started - listening for task events');
  }

  stop(): void {
    if (!this.isListening) {
      return;
    }

    if (this.config.enabled) {
      this.eventBus.unsubscribe(SCHEDULER_EVENTS.TASK_COMPLETED, this.handleTaskCompleted.bind(this));
      this.eventBus.unsubscribe(SCHEDULER_EVENTS.TASK_FAILED, this.handleTaskFailed.bind(this));
    }
    this.isListening = false;

    logger.info('[AutoReview] Stopped');
  }

  private async handleTaskCompleted(event: unknown): Promise<void> {
    if (!this.config.enabled || !this.config.reviewOnSuccess) {
      return;
    }

    const data = event as { taskId: string; title: string; result?: unknown };
    try {
      await this.triggerReview(data.taskId, data.title, 'completed');
    } catch (error) {
      logger.error('[AutoReview] Failed to trigger review:', error);
    }
  }

  private async handleTaskFailed(event: unknown): Promise<void> {
    if (!this.config.enabled || !this.config.reviewOnFailure) {
      return;
    }

    const data = event as { taskId: string; title: string; error?: string };
    try {
      await this.triggerReview(data.taskId, data.title, 'failed', data.error);
    } catch (error) {
      logger.error('[AutoReview] Failed to trigger review:', error);
    }
  }

  private async triggerReview(
    taskId: string,
    title: string,
    taskStatus: string,
    error?: string
  ): Promise<void> {
    const commitHash = this.getCurrentCommit();
    const branch = this.getCurrentBranch();
    const files = this.getChangedFiles();

    const request: ReviewRequest = {
      taskId,
      commitHash,
      branch,
      reviewerId: this.config.reviewerId,
      context: {
        changes: `Task ${taskStatus}: ${title}`,
        files,
        taskDescription: title,
        message: `Auto-review triggered by ${taskStatus} task`,
      },
    };

    logger.info(`[AutoReview] Requesting review for task: ${taskId}`);

    const reviewId = await this.reviewService.requestReview(request);

    const prompt = `You are a senior code reviewer with expertise in TypeScript, Node.js, and software best practices.

The following task just ${taskStatus}:
- Task: ${title}
- Task ID: ${taskId}
${error ? `- Error: ${error}` : ''}

Review the code changes and provide constructive feedback. Focus on:
1. Code quality and best practices
2. Potential bugs or issues
3. Test coverage
4. Documentation

Be thorough but constructive.`;

    try {
      const result = await this.reviewService.performReview(reviewId, prompt);
      logger.info(`[AutoReview] Review completed: ${reviewId} (score: ${result.overallScore})`);

      if (result.overallScore < this.config.minScoreThreshold!) {
        logger.warn(
          `[AutoReview] Review score ${result.overallScore} below threshold ${this.config.minScoreThreshold}`
        );
      }
    } catch (error) {
      logger.error(`[AutoReview] Review failed for ${reviewId}:`, error);
    }
  }

  private getCurrentCommit(): string | undefined {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return undefined;
    }
  }

  private getCurrentBranch(): string {
    try {
      return execSync('git branch --show-current', { encoding: 'utf-8' }).trim() || 'main';
    } catch {
      return 'main';
    }
  }

  private getChangedFiles(): string[] {
    try {
      const diff = execSync('git diff --name-only', { encoding: 'utf-8' }).trim();
      return diff ? diff.split('\n') : [];
    } catch {
      return [];
    }
  }
}
