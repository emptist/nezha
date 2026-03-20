import { execSync } from 'child_process';
import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';
import { gitSafetyService } from '../services/GitSafetyService.js';

export interface GitAutoCommitConfig {
  autoPush?: boolean;
  commitMessagePrefix?: string;
  autoAdd?: boolean;
  useActualCommitMessage?: boolean;
  enableSafetyChecks?: boolean;
}

export class GitAutoCommitPlugin implements Plugin {
  name = 'git-auto-commit';
  version = '1.1.0';
  description = 'Auto commits and pushes changes after task completion with safety checks';
  config: Record<string, unknown>;
  private readonly autoPush: boolean;
  private readonly commitMessagePrefix: string;
  private readonly autoAdd: boolean;
  private readonly useActualCommitMessage: boolean;
  private readonly enableSafetyChecks: boolean;

  constructor(config: GitAutoCommitConfig = {}) {
    this.config = {
      autoPush: config.autoPush ?? true,
      commitMessagePrefix: config.commitMessagePrefix ?? 'Task completed:',
      autoAdd: config.autoAdd ?? true,
      useActualCommitMessage: config.useActualCommitMessage ?? true,
      enableSafetyChecks: config.enableSafetyChecks ?? true,
    };
    this.autoPush = config.autoPush ?? true;
    this.commitMessagePrefix = config.commitMessagePrefix ?? 'Task completed:';
    this.autoAdd = config.autoAdd ?? true;
    this.useActualCommitMessage = config.useActualCommitMessage ?? true;
    this.enableSafetyChecks = config.enableSafetyChecks ?? true;
  }

