import { execSync } from 'child_process';
import { mkdirSync, cpSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export type GitOperationRisk = 'safe' | 'warning' | 'dangerous';

export interface GitOperationCheck {
  operation: string;
  risk: GitOperationRisk;
  requiresBackup: boolean;
  requiresApproval: boolean;
  reason: string;
}

export interface GitSafetyConfig {
  enableBackup: boolean;
  backupDir: string;
  requireApprovalForDangerous: boolean;
  logOperations: boolean;
}

const SAFE_OPERATIONS = [
  'git status',
  'git diff',
  'git log',
  'git show',
  'git branch',
  'git rev-parse',
  'git ls-files',
  'git remote',
  'git config',
  'git describe',
  'git tag -l',
  'git stash list',
];

const WARNING_OPERATIONS = [
  'git add',
  'git commit',
  'git push',
  'git pull',
  'git fetch',
  'git merge',
  'git stash',
  'git checkout',
  'git switch',
];

const DANGEROUS_OPERATIONS = [
  'git filter-branch',
  'git rebase',
  'git reset --hard',
  'git push --force',
  'git push -f',
  'git clean -fd',
  'git gc --prune=now',
  'git reflog expire',
  'git update-ref',
];

const DANGEROUS_PATTERNS = [
  /filter-branch/,
  /rebase/,
  /push\s+--force/,
  /push\s+-f/,
  /reset\s+--hard/,
  /clean\s+-fd/,
  /gc\s+--prune/,
  /reflog\s+expire/,
  /update-ref/,
];

export class GitSafetyService {
  private config: GitSafetyConfig;
  private operationLog: Array<{ timestamp: Date; operation: string; risk: GitOperationRisk }> = [];

  constructor(config: Partial<GitSafetyConfig> = {}) {
    this.config = {
      enableBackup: config.enableBackup ?? true,
      backupDir: config.backupDir ?? '.tmp/git-backup',
      requireApprovalForDangerous: config.requireApprovalForDangerous ?? true,
      logOperations: config.logOperations ?? true,
    };
  }

  checkOperation(command: string): GitOperationCheck {
    const normalizedCmd = command.trim().toLowerCase();

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(normalizedCmd)) {
        return {
          operation: command,
          risk: 'dangerous',
          requiresBackup: true,
          requiresApproval: true,
          reason: `Matches dangerous pattern: ${pattern.source}`,
        };
      }
    }

    for (const op of DANGEROUS_OPERATIONS) {
      if (normalizedCmd.startsWith(op.toLowerCase())) {
        return {
          operation: command,
          risk: 'dangerous',
          requiresBackup: true,
          requiresApproval: true,
          reason: `Dangerous operation: ${op}`,
        };
      }
    }

    for (const op of WARNING_OPERATIONS) {
      if (normalizedCmd.startsWith(op.toLowerCase())) {
        return {
          operation: command,
          risk: 'warning',
          requiresBackup: false,
          requiresApproval: false,
          reason: `Write operation: ${op}`,
        };
      }
    }

    for (const op of SAFE_OPERATIONS) {
      if (normalizedCmd.startsWith(op.toLowerCase())) {
        return {
          operation: command,
          risk: 'safe',
          requiresBackup: false,
          requiresApproval: false,
          reason: `Read-only operation: ${op}`,
        };
      }
    }

    return {
      operation: command,
      risk: 'warning',
      requiresBackup: false,
      requiresApproval: false,
      reason: 'Unknown operation - treating as warning',
    };
  }

  createBackup(reason: string): string | null {
    if (!this.config.enableBackup) {
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = join(this.config.backupDir, `backup-${timestamp}`);

      mkdirSync(backupPath, { recursive: true });

      const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf-8' }).trim();
      const workTree = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();

      if (existsSync(gitDir)) {
        cpSync(gitDir, join(backupPath, '.git'), { recursive: true });
      }

      const manifestPath = join(backupPath, 'manifest.json');
      const manifest = {
        timestamp: new Date().toISOString(),
        reason,
        workTree,
        gitDir,
        branch: this.getCurrentBranch(),
        commit: this.getCurrentCommit(),
      };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      logger.info(`[GitSafety] Backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      logger.error(
        `[GitSafety] Failed to create backup: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  logOperation(operation: string, risk: GitOperationRisk): void {
    if (!this.config.logOperations) {
      return;
    }

    const entry = {
      timestamp: new Date(),
      operation,
      risk,
    };

    this.operationLog.push(entry);

    if (risk === 'dangerous') {
      logger.warn(`[GitSafety] DANGEROUS operation logged: ${operation}`);
    } else if (risk === 'warning') {
      logger.debug(`[GitSafety] Operation logged: ${operation}`);
    }
  }

  getOperationLog(): Array<{ timestamp: Date; operation: string; risk: GitOperationRisk }> {
    return [...this.operationLog];
  }

  getCurrentBranch(): string {
    try {
      return execSync('git branch --show-current', { encoding: 'utf-8' }).trim() || 'main';
    } catch {
      return 'unknown';
    }
  }

  getCurrentCommit(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  isGitRepository(): boolean {
    try {
      execSync('git rev-parse --git-dir', { encoding: 'utf-8' });
      return true;
    } catch {
      return false;
    }
  }

  hasUncommittedChanges(): boolean {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      return status.trim().length > 0;
    } catch {
      return false;
    }
  }

  validateCommitMessage(message: string): { valid: boolean; reason: string } {
    if (!message || message.trim().length === 0) {
      return { valid: false, reason: 'Commit message is empty' };
    }

    if (message.length < 10) {
      return { valid: false, reason: 'Commit message is too short (min 10 chars)' };
    }

    if (message.length > 500) {
      return { valid: false, reason: 'Commit message is too long (max 500 chars)' };
    }

    const genericPatterns = [
      /^task completed:?\s*test\s*task$/i,
      /^test$/i,
      /^wip$/i,
      /^fix$/i,
      /^update$/i,
    ];

    for (const pattern of genericPatterns) {
      if (pattern.test(message.trim())) {
        return { valid: false, reason: `Generic commit message detected: "${message}"` };
      }
    }

    return { valid: true, reason: 'Valid commit message' };
  }

  getSafetyReport(): {
    totalOperations: number;
    safeCount: number;
    warningCount: number;
    dangerousCount: number;
    recentDangerous: Array<{ timestamp: Date; operation: string }>;
  } {
    const safeCount = this.operationLog.filter(e => e.risk === 'safe').length;
    const warningCount = this.operationLog.filter(e => e.risk === 'warning').length;
    const dangerousCount = this.operationLog.filter(e => e.risk === 'dangerous').length;
    const recentDangerous = this.operationLog
      .filter(e => e.risk === 'dangerous')
      .slice(-10)
      .map(e => ({ timestamp: e.timestamp, operation: e.operation }));

    return {
      totalOperations: this.operationLog.length,
      safeCount,
      warningCount,
      dangerousCount,
      recentDangerous,
    };
  }
}

export const gitSafetyService = new GitSafetyService();
