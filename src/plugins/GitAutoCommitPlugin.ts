import { Plugin, TaskContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';
import { isGitDirty, getGitBranch } from '../utils/git.js';

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

  hooks = {
    afterTask: async (context: TaskContext) => {
      if (context.status !== 'COMPLETED') {
        return;
      }

      const hasChanges = isGitDirty();

      if (hasChanges && this.remindOnUncommitted) {
        const branch = getGitBranch() || 'unknown';
        logger.info(
          `[GitReminder] Task "${context.title}" completed with uncommitted changes on branch "${branch}"`
        );
        logger.info(
          `[GitReminder] Reminder: Please commit your changes with a meaningful message`
        );
      } else if (this.logGitStatus) {
        logger.debug(`[GitReminder] Task "${context.title}" completed, git status clean`);
      }
    },

    onStartup: async () => {
      const hasChanges = isGitDirty();
      const branch = getGitBranch() || 'unknown';
      
      if (hasChanges) {
        logger.info(
          `[GitReminder] Startup: Uncommitted changes detected on branch "${branch}"`
        );
      } else {
        logger.debug(`[GitReminder] Startup: git status clean on branch "${branch}"`);
      }
    },

    onShutdown: async () => {
      const hasChanges = isGitDirty();
      
      if (hasChanges) {
        logger.warn(
          `[GitReminder] Shutdown: Uncommitted changes will be lost if not committed`
        );
      }
    },
  };
}
