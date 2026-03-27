import { Plugin, TaskContext, NextStepSuggestion, CommitContext } from '../core/PluginManager.js';
import { logger } from '../utils/logger.js';
import { getGitDiff, isGitDirty } from '../utils/git.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';

export interface NextStepAdvisorConfig {
  enabled?: boolean;
  minFilesChanged?: number;
  suggestOnCommit?: boolean;
  suggestOnTask?: boolean;
  broadcastSuggestions?: boolean;
}

export class NextStepAdvisor implements Plugin {
  name = 'next-step-advisor';
  version = '1.0.0';
  description = 'Analyzes changes and suggests next steps at key breakpoints';
  config: NextStepAdvisorConfig & Record<string, unknown>;

  private db: DatabaseClient | null = null;

  constructor(config: NextStepAdvisorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      minFilesChanged: config.minFilesChanged ?? 1,
      suggestOnCommit: config.suggestOnCommit ?? true,
      suggestOnTask: config.suggestOnTask ?? true,
      broadcastSuggestions: config.broadcastSuggestions ?? true,
    };
  }

  setDatabaseClient(db: DatabaseClient): void {
    this.db = db;
  }

  hooks = {
    afterTaskWithChanges: async (context: TaskContext, _suggestions: NextStepSuggestion[]) => {
      if (!this.config.enabled || !this.config.suggestOnTask) return;
      if (context.status !== 'COMPLETED') return;

      const hasChanges = isGitDirty();
      if (!hasChanges) return;

      const suggestions = await this.analyzeChanges(context);
      if (suggestions.length === 0) return;

      this.displaySuggestions(context.title, suggestions);
      await this.broadcastSuggestions(context.title, suggestions);
    },

    afterCommit: async (context: CommitContext, _suggestions: NextStepSuggestion[]) => {
      if (!this.config.enabled || !this.config.suggestOnCommit) return;

      const suggestions = await this.analyzeCommit(context);
      if (suggestions.length === 0) return;

      this.displaySuggestions(context.commitHash.slice(0, 8), suggestions);
      await this.broadcastSuggestions(`Commit ${context.commitHash.slice(0, 8)}`, suggestions);
    },

    onStartup: async () => {
      if (!this.config.enabled) return;

      const hasChanges = isGitDirty();
      if (!hasChanges) return;

      const suggestions = await this.analyzeUncommittedChanges();
      if (suggestions.length > 0) {
        logger.info(
          `[NextStepAdvisor] Found ${suggestions.length} uncommitted files without suggestions yet`
        );
      }
    },
  };

  private async analyzeChanges(_taskContext: TaskContext): Promise<NextStepSuggestion[]> {
    const suggestions: NextStepSuggestion[] = [];
    const diff = getGitDiff();
    if (!diff) return suggestions;

    const files = this.extractFiles(diff);
    const fileTypes = this.categorizeFiles(files);

    if ((fileTypes.code ?? 0) > 0 && !this.hasTestFiles(files)) {
      suggestions.push({
        type: 'test',
        priority: 'high',
        title: 'Add tests for new code',
        reason: `Found ${fileTypes.code} code files without tests`,
        action: `Add test files for the new code in src/**/*.test.ts`,
      });
    }

    if ((fileTypes.typescript ?? 0) > 0) {
      suggestions.push({
        type: 'review',
        priority: 'medium',
        title: 'Review TypeScript changes',
        reason: `Modified ${fileTypes.typescript} TypeScript files`,
        action: `Run typecheck: npm run typecheck`,
      });
    }

    if ((fileTypes.config ?? 0) > 0) {
      suggestions.push({
        type: 'test',
        priority: 'medium',
        title: 'Verify configuration changes',
        reason: 'Configuration files were modified',
        action: 'Ensure config changes are documented and tested',
      });
    }

    if (files.some(f => f.includes('plugin') || f.includes('Plugin'))) {
      suggestions.push({
        type: 'review',
        priority: 'low',
        title: 'Review plugin changes',
        reason: 'Plugin system was modified',
        action: 'Verify plugin loads correctly and hooks work',
      });
    }

    if (files.some(f => f.includes('migration') || f.includes('.sql'))) {
      suggestions.push({
        type: 'test',
        priority: 'high',
        title: 'Test database migration',
        reason: 'Database migration files found',
        action: 'Run migration and verify database schema',
      });
    }

    if (files.some(f => f.includes('memory') || f.includes('learning'))) {
      suggestions.push({
        type: 'task',
        priority: 'low',
        title: 'Test learning system',
        reason: 'Learning/memory system modified',
        action: 'Verify memory is saved and retrieved correctly',
      });
    }

    return suggestions;
  }

  private async analyzeCommit(context: CommitContext): Promise<NextStepSuggestion[]> {
    const suggestions: NextStepSuggestion[] = [];
    const message = context.message.toLowerCase();

    if (message.includes('fix') || message.includes('bug')) {
      suggestions.push({
        type: 'review',
        priority: 'high',
        title: 'Verify bug fix works',
        reason: 'Bug fix committed',
        action: 'Test the fix in multiple scenarios',
      });
    }

    if (message.includes('feature') || message.includes('add')) {
      suggestions.push({
        type: 'test',
        priority: 'high',
        title: 'Add tests for new feature',
        reason: 'New feature added',
        action: 'Write tests covering the new functionality',
      });
    }

    if (context.files.some(f => f.includes('test') || f.includes('.test.'))) {
      suggestions.push({
        type: 'task',
        priority: 'medium',
        title: 'Run test suite',
        reason: 'Tests were modified',
        action: 'Run: npm test to ensure all tests pass',
      });
    }

    if (
      context.files.some(f => f.includes('config') || f.includes('.yaml') || f.includes('.json'))
    ) {
      suggestions.push({
        type: 'review',
        priority: 'medium',
        title: 'Update documentation',
        reason: 'Configuration files changed',
        action: 'Update relevant documentation if needed',
      });
    }

    if (message.includes('refactor') || message.includes('cleanup')) {
      suggestions.push({
        type: 'review',
        priority: 'low',
        title: 'Review refactoring',
        reason: 'Code was refactored',
        action: 'Verify no functionality was broken',
      });
    }

    return suggestions;
  }

  private async analyzeUncommittedChanges(): Promise<NextStepSuggestion[]> {
    const suggestions: NextStepSuggestion[] = [];
    const diff = getGitDiff();
    if (!diff) return suggestions;

    const files = this.extractFiles(diff);

    suggestions.push({
      type: 'commit',
      priority: 'high',
      title: 'Commit pending changes',
      reason: `Found ${files.length} uncommitted file(s)`,
      action: `Files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`,
    });

    return suggestions;
  }

  private extractFiles(diff: string): string[] {
    const files: string[] = [];
    const lines = diff.split('\n');
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/diff --git a\/(.*?) b\//);
        if (match && match[1]) {
          files.push(match[1]);
        }
      }
    }
    return files;
  }

  private categorizeFiles(files: string[]): Record<string, number> {
    const categories: Record<string, number> = { code: 0, typescript: 0, test: 0, config: 0 };
    for (const f of files) {
      if (f.endsWith('.ts') || f.endsWith('.tsx')) {
        categories.typescript = (categories.typescript ?? 0) + 1;
        if (!f.includes('.test.') && !f.includes('.spec.')) {
          categories.code = (categories.code ?? 0) + 1;
        }
      }
      if (f.includes('.test.') || f.includes('.spec.')) {
        categories.test = (categories.test ?? 0) + 1;
      }
      if (f.includes('.yaml') || f.includes('.json') || f.includes('.config.')) {
        categories.config = (categories.config ?? 0) + 1;
      }
    }
    return categories;
  }

  private hasTestFiles(files: string[]): boolean {
    return files.some(f => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'));
  }

  private async displaySuggestions(
    context: string,
    suggestions: NextStepSuggestion[]
  ): Promise<void> {
    logger.info(`[NextStepAdvisor] Suggestions for "${context}":`);
    for (const s of suggestions) {
      const icon =
        s.type === 'task' ? '📋' : s.type === 'test' ? '🧪' : s.type === 'review' ? '🔍' : '💡';
      const priority = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '⚪';
      logger.info(`  ${icon} ${priority} [${s.type}] ${s.title}`);
      logger.info(`     → ${s.reason}`);
      if (s.action) {
        logger.info(`     → Action: ${s.action}`);
      }
    }
  }

  private async broadcastSuggestions(
    context: string,
    suggestions: NextStepSuggestion[]
  ): Promise<void> {
    if (!this.db || !this.config.broadcastSuggestions) return;

    try {
      const highPriority = suggestions.filter(s => s.priority === 'high');
      if (highPriority.length === 0) return;

      const body = highPriority
        .map(s => `- **[${s.type.toUpperCase()}]** ${s.title}\n  ${s.reason}\n  ${s.action || ''}`)
        .join('\n\n');

      await this.db.query(
        `INSERT INTO broadcasts (id, sender_id, sender_type, priority, content, created_at)
         VALUES (uuid_generate_v4(), $1, 'system', 'normal', $2, NOW())`,
        [Config.getInstance().getAgentId(), `## Next Steps for: ${context}\n\n${body}`]
      );
      logger.debug('[NextStepAdvisor] Broadcasted suggestions');
    } catch (error) {
      logger.debug('[NextStepAdvisor] Failed to broadcast:', error);
    }
  }
}
