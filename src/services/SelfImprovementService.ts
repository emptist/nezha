import { DatabaseClient } from '../db/DatabaseClient.js';
import { DATABASE_TABLES } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { createEmbeddingProvider, EmbeddingProvider, EmbeddingConfig } from './embedding/index.js';
import { AgentIdentityService } from './AgentIdentityService.js';

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

export interface ReflectionTemplate {
  name: string;
  scenario: string;
  prompt: string;
}

export const REFLECTION_TEMPLATES: ReflectionTemplate[] = [
  {
    name: 'default',
    scenario: 'General task reflection',
    prompt: `## Task Reflection

You just completed a task: "{{TASK_TITLE}}"

Result: {{TASK_RESULT}}

Please reflect on the following:

1. **What worked well?**
2. **What could be improved?**
3. **Did you discover any novel solutions or patterns?**
4. **Is there anything worth remembering for future tasks?**

If you discovered something valuable, save it using this format:

\`\`\`
[LEARN]
insight: <your key learning in one sentence>
context: <optional context about when this applies>
\`\`\`

If you found a pattern that suggests a system prompt improvement:

\`\`\`
[PROMPT_UPDATE]
current: <what the current prompt says>
suggested: <what it should say instead>
reason: <why this change would help>
\`\`\`
`,
  },
  {
    name: 'bug-fix',
    scenario: 'Bug fixing and error resolution',
    prompt: `## Bug Fix Reflection

You just fixed a bug: "{{TASK_TITLE}}"

Result: {{TASK_RESULT}}

Reflect on this bug fix:

1. **Root cause discovered:** What was the actual cause of the bug?
2. **Detection method:** How was this bug found? (error message, test, manual, etc.)
3. **Fix approach:** What pattern did you use to fix it?
4. **Prevention:** How can we prevent similar bugs in the future?
5. **Testing added:** Were new tests added to catch this regression?

Format insights as:
\`\`\`
[LEARN]
insight: <key learning>
context: <when this applies>
\`\`\`

Also report any issues found:
\`\`\`
[ISSUE]
title: <issue title>
description: <what needs to be addressed>
type: <bug|improvement|feature>
severity: <critical|high|medium|low>
\`\`\`
`,
  },
  {
    name: 'feature',
    scenario: 'New feature development',
    prompt: `## Feature Development Reflection

You just implemented a feature: "{{TASK_TITLE}}"

Result: {{TASK_RESULT}}

Reflect on this feature development:

1. **Requirements clarity:** Were the requirements clear, or did you need to make assumptions?
2. **Architecture decisions:** What design choices did you make?
3. **Code organization:** How well was the code structured?
4. **Testing coverage:** Is the feature adequately tested?
5. **Technical debt:** Did you notice any areas that could use refactoring?
6. **Dependencies:** Any new dependencies introduced? Are they well-maintained?

Format insights as:
\`\`\`
[LEARN]
insight: <key learning>
context: <when this applies>
\`\`\`
`,
  },
  {
    name: 'refactoring',
    scenario: 'Code refactoring and optimization',
    prompt: `## Refactoring Reflection

You just refactored code: "{{TASK_TITLE}}"

Result: {{TASK_RESULT}}

Reflect on this refactoring:

1. **Before/after:** What improved after the refactoring?
2. **Risk assessment:** How risky was this change? How did you mitigate risks?
3. **Test coverage:** Did existing tests catch any issues?
4. **Performance impact:** Did the refactoring affect performance?
5. **Maintainability:** How does this improve future development?

Format insights as:
\`\`\`
[LEARN]
insight: <key learning>
context: <when this applies>
\`\`\`
`,
  },
  {
    name: 'research',
    scenario: 'Research and investigation tasks',
    prompt: `## Research Reflection

You just completed research: "{{TASK_TITLE}}"

Result: {{TASK_RESULT}}

Reflect on this research:

1. **Key findings:** What were the most important discoveries?
2. **Methodology:** How effective was your research approach?
3. **Next steps:** What should be done with these findings?
4. **Knowledge gaps:** What still needs to be explored?
5. **Documentation:** Is the findings documented well enough for others?

Format insights as:
\`\`\`
[LEARN]
insight: <key learning>
context: <when this applies>
\`\`\`
`,
  },
  {
    name: 'review',
    scenario: 'Code review or inter-review',
    prompt: `## Review Reflection

You just completed a review: "{{TASK_TITLE}}"

Result: {{TASK_RESULT}}

Reflect on this review:

1. **Quality observations:** What was done well?
2. **Issues found:** What problems did you identify?
3. **Suggestions:** What improvements did you recommend?
4. **Learning:** Did you learn anything new from reviewing this code?

Format insights as:
\`\`\`
[LEARN]
insight: <key learning>
context: <when this applies>
\`\`\`
`,
  },
  {
    name: 'debugging',
    scenario: 'Debugging complex issues',
    prompt: `## Debugging Reflection

You just debugged an issue: "{{TASK_TITLE}}"

Result: {{TASK_RESULT}}

Reflect on this debugging session:

1. **Symptoms identified:** What were the observable symptoms?
2. **Root cause:** What was the underlying cause?
3. **Tools used:** What debugging tools or techniques helped?
4. **Time spent:** How long did it take? Was it efficient?
5. **Prevention:** How can this issue be caught earlier?

Format insights as:
\`\`\`
[LEARN]
insight: <key learning>
context: <when this applies>
\`\`\`
`,
  },
];

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

  private async getCurrentAgentId(): Promise<string | null> {
    try {
      const identityService = new AgentIdentityService(this.db);
      const identity = await identityService.resolve();
      return identity.id;
    } catch {
      return null;
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

    const agentId = await this.getCurrentAgentId();

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.MEMORY} (id, content, metadata, tags, importance, source, embedding, agent_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        id,
        content,
        JSON.stringify({ type: 'insight', source: 'self-improvement' }),
        tags,
        importance,
        'ai',
        embeddingStr,
        agentId,
      ]
    );

    logger.info(`Insight learned and saved: ${id} by agent ${agentId}`);
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

    const row = result.rows[0];
    const newPrompt = row?.suggested_prompt;

    if (!newPrompt) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }

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

  private static readonly SKIP_TEMPLATE_PATTERNS = [
    /inter-?review/i,
    /^discussion$/i,
    /discussion participation/i,
    /^meeting$/i,
    /^participate/i,
    /participation in/i,
  ];

  private shouldSkipTemplate(title: string): boolean {
    return SelfImprovementService.SKIP_TEMPLATE_PATTERNS.some(p => p.test(title));
  }

  getReflectionTemplate(taskTitle?: string, taskType?: string): ReflectionTemplate {
    const title = (taskTitle || '').toLowerCase();
    const type = (taskType || '').toLowerCase();

    if (this.shouldSkipTemplate(title)) {
      return REFLECTION_TEMPLATES[0]!;
    }

    if (title.includes('debug') || title.includes('troubleshoot') || type === 'debugging') {
      return REFLECTION_TEMPLATES.find(t => t.name === 'debugging')!;
    }
    if (
      title.includes('fix') ||
      title.includes('bug') ||
      title.includes('error') ||
      type === 'bug-fix'
    ) {
      return REFLECTION_TEMPLATES.find(t => t.name === 'bug-fix')!;
    }
    if (
      title.includes('refactor') ||
      title.includes('optimize') ||
      title.includes('improve') ||
      type === 'refactoring'
    ) {
      return REFLECTION_TEMPLATES.find(t => t.name === 'refactoring')!;
    }
    if (
      title.includes('research') ||
      title.includes('investigate') ||
      title.includes('analyze') ||
      type === 'research'
    ) {
      return REFLECTION_TEMPLATES.find(t => t.name === 'research')!;
    }
    if ((title.includes('review') && !title.includes('inter')) || type === 'review') {
      return REFLECTION_TEMPLATES.find(t => t.name === 'review')!;
    }
    if (
      title.includes('feature') ||
      title.includes('implement') ||
      title.includes('add') ||
      title.includes('create') ||
      type === 'feature'
    ) {
      return REFLECTION_TEMPLATES.find(t => t.name === 'feature')!;
    }

    return REFLECTION_TEMPLATES[0]!;
  }

  async getReflectionPrompt(
    taskTitle: string,
    taskResult: string,
    taskType?: string
  ): Promise<string> {
    const template = this.getReflectionTemplate(taskTitle, taskType);
    const truncatedResult = taskResult.substring(0, 500);

    return template.prompt
      .replace(/\{\{TASK_TITLE\}\}/g, taskTitle)
      .replace(/\{\{TASK_RESULT\}\}/g, truncatedResult);
  }

  getAvailableTemplates(): ReflectionTemplate[] {
    return [...REFLECTION_TEMPLATES];
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
