import { DatabaseClient } from '../db/DatabaseClient.js';
import { TASK_STATUS, DATABASE_TABLES } from '../config/constants.js';
import { logger } from '../utils/logger.js';
import { AIProvider, AIProviderFactory } from './ai/index.js';
import { AgentIdentityService } from './AgentIdentityService.js';

export interface DiscussionTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  created_by?: string;
  project_id?: string;
}

export interface Opinion {
  author: string;
  perspective: string;
  keyPoints: string[];
  reasoning: string;
  concerns: string[];
  suggestions: string[];
}

export class MeetingHandler {
  private readonly db: DatabaseClient;
  private readonly aiProvider: AIProvider;

  constructor(db: DatabaseClient, aiProvider: AIProvider) {
    this.db = db;
    this.aiProvider = aiProvider;
  }

  static async create(db: DatabaseClient): Promise<MeetingHandler> {
    const aiProvider = await AIProviderFactory.createInnerProvider(db);
    return new MeetingHandler(db, aiProvider);
  }

  async createMeetingFromTask(task: DiscussionTask): Promise<string> {
    const meetingId = crypto.randomUUID();
    const agentId = await AgentIdentityService.getResolvedIdentity();

    await this.db.query(
      `INSERT INTO meetings (id, topic, status, created_by, metadata)
       VALUES ($1, $2, 'active', $3, $4)`,
      [
        meetingId,
        task.title.replace('Discussion: ', ''),
        agentId,
        JSON.stringify({ taskId: task.id, priority: task.priority }),
      ]
    );

    logger.info(`[MeetingHandler] Created meeting ${meetingId} for task ${task.id}`);
    return meetingId;
  }

  async handleDiscussionTask(task: DiscussionTask): Promise<void> {
    logger.info(`[MeetingHandler] Processing discussion: ${task.title}`);

    const existingOpinions = await this.getExistingOpinions(task.id);
    const agentId = (await AgentIdentityService.getResolvedIdentity()).id;
    const contextPrompt = await this.buildDiscussionPrompt(task, existingOpinions, agentId);

    try {
      const result = await this.aiProvider.complete(contextPrompt);

      const parsedOpinions = await this.parseOpinionsFromOutput(result.content, agentId);

      for (const opinion of parsedOpinions) {
        await this.recordOpinion(task.id, opinion, agentId);
      }

      if (parsedOpinions.length > 0) {
        logger.info(
          `[MeetingHandler] Recorded ${parsedOpinions.length} opinions for ${task.title}`
        );
      }

      const consensus = this.detectConsensus(existingOpinions, parsedOpinions);
      if (consensus) {
        await this.createConsensusTask(task, consensus, agentId);
      }
    } catch (error) {
      logger.error('[MeetingHandler] Failed to process discussion:', error);
      throw error;
    }
  }

