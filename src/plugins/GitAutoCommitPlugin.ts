import { execSync } from 'child_process';
import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';

export interface GitAutoCommitConfig {
  autoPush?: boolean;
  commitMessagePrefix?: string;
  autoAdd?: boolean;
  useActualCommitMessage?: boolean;
}

export class GitAutoCommitPlugin implements Plugin {
  name = 'git-auto-commit';
  version = '1.0.0';
  description = 'Auto commits and pushes changes after task completion';
  config: Record<string, unknown>;
  private readonly autoPush: boolean;
  private readonly commitMessagePrefix: string;
  private readonly autoAdd: boolean;
  private readonly useActualCommitMessage: boolean;

  constructor(config: GitAutoCommitConfig = {}) {
    this.config = {
      autoPush: config.autoPush ?? true,
      commitMessagePrefix: config.commitMessagePrefix ?? 'Task completed:',
      autoAdd: config.autoAdd ?? true,
      useActualCommitMessage: config.useActualCommitMessage ?? true,
    };
    this.autoPush = config.autoPush ?? true;
    this.commitMessagePrefix = config.commitMessagePrefix ?? 'Task completed:';
    this.autoAdd = config.autoAdd ?? true;
    this.useActualCommitMessage = config.useActualCommitMessage ?? true;
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

  private getLatestCommitMessage(): string | null {
    try {
      const msg = execSync('git log -1 --format=%B', { encoding: 'utf-8' }).trim();
      const lines = msg.split('\n');
      const firstLine = lines[0] || '';
      if (
        firstLine.startsWith('Task completed:') ||
        firstLine.startsWith('feat:') ||
        firstLine.startsWith('fix:') ||
        firstLine.startsWith('docs:') ||
        firstLine.startsWith('test:') ||
        firstLine.startsWith('refactor:')
      ) {
        return firstLine;
      }
      return null;
    } catch (err) {
      logger.debug(
        `[GitAutoCommit] Failed to get latest commit message: ${err instanceof Error ? err.message : 'Unknown'}`
      );
      return null;
    }
  }

  private async commitAndPush(taskTitle: string): Promise<void> {
    if (!this.hasGitChanges()) {
      logger.debug('[GitAutoCommit] No changes to commit');
      return;
    }

    const changedFiles = this.getChangedFiles();
    const filesStr =
      changedFiles.length > 5
        ? `${changedFiles.slice(0, 5).join(', ')}...`
        : changedFiles.join(', ');

    try {
      if (this.autoAdd) {
        execSync('git add -A', { encoding: 'utf-8' });
        logger.debug('[GitAutoCommit] Added files to staging');
      }

      let commitMsg: string;

      if (this.useActualCommitMessage) {
        const actualMsg = this.getLatestCommitMessage();
        if (actualMsg) {
          commitMsg = actualMsg;
          logger.debug('[GitAutoCommit] Using actual commit message:', actualMsg);
        } else {
          commitMsg = `${this.commitMessagePrefix} ${taskTitle}\n\nFiles: ${filesStr}`;
        }
      } else {
        commitMsg = `${this.commitMessagePrefix} ${taskTitle}\n\nFiles: ${filesStr}`;
      }

      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
      logger.info(`[GitAutoCommit] Committed: ${commitMsg.split('\n')[0]}`);

      if (this.autoPush) {
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

  hooks = {
    afterTask: async (context: TaskContext) => {
      if (context.status !== 'COMPLETED') {
        return;
      }

      logger.debug(`[GitAutoCommit] Task completed: ${context.title}`);
      await this.commitAndPush(context.title);
    },

    onStartup: async () => {
      logger.info('[GitAutoCommit] Git auto-commit plugin initialized');
    },

    onShutdown: async () => {
      if (this.hasGitChanges()) {
        logger.warn('[GitAutoCommit] 有未提交的更改，关闭前尝试提交...');
        await this.commitAndPush('Shutdown checkpoint');
      }
      logger.info('[GitAutoCommit] Git auto-commit plugin shutting down');
    },
  };
}
