import { DatabaseClient } from '../db/DatabaseClient.js';
import { MemoryService } from '../core/Memory.js';
import { DailyMemoryService } from './DailyMemory.js';
import {
  createEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingConfig,
} from './embedding/index.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { InterReviewService } from './InterReviewService.js';
import { SkillSystem } from '../core/SkillSystem.js';

const DEFAULT_MEMORY_DIR = '.tmp/nezha-memory';
const MEMORY_FILE = 'MEMORY.md';
const CONTEXT_MEMORY_LIMIT = 5;
const CURATED_MEMORY_TTL_MS = 60000;

export interface ContextMemoryResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface TaskContextInput {
  taskId: string;
  title: string;
  description?: string;
}

export interface SkillSuggestionResult {
  name: string;
  description: string;
  matchScore: number;
  quickStart?: string;
}

export interface BuiltContext {
  originalTask: string;
  relevantMemories: ContextMemoryResult[];
  todayMemory: string;
  curatedMemory: string;
  reviewLearnings: string;
  skillSuggestions: SkillSuggestionResult[];
  combinedPrompt: string;
}

const CONTEXT_SKILL_LIMIT = 3;

export class ContextBuilder {
  private readonly memory: MemoryService;
  private readonly dailyMemory: DailyMemoryService;
  private interReviewService!: InterReviewService;
  private readonly skillSystem: SkillSystem;
  private readonly memoryDir: string;
  private readonly embedding?: EmbeddingProvider;
  private readonly db: DatabaseClient;
  private cachedCuratedMemory: string = '';
  private curatedMemoryLoaded: number = 0;

  constructor(
    db: DatabaseClient,
    config?: {
      memoryDir?: string;
      embedding?: EmbeddingConfig;
    }
  ) {
    this.db = db;
    this.memoryDir = config?.memoryDir ?? DEFAULT_MEMORY_DIR;

    let embeddingProvider: EmbeddingProvider | undefined;
    if (config?.embedding) {
      try {
        embeddingProvider = createEmbeddingProvider(config.embedding);
        logger.info(`ContextBuilder embedding provider: ${config.embedding.provider}`);
      } catch (error) {
        logger.warn('Failed to initialize embedding provider for ContextBuilder:', error);
      }
    }

    this.memory = new MemoryService(db, undefined, embeddingProvider);
    this.dailyMemory = new DailyMemoryService({ memoryDir: this.memoryDir });
    this.skillSystem = new SkillSystem();
    this.skillSystem.setDatabaseClient(db);
    if (embeddingProvider) {
      this.skillSystem.setEmbeddingConfig({
        provider: 'ollama',
        model: 'nomic-embed-text',
      });
    }
    this.embedding = embeddingProvider;
    this.initializeSkillSystem();
    this.initializeInterReviewService();
  }

  private async initializeInterReviewService(): Promise<void> {
    this.interReviewService = await InterReviewService.create(this.db);
  }

  private async initializeSkillSystem(): Promise<void> {
    try {
      if (this.skillSystem.initialize) {
        await this.skillSystem.initialize();
      }
    } catch (err) {
      logger.warn('SkillSystem initialization failed:', err);
    }
  }

  async ensureSkillsLoaded(): Promise<void> {
    await this.initializeSkillSystem();
  }

  async buildContext(input: TaskContextInput): Promise<BuiltContext> {
    const taskDescription = input.description || input.title;

    const [relevantMemories, todayMemory, curatedMemory, reviewLearnings, skillSuggestions] =
      await Promise.all([
        this.findRelevantMemories(taskDescription),
        this.dailyMemory.readToday(),
        this.loadCuratedMemory(),
        this.loadReviewLearnings(taskDescription),
        this.findRelevantSkills(taskDescription),
      ]);

    const combinedPrompt = this.combineContext(
      taskDescription,
      relevantMemories,
      todayMemory,
      curatedMemory,
      reviewLearnings,
      skillSuggestions
    );

    return {
      originalTask: taskDescription,
      relevantMemories,
      todayMemory,
      curatedMemory,
      reviewLearnings,
      skillSuggestions,
      combinedPrompt,
    };
  }