  private async getExistingOpinions(discussionId: string): Promise<Opinion[]> {
    const opinions: Opinion[] = [];

    const memoryResult = await this.db.query<{
      content: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT content, metadata FROM ${DATABASE_TABLES.MEMORY}
       WHERE metadata->>'type' = 'opinion'
         AND metadata->>'discussionId' = $1
       ORDER BY created_at ASC`,
      [discussionId]
    );

    for (const row of memoryResult.rows) {
      opinions.push(this.parseOpinionContent(row.content));
    }

    return opinions;
  }

  private parseOpinionContent(content: string): Opinion {
    const perspectiveMatch = content.match(/\*\*Perspective\*\*:\s*(.+)/);
    const reasoningMatch = content.match(/\*\*Reasoning\*\*:\s*([\s\S]+?)(?=\*\*Concerns\*\*)/);
    const concernsMatch = content.match(/\*\*Concerns\*\*:([\s\S]+?)(?=\*\*Suggestions\*\*)/);
    const suggestionsMatch = content.match(/\*\*Suggestions\*\*:([\s\S]+?)(?=_\w+|$)/);

    const keyPointsMatch = content.match(/\*\*Key Points\*\*:([\s\S]+?)(?=\*\*Reasoning\*\*)/);

    return {
      author: content.match(/## Opinion from (.+)/)?.[1] || 'unknown',
      perspective: perspectiveMatch?.[1] || '',
      keyPoints:
        keyPointsMatch?.[1]
          ?.split('\n')
          .filter(l => l.match(/^\d+\./))
          .map(l => l.replace(/^\d+\.\s*/, '').trim()) || [],
      reasoning: reasoningMatch?.[1]?.trim() || '',
      concerns:
        concernsMatch?.[1]
          ?.split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.replace(/^-\s*/, '').trim()) || [],
      suggestions:
        suggestionsMatch?.[1]
          ?.split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.replace(/^-\s*/, '').trim()) || [],
    };
  }

  private async buildDiscussionPrompt(
    task: DiscussionTask,
    existingOpinions: Opinion[],
    agentId: string
  ): Promise<string> {
    const opinionsSection =
      existingOpinions.length > 0
        ? `### Existing Opinions:\n${existingOpinions.map(op => `**${op.author}**: ${op.perspective}`).join('\n\n')}`
        : '### No opinions recorded yet.';

    return `${task.description}

---

## Your Task
Participate in this discussion as AI agent: ${agentId}

${opinionsSection}

### Instructions
1. Review existing opinions if any
2. Share your perspective using this format:
\`\`\`markdown
## Opinion from [Your Agent ID]

**Perspective**: [Your unique viewpoint]

**Key Points**:
1. [First point]
2. [Second point]

**Reasoning**: [Why you think this way]

**Concerns**: [Any risks - or "None"]

**Suggestions**: [Recommendations - or "None"]
\`\`\``;
  }

  private async parseOpinionsFromOutput(output: string, agentId: string): Promise<Opinion[]> {
    const opinions: Opinion[] = [];
    const opinionPattern = /## Opinion from (.+?)\n\n\*\*Perspective\*\*:\s*(.+?)(?=\n)/gs;

    let match;
    while ((match = opinionPattern.exec(output)) !== null) {
      const author = match[1]?.trim() || agentId;
      const perspective = match[2]?.trim() || '';

      opinions.push({
        author,
        perspective,
        keyPoints: [],
        reasoning: '',
        concerns: [],
        suggestions: [],
      });
    }

    return opinions;
  }

  private async recordOpinion(
    discussionId: string,
    opinion: Opinion,
    agentId: string
  ): Promise<void> {
    const content = `## Opinion from ${agentId}

**Perspective**: ${opinion.perspective}

**Key Points**:
${opinion.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

**Reasoning**: ${opinion.reasoning}

**Concerns**:
${opinion.concerns.length > 0 ? opinion.concerns.map(c => `- ${c}`).join('\n') : 'None'}

**Suggestions**:
${opinion.suggestions.length > 0 ? opinion.suggestions.map(s => `- ${s}`).join('\n') : 'None'}

_Recorded for discussion: ${discussionId}_`;

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.MEMORY} (content, project_id, metadata, importance)
       VALUES ($1, $2, $3, $4)`,
      [content, null, JSON.stringify({ type: 'opinion', discussionId, author: agentId }), 7]
    );
  }

  private detectConsensus(existing: Opinion[], newOpinions: Opinion[]): string | null {
    const allOpinions = [...existing, ...newOpinions];
    if (allOpinions.length < 2) return null;

    const perspectives = new Set(allOpinions.map(o => o.perspective.toLowerCase().trim()));
    if (perspectives.size === 1 && allOpinions.length >= 2) {
      return allOpinions[0]?.perspective || null;
    }

    return null;
  }

  private async createConsensusTask(
    originalTask: DiscussionTask,
    consensus: string,
    agentId: string
  ): Promise<void> {
    const consensusId = crypto.randomUUID();

    await this.db.query(
      `INSERT INTO ${DATABASE_TABLES.TASKS} (id, title, description, status, priority, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        consensusId,
        `Consensus: ${originalTask.title.replace('Discussion: ', '')}`,
        `## Consensus\n\n${consensus}`,
        TASK_STATUS.PENDING,
        originalTask.priority + 1,
        'collaboration',
        agentId,
      ]
    );

    await this.db.query(
      `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, completed_at = NOW() WHERE id = $2`,
      [TASK_STATUS.COMPLETED, originalTask.id]
    );

    logger.info(`[MeetingHandler] Consensus task created: ${consensusId}`);
  }
}
