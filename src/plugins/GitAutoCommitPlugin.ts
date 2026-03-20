import { execSync } from 'child_process';
import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';

export interface GitReminderConfig {
  remindOnUncommitted?: boolean;
  logGitStatus?: boolean;
}

export class GitAutoCommitPlugin implements Plugin {
  name = 'git-reminder';
  version = '2.0.0';
  description = 'Reminds about uncommitted changes after task completion';
  config: Record<string, unknown>;
  private readonly remindOnUncommitted: boolean;
  private readonly logGitStatus: boolean;

  constructor(config: GitReminderConfig = {}) {
    this.config = {
      remindOnUncommitted: config.remindOnUncommitted ?? true,
      logGitStatus: config.logGitStatus ?? true,
    };
    this.remindOnUncommitted = config.remindOnUncommitted ?? true;
    this.logGitStatus = config.logGitStatus ?? true;
  }

  private getGitStatus(): { hasChanges: boolean; changedFiles: number; stagedFiles: number } {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      const lines = status.trim().split('\n').filter(Boolean);
      
      const changedFiles = lines.filter(line => !line.startsWith('??')).length;
      const stagedFiles = lines.filter(line => line.match(/^[MADRC]/)).length;
      
      return {
        hasChanges: lines.length > 0,
        changedFiles,
        stagedFiles,
      };
    } catch {
      return { hasChanges: false, changedFiles: 0, stagedFiles: 0 };
    }
  }

  private getCurrentBranch(): string {
    try {
      return execSync('git branch --show-current', { encoding: 'utf-8' }).trim() || 'main';
    } catch {
      return 'unknown';
    }
  }

  hooks = {
    afterTask: async (context: TaskContext) => {
      if (context.status !== 'COMPLETED') {
        return;
      }

      const gitStatus = this.getGitStatus();

      if (gitStatus.hasChanges && this.remindOnUncommitted) {
        const branch = this.getCurrentBranch();
        logger.info(
          `[GitReminder] Task "${context.title}" completed with ${gitStatus.changedFiles} uncommitted file(s) on branch "${branch}"`
        );
        logger.info(
          `[GitReminder] Reminder: Please commit your changes with a meaningful message`
        );
      } else if (this.logGitStatus) {
        logger.debug(`[GitReminder] Task "${context.title}" completed, git status clean`);
      }
    },

    onStartup: async () => {
      const gitStatus = this.getGitStatus();
      const branch = this.getCurrentBranch();
      
      if (gitStatus.hasChanges) {
        logger.info(
          `[GitReminder] Startup: ${gitStatus.changedFiles} uncommitted file(s) on branch "${branch}"`
        );
      } else {
        logger.debug(`[GitReminder] Startup: git status clean on branch "${branch}"`);
      }
    },

    onShutdown: async () => {
      const gitStatus = this.getGitStatus();
      
      if (gitStatus.hasChanges) {
        logger.warn(
          `[GitReminder] Shutdown: ${gitStatus.changedFiles} uncommitted file(s) will be lost if not committed`
        );
      }
    },
  };
}
