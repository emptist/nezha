import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseClient } from '../db/DatabaseClient.js';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ConversationResult {
  success: boolean;
  output: string;
  artifacts: string[];
}

export interface ConversationLearning {
  insights: string[];
  improvements: string[];
  patterns: string[];
}

export interface ConversationMetadata {
  duration_ms: number;
  tokens_used?: number;
  model?: string;
}

export interface ConversationLog {
  timestamp: Date;
  session_id: string;
  conversation_type: 'task_execution' | 'problem_solving' | 'learning' | 'review';
  participants: string[];
  task: {
    id: string;
    title: string;
    description: string;
  };
  messages: ConversationMessage[];
  result?: ConversationResult;
  learning?: ConversationLearning;
  metadata: ConversationMetadata;
}

export interface ConversationRecord {
  id: string;
  project_id?: string;
  session_id: string;
  task_id?: string;
  conversation_type: string;
  title: string;
  participants: string[];
  messages: ConversationMessage[];
  result?: ConversationResult;
  success?: boolean;
  duration_ms?: number;
  tokens_used?: number;
  model?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface IndexEntry {
  session_id: string;
  timestamp: string;
  task_title: string;
  conversation_type: string;
  success?: boolean;
}

export class ConversationLogger {
  private currentConversation: ConversationLog | null = null;
  private readonly logDir: string;
  private startTime: number = 0;
  private writeStream: fs.WriteStream | null = null;
  private indexWritePromise: Promise<void> | null = null;
  private initialized: boolean = false;
  private indexCache: IndexEntry[] | null = null;
  private indexDirty: boolean = false;
  private readonly dbClient: DatabaseClient | null = null;
  private readonly projectId?: string;

  constructor(logDir: string = 'conversations', dbClient?: DatabaseClient, projectId?: string) {
    this.logDir = logDir;
    this.dbClient = dbClient || null;
    this.projectId = projectId;
  }

  hasDatabase(): boolean {
    return this.dbClient !== null;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.ensureLogDirectory();
    this.initialized = true;
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.promises.access(this.logDir);
    } catch {
      await fs.promises.mkdir(this.logDir, { recursive: true });
    }
  }

  startConversation(
    task: { id: string; title: string; description: string },
    type: 'task_execution' | 'problem_solving' | 'learning' | 'review' = 'task_execution'
  ): string {
    this.startTime = Date.now();
    this.currentConversation = {
      timestamp: new Date(),
      session_id: uuidv4(),
      conversation_type: type,
      participants: ['AI'],
      task,
      messages: [],
      metadata: {
        duration_ms: 0,
      },
    };
    return this.currentConversation.session_id;
  }

  addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    if (!this.currentConversation) {
      throw new Error('No active conversation. Call startConversation first.');
    }
    this.currentConversation.messages.push({
      role,
      content,
      timestamp: new Date(),
    });
  }

  addParticipant(participant: string): void {
    if (!this.currentConversation) {
      throw new Error('No active conversation. Call startConversation first.');
    }
    if (!this.currentConversation.participants.includes(participant)) {
      this.currentConversation.participants.push(participant);
    }
  }

  setResult(result: ConversationResult): void {
    if (!this.currentConversation) {
      throw new Error('No active conversation. Call startConversation first.');
    }
    this.currentConversation.result = result;
  }

  setLearning(learning: ConversationLearning): void {
    if (!this.currentConversation) {
      throw new Error('No active conversation. Call startConversation first.');
    }
    this.currentConversation.learning = learning;
  }

  setMetadata(metadata: Partial<ConversationMetadata>): void {
    if (!this.currentConversation) {
      throw new Error('No active conversation. Call startConversation first.');
    }
    this.currentConversation.metadata = {
      ...this.currentConversation.metadata,
      ...metadata,
    };
  }

  async endConversation(result?: ConversationResult): Promise<void> {
    if (!this.currentConversation) {
      return;
    }

    if (result) {
      this.currentConversation.result = result;
    }

    this.currentConversation.metadata.duration_ms = Date.now() - this.startTime;
    await this.saveConversation();
    this.currentConversation = null;
  }

  private async saveConversation(): Promise<void> {
    if (!this.currentConversation) {
      return;
    }

    await this.ensureInitialized();

    const dateParts = new Date().toISOString().split('T');
    const date = dateParts[0] ?? '';
    const dateDir = path.join(this.logDir, date);

    try {
      await this.ensureDirectoryExists(dateDir);
    } catch (error) {
      console.error('Failed to create date directory:', error);
      throw error;
    }

    const logPath = path.join(dateDir, `session-${this.currentConversation.session_id}.jsonl`);
    const logEntry = JSON.stringify(this.currentConversation) + '\n';

    try {
      await fs.promises.writeFile(logPath, logEntry, 'utf-8');
      await this.updateIndex();
    } catch (error) {
      console.error('Failed to save conversation to JSONL:', error);
      throw error;
    }

    if (this.dbClient) {
      try {
        await this.saveToDatabase();
      } catch (error) {
        console.error('Failed to save conversation to database:', error);
      }
    }
  }

  private async saveToDatabase(): Promise<void> {
    if (!this.currentConversation || !this.dbClient) {
      return;
    }

    const messages = this.currentConversation.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
    }));

    await this.dbClient.saveConversation({
      sessionId: this.currentConversation.session_id,
      taskId: this.currentConversation.task.id,
      projectId: this.projectId,
      conversationType: this.currentConversation.conversation_type,
      title: this.currentConversation.task.title,
      participants: this.currentConversation.participants,
      messages,
      result: this.currentConversation.result,
      success: this.currentConversation.result?.success,
      durationMs: this.currentConversation.metadata.duration_ms,
      tokensUsed: this.currentConversation.metadata.tokens_used,
      model: this.currentConversation.metadata.model,
      metadata: {
        task_description: this.currentConversation.task.description,
        learning: this.currentConversation.learning,
      },
    });
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  private async updateIndex(): Promise<void> {
    if (!this.currentConversation) {
      return;
    }

    const newEntry: IndexEntry = {
      session_id: this.currentConversation.session_id,
      timestamp: this.currentConversation.timestamp.toISOString(),
      task_title: this.currentConversation.task.title,
      conversation_type: this.currentConversation.conversation_type,
      success: this.currentConversation.result?.success,
    };

    if (this.indexCache) {
      this.indexCache.push(newEntry);
      this.indexDirty = true;
      this.scheduleIndexFlush();
      return;
    }

    await this.flushIndexToDisk(newEntry);
  }

  private scheduleIndexFlush(): void {
    if (this.indexWritePromise) {
      return;
    }

    this.indexWritePromise = Promise.resolve().then(async () => {
      if (this.indexCache && this.indexDirty) {
        await this.writeIndexToDisk(this.indexCache);
        this.indexDirty = false;
      }
      this.indexWritePromise = null;
    });
  }

  private async flushIndexToDisk(newEntry: IndexEntry): Promise<void> {
    const indexPath = path.join(this.logDir, 'index.json');

    try {
      const content = await fs.promises.readFile(indexPath, 'utf-8');
      const index: IndexEntry[] = JSON.parse(content);
      index.push(newEntry);
      this.indexCache = index;
      this.indexDirty = true;
      await this.writeIndexToDisk(index);
      this.indexDirty = false;
    } catch {
      const index: IndexEntry[] = [];
      index.push(newEntry);
      this.indexCache = index;
      this.indexDirty = true;
      await this.writeIndexToDisk(index);
      this.indexDirty = false;
    }
  }

  private async writeIndexToDisk(index: IndexEntry[]): Promise<void> {
    const indexPath = path.join(this.logDir, 'index.json');
    const tempIndexPath = path.join(this.logDir, 'index.json.tmp');

    const tempContent = JSON.stringify(index, null, 2);

    try {
      await fs.promises.mkdir(this.logDir, { recursive: true });
      await fs.promises.writeFile(tempIndexPath, tempContent, 'utf-8');
      await fs.promises.rename(tempIndexPath, indexPath);
    } catch (error) {
      try {
        await fs.promises.unlink(tempIndexPath);
      } catch {
        // ignore cleanup error
      }
      throw error;
    }
  }

  getCurrentSessionId(): string | null {
    return this.currentConversation?.session_id || null;
  }

  async getConversationLog(sessionId: string): Promise<ConversationLog | null> {
    if (this.indexCache) {
      const entry = this.indexCache.find(e => e.session_id === sessionId);
      if (!entry) {
        return null;
      }
      return this.getConversationLogFromDisk(entry);
    }

    const indexPath = path.join(this.logDir, 'index.json');

    try {
      const indexContent = await fs.promises.readFile(indexPath, 'utf-8');
      const index: IndexEntry[] = JSON.parse(indexContent);
      const entry = index.find(e => e.session_id === sessionId);
      if (!entry) {
        return null;
      }

      return this.getConversationLogFromDisk(entry);
    } catch {
      return null;
    }
  }

  private async getConversationLogFromDisk(entry: IndexEntry): Promise<ConversationLog | null> {
    const dateParts = entry.timestamp.split('T');
    const date = dateParts[0] ?? '';
    const sessionId = entry.session_id;
    if (!sessionId) {
      return null;
    }
    const logPath = path.join(this.logDir, date, `session-${sessionId}.jsonl`);

    try {
      const logContent = await fs.promises.readFile(logPath, 'utf-8');
      return JSON.parse(logContent);
    } catch {
      return null;
    }
  }

  async listConversations(date?: string): Promise<IndexEntry[]> {
    if (this.indexCache) {
      if (date) {
        return this.indexCache.filter(entry => entry.timestamp.startsWith(date));
      }
      return this.indexCache;
    }

    const indexPath = path.join(this.logDir, 'index.json');

    try {
      const indexContent = await fs.promises.readFile(indexPath, 'utf-8');
      const index: IndexEntry[] = JSON.parse(indexContent);
      this.indexCache = index;
      if (date) {
        return index.filter(entry => entry.timestamp.startsWith(date));
      }
      return index;
    } catch {
      return [];
    }
  }

  async searchConversations(params: {
    query?: string;
    taskId?: string;
    conversationType?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ConversationRecord[]> {
    if (!this.dbClient) {
      throw new Error('Database client not configured');
    }

    const results = await this.dbClient.searchConversations({
      ...params,
      projectId: this.projectId,
    });

    return results as unknown as ConversationRecord[];
  }

  async getConversationByTaskId(taskId: string): Promise<ConversationRecord[]> {
    if (!this.dbClient) {
      throw new Error('Database client not configured');
    }

    const results = await this.dbClient.getConversationsByTaskId(taskId);
    return results as unknown as ConversationRecord[];
  }

  async getConversationBySessionId(sessionId: string): Promise<ConversationRecord | null> {
    if (!this.dbClient) {
      return this.getConversationLog(sessionId) as Promise<ConversationRecord | null>;
    }

    const result = await this.dbClient.getConversationBySessionId(sessionId);
    return result as unknown as ConversationRecord | null;
  }

  async getConversationsByDateRange(startDate: Date, endDate: Date): Promise<ConversationRecord[]> {
    if (!this.dbClient) {
      throw new Error('Database client not configured');
    }

    const results = await this.dbClient.getConversationsByDateRange(
      startDate,
      endDate,
      this.projectId
    );
    return results as unknown as ConversationRecord[];
  }

  async getConversationStats(startDate?: Date, endDate?: Date): Promise<Record<string, unknown>[]> {
    if (!this.dbClient) {
      throw new Error('Database client not configured');
    }

    return this.dbClient.getConversationStats({
      projectId: this.projectId,
      startDate,
      endDate,
    });
  }

  async listConversationsFromDb(params?: {
    conversationType?: string;
    limit?: number;
    offset?: number;
  }): Promise<ConversationRecord[]> {
    if (!this.dbClient) {
      throw new Error('Database client not configured');
    }

    const results = await this.dbClient.listConversations({
      projectId: this.projectId,
      ...params,
    });

    return results as unknown as ConversationRecord[];
  }

  async close(): Promise<void> {
    if (this.writeStream) {
      await new Promise<void>(resolve => {
        this.writeStream!.end(() => {
          this.writeStream = null;
          resolve();
        });
      });
    }
    if (this.indexWritePromise) {
      await this.indexWritePromise;
    }
    this.currentConversation = null;
  }
}
