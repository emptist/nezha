import { DatabaseClient } from '../db/DatabaseClient.js';
import { TASK_STATUS, DATABASE_TABLES } from '../config/constants.js';
import { Config } from '../config/Config.js';
import { logger } from '../utils/logger.js';
import { UnifiedAgent } from '../core/UnifiedAgent.js';

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
  private readonly agent: UnifiedAgent;

  constructor(db: DatabaseClient, agent: UnifiedAgent) {
    this.db = db;
    this.agent = agent;
  }

  async createMeetingFromTask(task: DiscussionTask): Promise<string> {
    const meetingId = crypto.randomUUID();
    const agentId = Config.getInstance().getAgentId();

    try {
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
    } catch (error) {
      logger.error(`[MeetingHandler] Failed to create meeting:`, error);
      throw error;
    }

    logger.info(`[MeetingHandler] Created meeting ${meetingId} for task ${task.id}`);
    return meetingId;
  }

  async handleDiscussionTask(task: DiscussionTask): Promise<void> {
    logger.info(`[MeetingHandler] Processing discussion: ${task.title}`);

    const existingOpinions = await this.getExistingOpinions(task.id);
    const contextPrompt = this.buildDiscussionPrompt(task, existingOpinions);

    try {
      const result = await this.agent.executeTask(contextPrompt);

      if (result.success && result.output) {
        const parsedOpinions = this.parseOpinionsFromOutput(result.output);

        for (const opinion of parsedOpinions) {
          await this.recordOpinion(task.id, opinion);
        }

        if (parsedOpinions.length > 0) {
          logger.info(
            `[MeetingHandler] Recorded ${parsedOpinions.length} opinions for ${task.title}`
          );
        }

        const consensus = this.detectConsensus(existingOpinions, parsedOpinions);
        if (consensus) {
          await this.createConsensusTask(task, consensus);
        }
      }
    } catch (error) {
      logger.error('[MeetingHandler] Failed to process discussion:', error);
      throw error;
    }
  }

  private async getExistingOpinions(discussionId: string): Promise<Opinion[]> {
    try {
      const result = await this.db.query<{ content: string; metadata: Record<string, unknown> }>(
        `SELECT content, metadata FROM ${DATABASE_TABLES.MEMORY}
         WHERE metadata->>'type' = 'opinion'
           AND metadata->>'discussionId' = $1
         ORDER BY created_at ASC`,
        [discussionId]
      );

      return result.rows.map(row => this.parseOpinionContent(row.content));
    } catch (error) {
      logger.error(`[MeetingHandler] Failed to get existing opinions for ${discussionId}:`, error);
      return [];
    }
  }

  private parseOpinionContent(content: string): Opinion {
    const perspectiveMatch = content.match(/\*\*Perspective\*\*:\s*(.+)/);
    const reasoningMatch = content.match(/\*\*Reasoning\*\*:\s*([\s\S]+?)(?=\*\*Concerns\*\*)/);
    const concernsMatch = content.match(/\*\*Concerns\*\*:([\s\S]+?)(?=\*\*Suggestions\*\*)/);
    const suggestionsMatch = content.match(/\*\*Suggestions\*\*:([\s\S]+?)(?=_Recorded)/);

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
          .map(l => l.replace(/^- \s*/, '').trim()) || [],
      suggestions:
        suggestionsMatch?.[1]
          ?.split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => l.replace(/^- \s*/, '').trim()) || [],
    };
  }

  private buildDiscussionPrompt(task: DiscussionTask, existingOpinions: Opinion[]): string {
    const opinionsSection =
      existingOpinions.length > 0
        ? `### Existing Opinions:\n${existingOpinions.map(op => `**${op.author}**: ${op.perspective}`).join('\n\n')}`
        : '### No opinions recorded yet. Be the first to share your perspective!';

    return `${task.description}

---

## Your Task
Participate in this discussion as AI agent: ${Config.getInstance().getAgentId()}

${opinionsSection}

### Instructions
1. Review existing opinions if any
2. Share your perspective using this format:
\`\`\`markdown
## Opinion from [Your Agent ID]

**Perspective**: [Your unique viewpoint on this topic]

**Key Points**:
1. [First key point]
2. [Second key point]
3. [Third key point]

**Reasoning**: [Why you think this way]

**Concerns**: [Any risks or downsides - or "None"]

**Suggestions**: [Specific recommendations - or "None"]
\`\`\`

3. If you agree with others, build on their ideas
4. If you disagree, provide constructive counter-arguments`;
  }

  private parseOpinionsFromOutput(output: string): Opinion[] {
    const opinions: Opinion[] = [];
    const opinionPattern = /## Opinion from (.+?)\n\n\*\*Perspective\*\*:\s*(.+?)(?=\n)/gs;
    const keyPointsPattern = /\*\*Key Points\*\*:([\s\S]+?)(?=\*\*Reasoning\*\*)/g;
    const reasoningPattern = /\*\*Reasoning\*\*:([\s\S]+?)(?=\*\*Concerns\*\*)/g;
    const concernsPattern = /\*\*Concerns\*\*:([\s\S]+?)(?=\*\*Suggestions\*\*)/g;
    const suggestionsPattern = /\*\*Suggestions\*\*:([\s\S]+?)(?=`{3}|$)/g;

    let match;
    while ((match = opinionPattern.exec(output)) !== null) {
      const author = match[1]?.trim() || Config.getInstance().getAgentId();
      const perspective = match[2]?.trim() || '';

      const keyPoints = this.extractListItems(output, keyPointsPattern, opinionPattern.lastIndex);
      const reasoning = this.extractFirstMatch(output, reasoningPattern, opinionPattern.lastIndex);
      const concerns = this.extractListItems(output, concernsPattern, opinionPattern.lastIndex);
      const suggestions = this.extractListItems(
        output,
        suggestionsPattern,
        opinionPattern.lastIndex
      );

      opinions.push({ author, perspective, keyPoints, reasoning, concerns, suggestions });
    }

    return opinions;
  }

  private extractFirstMatch(output: string, pattern: RegExp, _fromIndex: number): string {
    const matches = [...output.matchAll(pattern)];
    return matches[0]?.[1]?.trim() || '';
  }

  private extractListItems(output: string, pattern: RegExp, fromIndex: number): string[] {
    const content = output.substring(fromIndex, fromIndex + 2000);
    const match = content.match(pattern);
    if (!match?.[1]) return [];
    return match[1]
      .split('\n')
      .filter(l => l.match(/^\d+\.\s*|-\s+/))
      .map(l => l.replace(/^\d+\.\s*|-\s+/, '').trim())
      .filter(Boolean);
  }

  private async recordOpinion(discussionId: string, opinion: Opinion): Promise<void> {
    const agentId = Config.getInstance().getAgentId();

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

    try {
      await this.db.query(
        `INSERT INTO ${DATABASE_TABLES.MEMORY} (content, project_id, metadata, importance)
         VALUES ($1, $2, $3, $4)`,
        [content, null, JSON.stringify({ type: 'opinion', discussionId, author: agentId }), 7]
      );
    } catch (error) {
      logger.error(`[MeetingHandler] Failed to record opinion for ${discussionId}:`, error);
      throw error;
    }
  }

  private detectConsensus(existing: Opinion[], newOpinions: Opinion[]): string | null {
    const allOpinions = [...existing, ...newOpinions];
    if (allOpinions.length < 2) return null;

    const perspectives = new Set(allOpinions.map(o => o.perspective.toLowerCase().trim()));
    if (perspectives.size === 1 && allOpinions.length >= 2) {
      return allOpinions[0]?.perspective || null;
    }

    const allSuggestions = allOpinions.flatMap(o => o.suggestions.map(s => s.toLowerCase().trim()));
    const suggestionCounts = new Map<string, number>();
    for (const s of allSuggestions) {
      suggestionCounts.set(s, (suggestionCounts.get(s) || 0) + 1);
    }

    for (const [suggestion, count] of suggestionCounts) {
      if (count >= Math.ceil(allOpinions.length / 2) && suggestion !== 'none') {
        return suggestion;
      }
    }

    return null;
  }

  private async createConsensusTask(
    originalTask: DiscussionTask,
    consensus: string
  ): Promise<void> {
    const consensusId = crypto.randomUUID();
    const agentId = Config.getInstance().getAgentId();

    try {
      await this.db.query(
        `INSERT INTO ${DATABASE_TABLES.TASKS} (id, title, description, status, priority, type, category, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          consensusId,
          `Consensus Reached: ${originalTask.title.replace('Discussion: ', '')}`,
          `## Consensus Reached\n\n**Agreement**: ${consensus}\n\n**Discussion**: ${originalTask.title}\n\nBased on AI discussion, this consensus was reached.`,
          TASK_STATUS.PENDING,
          originalTask.priority + 1,
          'decision',
          'collaboration',
          agentId,
        ]
      );

      await this.db.query(
        `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, completed_at = NOW() WHERE id = $2`,
        [TASK_STATUS.COMPLETED, originalTask.id]
      );

      logger.info(`[MeetingHandler] Consensus task created: ${consensusId}`);
    } catch (error) {
      logger.error(`[MeetingHandler] Failed to create consensus task:`, error);
      throw error;
    }
  }
}
