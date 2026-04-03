import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import { AgentIdentityService } from '../services/AgentIdentityService.js';
import { gitHubService } from '../services/GitHubService.js';

export interface ReflectionConfig {
  reflectOnComplete?: boolean;
  reflectOnFail?: boolean;
  reflectOnFakeComplete?: boolean;
  minDurationForReflection?: number;
  createIssueOnPattern?: boolean;
  syncToGitHub?: boolean;
  githubRepo?: string;
  db?: DatabaseClient;
}

interface ReflectionResult {
  success: boolean;
  learning?: string;
  issue?: string;
  severity?: string;
}

export class ReflectionPlugin implements Plugin {
  name = 'reflection';
  version = '1.1.0';
  description = 'Triggers automatic reflection after task completion';
  config: Required<Omit<ReflectionConfig, 'db'>>;
  private db: DatabaseClient | null = null;

  constructor(config: ReflectionConfig = {}) {
    this.config = {
      reflectOnComplete: config.reflectOnComplete ?? true,
      reflectOnFail: config.reflectOnFail ?? true,
      reflectOnFakeComplete: config.reflectOnFakeComplete ?? true,
      minDurationForReflection: config.minDurationForReflection ?? 10000,
      createIssueOnPattern: config.createIssueOnPattern ?? true,
      syncToGitHub: config.syncToGitHub ?? true,
      githubRepo: config.githubRepo ?? 'emptist/nezha',
    };
    this.db = config.db ?? null;
  }

  setDatabaseClient(db: DatabaseClient): void {
    this.db = db;
  }

  hooks = {
    afterTask: async (context: TaskContext) => {
      if (!this.shouldReflect(context)) return;

      const reflection = await this.reflect(context);

      if (reflection.learning) {
        logger.info(`[Reflection] ${context.taskId}: ${reflection.learning}`);
      }

      if (reflection.issue && this.config.createIssueOnPattern) {
        await this.createIssue(context, reflection.issue, reflection.severity ?? 'medium');
      }
    },

    onError: async (context: TaskContext, error: Error) => {
      if (!this.config.reflectOnFail) return;

      const reflection = await this.reflectOnError(context, error);

      if (reflection.issue && this.config.createIssueOnPattern) {
        await this.createIssue(context, reflection.issue, reflection.severity ?? 'medium', {
          errorMessage: error.message,
          stack: error.stack,
        });
      }
    },
  };

  private shouldReflect(context: TaskContext): boolean {
    if (context.status === 'COMPLETED' && !this.config.reflectOnComplete) return false;
    if (context.status === 'FAILED' && !this.config.reflectOnFail) return false;
    if (context.status === 'FAKE_COMPLETE' && !this.config.reflectOnFakeComplete) return false;

    if (context.startTime && context.endTime) {
      const duration = context.endTime.getTime() - context.startTime.getTime();
      return duration >= this.config.minDurationForReflection;
    }

    return true;
  }

  private async reflect(context: TaskContext): Promise<ReflectionResult> {
    const result: ReflectionResult = { success: true };

    if (context.result) {
      if (typeof context.result === 'string' && context.result.includes('already')) {
        result.learning = `Task "${context.title}" was already completed - system working as intended`;
      }

      if (typeof context.result === 'object' && context.result !== null) {
        const res = context.result as Record<string, unknown>;
        if (res.noChangesNeeded === true) {
          result.learning = `Task "${context.title}" found no changes needed - existing implementation adequate`;
        }
      }
    }

    if (context.title.toLowerCase().includes('fix') && context.status === 'COMPLETED') {
      result.learning = `Fixed issue successfully - remember pattern for future similar issues`;
    }

    return result;
  }

  private async reflectOnError(context: TaskContext, error: Error): Promise<ReflectionResult> {
    const result: ReflectionResult = { success: false };

    if (error.message.includes('ECONNREFUSED') || error.message.includes('connection refused')) {
      result.issue = `Connection error in ${context.title} - may need retry logic or service check`;
      result.severity = 'high';
    } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      result.issue = `Timeout error in ${context.title} - may need increased timeout or optimization`;
      result.severity = 'medium';
    } else if (error.message.includes('ENOENT') || error.message.includes('not found')) {
      result.issue = `Resource not found in ${context.title} - check paths and dependencies`;
      result.severity = 'medium';
    } else if (error.message.includes('permission') || error.message.includes('access denied')) {
      result.issue = `Permission error in ${context.title} - check access rights`;
      result.severity = 'high';
    } else if (error.message.includes('memory') || error.message.includes('heap')) {
      result.issue = `Memory error in ${context.title} - may need resource optimization`;
      result.severity = 'critical';
    } else {
      result.issue = `Error in ${context.title}: ${error.message.substring(0, 100)}`;
      result.severity = 'medium';
    }

    return result;
  }

  private async createIssue(
    context: TaskContext,
    title: string,
    severity: string,
    extra?: { errorMessage?: string; stack?: string }
  ): Promise<void> {
    if (!this.db) {
      logger.warn('[Reflection] No database client - cannot create issue');
      return;
    }

    try {
      const agentId = (await AgentIdentityService.getResolvedIdentity()).id;
      const id = crypto.randomUUID();

      const duplicateCheck = await this.db.query(
        `SELECT id FROM issues 
         WHERE title = $1 AND status = 'open' 
         AND created_at > NOW() - INTERVAL '1 hour'`,
        [title]
      );

      if (duplicateCheck.rows.length > 0) {
        logger.info(`[Reflection] Duplicate issue skipped: ${title.substring(0, 50)}`);
        return;
      }

      const description = extra?.errorMessage
        ? `Error: ${extra.errorMessage}\n\nContext:\nTask: ${context.title}\nID: ${context.taskId}`
        : `Task: ${context.title}\nID: ${context.taskId}`;

      await this.db.query(
        `INSERT INTO issues (id, title, description, issue_type, severity, status, discovered_by, tags, metadata)
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8)`,
        [
          id,
          title,
          description,
          'bug',
          severity,
          agentId,
          ['auto-discovered', 'reflection-plugin'],
          JSON.stringify({
            source: 'reflection-plugin',
            taskId: context.taskId,
            stack: extra?.stack?.substring(0, 500),
          }),
        ]
      );

      logger.info(`[Reflection] Created DB issue: ${title.substring(0, 50)}`);

      if (this.config.syncToGitHub && gitHubService.isEnabled()) {
        const shouldSyncToGitHub = ['critical', 'high'].includes(severity);
        if (shouldSyncToGitHub) {
          const parts = this.config.githubRepo.split('/');
          const owner = parts[0] ?? 'emptist';
          const repo = parts[1] ?? 'nezha';
          const body = `${description}\n\n---\n*Auto-created by Nezha AI from task: ${context.taskId}*`;
          try {
            const githubIssue = await gitHubService.createIssue({
              owner,
              repo,
              title: `[AI] ${title}`,
              body,
              labels: ['nezha-ai', severity],
            });
            await this.db.query(
              `UPDATE issues SET metadata = jsonb_set(metadata, '{github_url}', $1) WHERE id = $2`,
              [JSON.stringify(githubIssue.html_url), id]
            );
            logger.info(`[Reflection] Synced to GitHub: ${githubIssue.html_url}`);
          } catch (err) {
            logger.error('[Reflection] Failed to sync to GitHub:', err);
          }
        }
      }
    } catch (error) {
      logger.error('[Reflection] Failed to create issue:', error);
    }
  }
}
