import { DatabaseClient } from '../db/DatabaseClient.js';
import { logger } from '../utils/logger.js';
import Handlebars from 'handlebars';

export interface ReminderTemplate {
  id: number;
  name: string;
  description: string;
  template: string;
  variables: Record<string, string>;
  priority: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SystemStatus {
  pendingTasks: number;
  failedTasks: number;
  openIssues: number;
  recentMemories: number;
  hasIssues: boolean;
  criticalTasks?: Array<{ title: string; priority: number }>;
  recentLearnings?: Array<{ content: string; tags: string[] }>;
  suggestions?: string[];
  totalMemories?: number;
  openIssuesList?: Array<{
    id: string;
    title: string;
    severity?: string;
    issueType?: string;
    priority?: number;
    status: string;
  }>;
}

export class ReminderTemplateService {
  private readonly db: DatabaseClient;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor(db: DatabaseClient) {
    this.db = db;
    this.registerHelpers();
  }

  private registerHelpers(): void {
    interface HelperOptions {
      fn: (ctx?: unknown) => string;
      inverse: (ctx?: unknown) => string;
      data?: { index: number; key: number };
    }

    Handlebars.registerHelper('if', (conditional: unknown, options: HelperOptions) => {
      if (conditional) {
        return options.fn({});
      } else {
        return options.inverse({});
      }
    });

    Handlebars.registerHelper('unless', (conditional: unknown, options: HelperOptions) => {
      if (!conditional) {
        return options.fn({});
      } else {
        return options.inverse({});
      }
    });

    Handlebars.registerHelper('each', (context: unknown[] | null | undefined, options: HelperOptions) => {
      if (!context || context.length === 0) {
        return options.inverse({});
      }
      return context
        .map((item: unknown, index: number) => {
          return options.fn(item);
        })
        .join('');
    });
  }

  async getTemplate(name: string): Promise<ReminderTemplate | null> {
    const result = await this.db.query<ReminderTemplate>(
      `SELECT * FROM reminder_templates WHERE name = $1 AND enabled = true`,
      [name]
    );
    return result.rows[0] || null;
  }

  async getAllTemplates(): Promise<ReminderTemplate[]> {
    const result = await this.db.query<ReminderTemplate>(
      `SELECT * FROM reminder_templates ORDER BY priority DESC, name ASC`
    );
    return result.rows;
  }

  async selectBestTemplate(status: SystemStatus): Promise<ReminderTemplate> {
    if (status.failedTasks > 0 || (status.openIssues > 0 && status.openIssues > 5)) {
      const urgent = await this.getTemplate('urgent_reminder');
      if (urgent) return urgent;
    }

    if (status.recentMemories > 5 && status.pendingTasks === 0) {
      const learning = await this.getTemplate('learning_reminder');
      if (learning) return learning;
    }

    if (status.pendingTasks === 0 && status.failedTasks === 0 && status.openIssues === 0) {
      const idle = await this.getTemplate('idle_state_reminder');
      if (idle) return idle;
    }

    const defaultTemplate = await this.getTemplate('default_reminder');
    if (!defaultTemplate) {
      throw new Error('No default reminder template found');
    }
    return defaultTemplate;
  }

  renderTemplate(template: string, data: SystemStatus): string {
    let compiled = this.templateCache.get(template);
    if (!compiled) {
      compiled = Handlebars.compile(template);
      this.templateCache.set(template, compiled);
    }
    return compiled(data);
  }

  async createTemplate(
    name: string,
    description: string,
    template: string,
    variables: Record<string, string>,
    priority: number = 5
  ): Promise<ReminderTemplate> {
    const result = await this.db.query<ReminderTemplate>(
      `INSERT INTO reminder_templates (name, description, template, variables, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, template, JSON.stringify(variables), priority]
    );

    this.templateCache.delete(template);

    if (!result.rows[0]) {
      throw new Error(`Failed to create template: ${name}`);
    }

    logger.info(`[ReminderTemplate] Created template: ${name}`);
    return result.rows[0];
  }

  async updateTemplate(
    name: string,
    updates: Partial<
      Pick<ReminderTemplate, 'description' | 'template' | 'variables' | 'priority' | 'enabled'>
    >
  ): Promise<ReminderTemplate | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.template !== undefined) {
      setClauses.push(`template = $${paramIndex++}`);
      values.push(updates.template);
    }
    if (updates.variables !== undefined) {
      setClauses.push(`variables = $${paramIndex++}`);
      values.push(JSON.stringify(updates.variables));
    }
    if (updates.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex++}`);
      values.push(updates.priority);
    }
    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (setClauses.length === 0) {
      return this.getTemplate(name);
    }

    values.push(name);
    const result = await this.db.query<ReminderTemplate>(
      `UPDATE reminder_templates 
       SET ${setClauses.join(', ')}
       WHERE name = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows[0]) {
      this.templateCache.delete(result.rows[0].template);
      logger.info(`[ReminderTemplate] Updated template: ${name}`);
    }

    return result.rows[0] || null;
  }

  async deleteTemplate(name: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM reminder_templates WHERE name = $1`, [name]);

    const deleted = result.rowCount > 0;
    if (deleted) {
      logger.info(`[ReminderTemplate] Deleted template: ${name}`);
    }
    return deleted;
  }
}