  private async findRelevantSkills(taskContext: string): Promise<SkillSuggestionResult[]> {
    try {
      const suggestions = await this.skillSystem.suggestSkills(taskContext, CONTEXT_SKILL_LIMIT);
      return suggestions.map(s => ({
        name: s.skill.name,
        description: s.skill.description || s.why,
        matchScore: s.matchScore,
        quickStart: s.quickStart,
      }));
    } catch (error) {
      logger.debug('Failed to find relevant skills:', error);
      return [];
    }
  }

  private async loadReviewLearnings(topic?: string): Promise<string> {
    try {
      return await this.interReviewService.getLearningsForAIContext(topic);
    } catch (error) {
      logger.debug('Failed to load review learnings:', error);
      return '';
    }
  }

  private async findRelevantMemories(query: string): Promise<ContextMemoryResult[]> {
    if (!this.embedding) {
      logger.debug('No embedding provider, using keyword search');
      const results = await this.memory.search(query, CONTEXT_MEMORY_LIMIT);
      return results.map(m => ({
        id: m.id,
        content: m.content,
        similarity: 0.5,
        metadata: m.metadata,
      }));
    }

    try {
      const vectorResults = await this.memory.vectorSearch(
        query,
        undefined,
        CONTEXT_MEMORY_LIMIT,
        0.5
      );

      return vectorResults.map(r => ({
        id: r.id,
        content: r.content,
        similarity: r.similarity,
        metadata: r.metadata,
      }));
    } catch (error) {
      logger.warn('Vector search failed, falling back to keyword search:', error);
      const results = await this.memory.search(query, CONTEXT_MEMORY_LIMIT);
      return results.map(m => ({
        id: m.id,
        content: m.content,
        similarity: 0.5,
        metadata: m.metadata,
      }));
    }
  }

  private async loadCuratedMemory(): Promise<string> {
    const now = Date.now();
    if (this.cachedCuratedMemory && now - this.curatedMemoryLoaded < CURATED_MEMORY_TTL_MS) {
      return this.cachedCuratedMemory;
    }

    try {
      const filePath = path.join(this.memoryDir, MEMORY_FILE);
      await fs.access(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      this.cachedCuratedMemory = content;
      this.curatedMemoryLoaded = now;
      return content;
    } catch {
      return '';
    }
  }

  private combineContext(
    task: string,
    memories: ContextMemoryResult[],
    todayMemory: string,
    curatedMemory: string,
    reviewLearnings: string,
    skillSuggestions?: SkillSuggestionResult[]
  ): string {
    const parts: string[] = [];

    if (curatedMemory) {
      parts.push(`## Long-term Memory\n${curatedMemory}\n`);
    }

    if (skillSuggestions && skillSuggestions.length > 0) {
      const skillList = skillSuggestions
        .map(
          s => `- **${s.name}**: ${s.description}${s.quickStart ? ` (Quick: ${s.quickStart})` : ''}`
        )
        .join('\n');
      parts.push(`## Relevant Skills\n${skillList}\n`);
    }

    if (reviewLearnings) {
      parts.push(`## AI Review Learnings\n${reviewLearnings}\n`);
    }

    if (memories.length > 0) {
      const memoryList = memories
        .map(
          m =>
            `- ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''} (relevance: ${(m.similarity * 100).toFixed(0)}%)`
        )
        .join('\n');
      parts.push(`## Relevant Past Experience\n${memoryList}\n`);
    }

    if (todayMemory) {
      const todayEntries = todayMemory
        .split('\n')
        .filter(l => l.trim())
        .slice(0, 5)
        .join('\n');
      if (todayEntries) {
        parts.push(`## Today's Activity\n${todayEntries}\n`);
      }
    }

    parts.push(`## Current Task\n${task}`);

    return parts.join('\n\n');
  }

  async updateCuratedMemory(newContent: string): Promise<void> {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      const filePath = path.join(this.memoryDir, MEMORY_FILE);
      await fs.writeFile(filePath, newContent, 'utf-8');
      this.cachedCuratedMemory = newContent;
      this.curatedMemoryLoaded = Date.now();
      logger.info('Updated curated memory');
    } catch (error) {
      logger.error('Failed to update curated memory:', error);
      throw error;
    }
  }
}
