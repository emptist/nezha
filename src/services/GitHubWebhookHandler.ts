import { logger } from '../utils/logger.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import crypto from 'crypto';

export interface GitHubWebhookIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  user?: {
    login: string;
  };
  labels?: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
}

export interface GitHubWebhookPayload {
  action: string;
  issue: GitHubWebhookIssue;
  repository: {
    owner: { login: string };
    name: string;
  };
}

export class GitHubWebhookHandler {
  private db: DatabaseClient | null = null;
  private webhookSecret: string | null = null;

  constructor(webhookSecret?: string) {
    this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? webhookSecret ?? null;
  }

  setDatabaseClient(db: DatabaseClient): void {
    this.db = db;
  }

  verifySignature(payload: string, signature: string | undefined): boolean {
    if (!this.webhookSecret) {
      logger.warn('[GitHubWebhook] No secret configured - skipping verification');
      return true;
    }
    if (!signature) {
      return false;
    }
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  }

  async handleWebhook(payload: GitHubWebhookPayload): Promise<void> {
    if (!this.db) {
      logger.warn('[GitHubWebhook] No database client - skipping');
      return;
    }

    const { action, issue, repository } = payload;
    const repoFullName = `${repository.owner.login}/${repository.name}`;

    logger.info(`[GitHubWebhook] Received: ${action} on ${repoFullName}#${issue.number}`);

    switch (action) {
      case 'opened':
        await this.handleIssueOpened(issue, repoFullName);
        break;
      case 'closed':
        await this.handleIssueClosed(issue, repoFullName);
        break;
      case 'reopened':
        await this.handleIssueReopened(issue, repoFullName);
        break;
      case 'labeled':
        await this.handleIssueLabeled(issue, repoFullName);
        break;
      case 'unlabeled':
        await this.handleIssueUnlabeled(issue, repoFullName);
        break;
      default:
        logger.debug(`[GitHubWebhook] Unhandled action: ${action}`);
    }
  }

  private async handleIssueOpened(issue: GitHubWebhookIssue, repo: string): Promise<void> {
    if (!this.db) return;

    const id = crypto.randomUUID();
    const labelNames = issue.labels?.map(l => l.name) ?? [];

    await this.db.query(
      `INSERT INTO issues (id, title, description, issue_type, severity, status, discovered_by, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        `[GitHub] ${issue.title}`,
        `${issue.body ?? ''}\n\n---\n*From GitHub: ${issue.html_url}*`,
        'bug',
        labelNames.includes('critical')
          ? 'critical'
          : labelNames.includes('high')
            ? 'high'
            : 'medium',
        'open',
        `github:${issue.user?.login ?? 'unknown'}`,
        ['github-import', ...labelNames],
        JSON.stringify({
          source: 'github-webhook',
          github_url: issue.html_url,
          github_number: issue.number,
          repo: repo,
        }),
      ]
    );

    logger.info(`[GitHubWebhook] Created DB issue from GitHub #${issue.number}`);
  }

  private async handleIssueClosed(issue: GitHubWebhookIssue, repo: string): Promise<void> {
    if (!this.db) return;

    await this.db.query(
      `UPDATE issues 
       SET status = 'resolved', updated_at = NOW()
       WHERE metadata->>'github_number' = $1 AND metadata->>'repo' = $2`,
      [issue.number.toString(), repo]
    );

    logger.info(`[GitHubWebhook] Closed DB issue for GitHub #${issue.number}`);
  }

  private async handleIssueReopened(issue: GitHubWebhookIssue, repo: string): Promise<void> {
    if (!this.db) return;

    await this.db.query(
      `UPDATE issues 
       SET status = 'open', updated_at = NOW()
       WHERE metadata->>'github_number' = $1 AND metadata->>'repo' = $2`,
      [issue.number.toString(), repo]
    );

    logger.info(`[GitHubWebhook] Reopened DB issue for GitHub #${issue.number}`);
  }

  private async handleIssueLabeled(issue: GitHubWebhookIssue, repo: string): Promise<void> {
    if (!this.db) return;

    const labelNames = issue.labels?.map(l => l.name) ?? [];

    await this.db.query(
      `UPDATE issues 
       SET tags = $1, updated_at = NOW()
       WHERE metadata->>'github_number' = $2 AND metadata->>'repo' = $3`,
      [labelNames, issue.number.toString(), repo]
    );

    logger.info(
      `[GitHubWebhook] Updated labels for GitHub #${issue.number}: ${labelNames.join(', ')}`
    );
  }

  private async handleIssueUnlabeled(issue: GitHubWebhookIssue, repo: string): Promise<void> {
    if (!this.db) return;

    const labelNames = issue.labels?.map(l => l.name) ?? [];

    await this.db.query(
      `UPDATE issues 
       SET tags = $1, updated_at = NOW()
       WHERE metadata->>'github_number' = $2 AND metadata->>'repo' = $3`,
      [labelNames, issue.number.toString(), repo]
    );

    logger.info(
      `[GitHubWebhook] Updated labels for GitHub #${issue.number}: ${labelNames.join(', ')}`
    );
  }
}

export const gitHubWebhookHandler = new GitHubWebhookHandler();
