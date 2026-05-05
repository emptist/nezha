import { logger } from '../utils/logger.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGitHubIssueOptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export class GitHubService {
  private token: string | null = null;
  private baseUrl = 'https://api.github.com';
  private requestTimestamps: number[] = [];

  constructor() {
    this.token = process.env.GITHUB_TOKEN ?? null;
    if (!this.token) {
      logger.warn('[GitHub] GITHUB_TOKEN not set - GitHub integration disabled');
    }
  }

  isEnabled(): boolean {
    return this.token !== null;
  }

  private checkRateLimit(): void {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (this.requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      throw new Error(
        `GitHub API rate limit exceeded: ${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s`
      );
    }
    this.requestTimestamps.push(now);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new Error('GitHub token not configured');
    }

    this.checkRateLimit();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async createIssue(
    options: CreateGitHubIssueOptions,
    agentName?: string,
    agentId?: string
  ): Promise<GitHubIssue> {
    logger.info(`[GitHub] Creating issue: ${options.title}`);

    const signature = agentId
      ? `\n\n---\n*Created by ${agentName ?? 'Nezha AI'}*  \n*[Agent: ${agentId}]*`
      : agentName
        ? `\n\n---\n*Created by ${agentName} via Nezha AI*`
        : '\n\n---\n*Created via Nezha AI*';

    const issue = await this.request<GitHubIssue>(
      `/repos/${options.owner}/${options.repo}/issues`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: options.title,
          body: options.body + signature,
          labels: options.labels ?? [],
        }),
      }
    );

    logger.info(`[GitHub] Created issue #${issue.number}: ${issue.html_url}`);
    return issue;
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  }

  async searchIssues(owner: string, repo: string, query: string): Promise<GitHubIssue[]> {
    const result = await this.request<{ items: GitHubIssue[] }>(
      `/search/issues?q=${encodeURIComponent(`repo:${owner}/${repo} ${query}`)}`
    );
    return result.items;
  }

  async closeIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
  }

  async addLabel(owner: string, repo: string, issueNumber: number, label: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: [label] }),
    });
  }
}

export const gitHubService = new GitHubService();
