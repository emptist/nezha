import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES, MEMORY_CONFIG } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { createEmbeddingProvider, EmbeddingProvider, EmbeddingConfig } from './embedding/index.js';

export interface LearnInput {
  insight: string;
  context?: string;
  tags?: string[];
  importance?: number;
}

export interface RememberInput {
  lesson: string;
  fromTask: string;
  tags?: string[];
}

export interface PromptSuggestion {
  id: string;
  currentPrompt: string;
  suggestedPrompt: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

export class SelfImprovementService {
  private readonly db: DatabaseClient;
  private readonly embedding?: EmbeddingProvider;
  private static PROMPTS_TABLE = 'system_prompts';
  private static SUGGESTIONS_TABLE = 'prompt_suggestions';

  constructor(db: DatabaseClient, embeddingConfig?: EmbeddingConfig) {
    this.db = db;
    if (embeddingConfig) {
      this.embedding = createEmbeddingProvider(embeddingConfig);
    }
  }

  async learn(input: LearnInput): Promise<string> {
    const id = crypto.randomUUID();
    const importance = input.importance ?? 7;
    const tags = input.tags ?? ['learning', 'insight'];
    const content = input.context
      ? `Insight: ${input.insight}\nContext: ${input.context}`
      : input.insight;

    let embeddingStr: string | null = null;
    if (this.embedding) {
      try {
        const embedding = await this.embedding.embed(content);
        embeddingStr = `[${embedding.join(',')}]`;
      } catch (error) {
        logger.warn('Failed to generate embedding for insight:', error);
      }
    }

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.MEMORY} (id, content, metadata, tags, importance, source, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        id,
        content,
        JSON.stringify({ type: 'insight', source: 'self-improvement' }),
        tags,
        importance,
        'ai',
        embeddingStr,
      ]
    );

    logger.info(`Insight learned and saved: ${id}`);
    return `Learned: ${input.insight.substring(0, 100)}...`;
  }

  async remember(input: RememberInput): Promise<string> {
    return this.learn({
      insight: input.lesson,
      context: `From task: ${input.fromTask}`,
      tags: [...(input.tags ?? []), 'lesson', 'remembered'],
      importance: 8,
    });
  }

  async suggestPromptUpdate(
    currentPrompt: string,
    suggestedChanges: string,
    reason: string
  ): Promise<string> {
    const id = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO ${SelfImprovementService.SUGGESTIONS_TABLE} (id, current_prompt, suggested_prompt, reason, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, currentPrompt, suggestedChanges, reason, 'pending']
    );

    logger.info(`Prompt suggestion created: ${id}`);
    return `Prompt suggestion created (ID: ${id}). Awaiting human approval.`;
  }

  async getPendingSuggestions(): Promise<PromptSuggestion[]> {
    const result = await this.db.query<PromptSuggestion>(
      `SELECT id, current_prompt as "currentPrompt", suggested_prompt as "suggestedPrompt", 
              reason, status, created_at as "createdAt"
       FROM ${SelfImprovementService.SUGGESTIONS_TABLE}
       WHERE status = 'pending'
       ORDER BY created_at DESC
       LIMIT 10`
    );
    return result.rows;
  }

  async approveSuggestion(suggestionId: string): Promise<string> {
    const result = await this.db.query<{ suggested_prompt: string }>(
      `SELECT suggested_prompt FROM ${SelfImprovementService.SUGGESTIONS_TABLE} WHERE id = $1 AND status = 'pending'`,
      [suggestionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

    const newPrompt = result.rows[0].suggested_prompt;

    await this.db.query(
      `UPDATE ${SelfImprovementService.SUGGESTIONS_TABLE} SET status = 'approved' WHERE id = $1`,
      [suggestionId]
    );

    logger.info(`Prompt suggestion approved: ${suggestionId}`);
    return newPrompt;
  }

  async rejectSuggestion(suggestionId: string): Promise<void> {
    await this.db.query(
      `UPDATE ${SelfImprovementService.SUGGESTIONS_TABLE} SET status = 'rejected' WHERE id = $1`,
      [suggestionId]
    );
    logger.info(`Prompt suggestion rejected: ${suggestionId}`);
  }

  async getReflectionPrompt(taskTitle: string, taskResult: string): Promise<string> {
    return `
## Task Reflection

You just completed a task: "${taskTitle}"

Result: ${taskResult.substring(0, 500)}

Please reflect on the following:

1. **What worked well?** 
2. **What could be improved?**
3. **Did you discover any novel solutions or patterns?**
4. **Is there anything worth remembering for future tasks?**

If you discovered something valuable, use the learn() function to save it.
If you found a pattern that suggests a system prompt improvement, use suggest_prompt_update() to propose changes.
`;
  }
}

let selfImprovementInstance: SelfImprovementService | null = null;

export function getSelfImprovement(
  db: DatabaseClient,
  embeddingConfig?: EmbeddingConfig
): SelfImprovementService {
  if (!selfImprovementInstance) {
    selfImprovementInstance = new SelfImprovementService(db, embeddingConfig);
  }
  return selfImprovementInstance;
}

export async function learn(input: LearnInput): Promise<string> {
  return selfImprovementInstance?.learn(input) ?? 'Self-improvement not initialized';
}

export async function remember(input: RememberInput): Promise<string> {
  return selfImprovementInstance?.remember(input) ?? 'Self-improvement not initialized';
}