  private hasGitChanges(): boolean {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      return status.trim().length > 0;
    } catch (err) {
      logger.debug(
        `[GitAutoCommit] Failed to check git status: ${err instanceof Error ? err.message : 'Unknown'}`
      );
      return false;
    }
  }

  private getChangedFiles(): string[] {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      return status
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3).trim());
    } catch (err) {
      logger.debug(
        `[GitAutoCommit] Failed to get changed files: ${err instanceof Error ? err.message : 'Unknown'}`
      );
      return [];
    }
  }

  private getCommittedFiles(): string {
    try {
      const diff = execSync('git diff --cached --name-only', { encoding: 'utf-8' }).trim();
      return (
        diff
          .split('\n')
          .filter(f => f)
          .join(', ') || 'no files'
      );
    } catch {
      return 'no files';
    }
  }

  private getCommittedMessage(): string | null {
    try {
      const stagedDiff = execSync('git diff --cached', { encoding: 'utf-8' });
      if (stagedDiff.trim().length === 0) {
        return null;
      }

      const conventionalPrefixes = [
        'feat:',
        'fix:',
        'docs:',
        'test:',
        'refactor:',
        'chore:',
        'perf:',
        'ci:',
        'build:',
      ];

      const diffLines = stagedDiff.split('\n');
      let firstCodeLineFound = false;
      let inHunkHeader = false;

      for (const line of diffLines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('@@')) {
          inHunkHeader = true;
          continue;
        }

        if (
          trimmed.startsWith('diff ') ||
          trimmed.startsWith('index ') ||
          trimmed.startsWith('---') ||
          trimmed.startsWith('+++')
        ) {
          firstCodeLineFound = false;
          inHunkHeader = false;
          continue;
        }

        if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
          firstCodeLineFound = true;
        }

        if (firstCodeLineFound && !inHunkHeader) {
          const content = trimmed.replace(/^[+-]/, '');

          if (
            content.startsWith('#') ||
            content.startsWith('//') ||
            content.startsWith('*') ||
            content.startsWith('/*') ||
            content.startsWith('<!--')
          ) {
            continue;
          }

          for (const prefix of conventionalPrefixes) {
            if (content.startsWith(prefix)) {
              return (
                content.replace(/^['"]/, '').replace(/['"]$/, '').split('\n')[0]?.trim() ?? content
              );
            }
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private hasStagedChanges(): boolean {
    try {
      const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
      return staged.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async commitAndPush(taskTitle: string): Promise<void> {
    if (!this.hasGitChanges()) {
      logger.debug('[GitAutoCommit] No changes to commit');
      return;
    }

    if (this.enableSafetyChecks && !gitSafetyService.isGitRepository()) {
      logger.warn('[GitAutoCommit] Not a git repository, skipping commit');
      return;
    }

    const changedFiles = this.getChangedFiles();
    const filesStr =
      changedFiles.length > 5
        ? `${changedFiles.slice(0, 5).join(', ')}...`
        : changedFiles.join(', ');

    try {
      if (this.autoAdd) {
        if (this.enableSafetyChecks) {
          const check = gitSafetyService.checkOperation('git add -A');
          gitSafetyService.logOperation('git add -A', check.risk);
        }
        execSync('git add -A', { encoding: 'utf-8' });
        logger.debug('[GitAutoCommit] Added files to staging');
      }

      let commitMsg: string;

      if (this.useActualCommitMessage && this.hasStagedChanges()) {
        const actualMsg = this.getCommittedMessage();
        const committedFiles = this.getCommittedFiles();
        if (actualMsg) {
          const timestamp = new Date()
            .toISOString()
            .slice(0, 16)
            .replace(/[:-]/g, '')
            .replace('T', '-');
          const shortHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
          commitMsg = `${actualMsg}\n\nFiles: ${committedFiles}\n\nGenerated: ${timestamp}@${shortHash}`;
          logger.debug('[GitAutoCommit] Using actual commit message:', actualMsg);
        } else {
          commitMsg = `${this.commitMessagePrefix} ${taskTitle}\n\nFiles: ${filesStr}`;
        }
      } else {
        commitMsg = `${this.commitMessagePrefix} ${taskTitle}\n\nFiles: ${filesStr}`;
      }

      if (this.enableSafetyChecks) {
        const validation = gitSafetyService.validateCommitMessage(commitMsg.split('\n')[0] || '');
        if (!validation.valid) {
          logger.warn(`[GitSafety] Invalid commit message: ${validation.reason}`);
          const betterMsg = this.generateBetterCommitMessage(taskTitle, changedFiles);
          if (betterMsg) {
            commitMsg = betterMsg;
            logger.info(`[GitSafety] Using generated message: ${commitMsg.split('\n')[0]}`);
          }
        }
      }

      if (this.enableSafetyChecks) {
        const check = gitSafetyService.checkOperation('git commit');
        gitSafetyService.logOperation('git commit', check.risk);
      }

      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
      logger.info(`[GitAutoCommit] Committed: ${commitMsg.split('\n')[0]}`);

      if (this.autoPush) {
        if (this.enableSafetyChecks) {
          const check = gitSafetyService.checkOperation('git push');
          gitSafetyService.logOperation('git push', check.risk);
        }
        try {
          execSync('git push', { encoding: 'utf-8' });
          logger.info('[GitAutoCommit] Pushed to remote');
        } catch (pushError) {
          logger.warn(
            '[GitAutoCommit] Push failed (可能是分支保护或无远程仓库):',
            pushError instanceof Error ? pushError.message : String(pushError)
          );
        }
      }
    } catch (error) {
      logger.warn(
        '[GitAutoCommit] Commit failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private generateBetterCommitMessage(taskTitle: string, changedFiles: string[]): string | null {
    const fileTypes = new Set(
      changedFiles.map(f => {
        const ext = f.split('.').pop()?.toLowerCase();
        return ext || 'unknown';
      })
    );

    const prefixes: string[] = [];
    if (fileTypes.has('ts') || fileTypes.has('js')) {
      prefixes.push('feat');
    }
    if (fileTypes.has('md')) {
      prefixes.push('docs');
    }
    if (fileTypes.has('sql')) {
      prefixes.push('feat');
    }
    if (fileTypes.has('json') && changedFiles.some(f => f.includes('package'))) {
      prefixes.push('chore');
    }

    const prefix = prefixes[0] || 'chore';
    const cleanTitle = taskTitle.replace(/^(feat|fix|docs|chore|test|refactor):\s*/i, '');

    return `${prefix}: ${cleanTitle}\n\nFiles: ${changedFiles.slice(0, 5).join(', ')}${changedFiles.length > 5 ? '...' : ''}`;
  }

  hooks = {
    afterTask: async (context: TaskContext) => {
      if (context.status !== 'COMPLETED') {
        return;
      }

      logger.debug(`[GitAutoCommit] Task completed: ${context.title}`);
      await this.commitAndPush(context.title);
    },

    onStartup: async () => {
      logger.info('[GitAutoCommit] Git auto-commit plugin initialized (v1.1.0 with safety checks)');
      if (this.enableSafetyChecks) {
        const report = gitSafetyService.getSafetyReport();
        logger.info(`[GitSafety] Previous session: ${report.totalOperations} operations logged`);
      }
    },

    onShutdown: async () => {
      if (this.hasGitChanges()) {
        logger.warn('[GitAutoCommit] 有未提交的更改，关闭前尝试提交...');
        await this.commitAndPush('Shutdown checkpoint');
      }
      if (this.enableSafetyChecks) {
        const report = gitSafetyService.getSafetyReport();
        logger.info(
          `[GitSafety] Session summary: ${report.totalOperations} ops, ${report.warningCount} warnings, ${report.dangerousCount} dangerous`
        );
      }
      logger.info('[GitAutoCommit] Git auto-commit plugin shutting down');
    },
  };
}
