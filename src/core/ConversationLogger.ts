import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

  constructor(logDir: string = 'conversations') {
    this.logDir = logDir;
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

    const date = new Date().toISOString().split('T')[0];
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
      console.error('Failed to save conversation:', error);
      throw error;
    }
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

    const indexPath = path.join(this.logDir, 'index.json');
    const tempIndexPath = path.join(this.logDir, 'index.json.tmp');

    let index: IndexEntry[] = [];

    try {
      await fs.promises.access(indexPath);
      try {
        const content = await fs.promises.readFile(indexPath, 'utf-8');
        index = JSON.parse(content);
      } catch {
        index = [];
      }
    } catch {
      index = [];
    }

    const newEntry: IndexEntry = {
      session_id: this.currentConversation.session_id,
      timestamp: this.currentConversation.timestamp.toISOString(),
      task_title: this.currentConversation.task.title,
      conversation_type: this.currentConversation.conversation_type,
      success: this.currentConversation.result?.success,
    };

    index.push(newEntry);

    const tempContent = JSON.stringify(index, null, 2);

    try {
      await fs.promises.writeFile(tempIndexPath, tempContent, 'utf-8');
      await fs.promises.rename(tempIndexPath, indexPath);
    } catch (error) {
      try {
        await fs.promises.unlink(tempIndexPath);
      } catch {}
      throw error;
    }
  }

  getCurrentSessionId(): string | null {
    return this.currentConversation?.session_id || null;
  }

  async getConversationLog(sessionId: string): Promise<ConversationLog | null> {
    const indexPath = path.join(this.logDir, 'index.json');

    try {
      const indexContent = await fs.promises.readFile(indexPath, 'utf-8');
      const index: IndexEntry[] = JSON.parse(indexContent);
      const entry = index.find(e => e.session_id === sessionId);
      if (!entry) {
        return null;
      }

      const date = entry.timestamp.split('T')[0];
      const logPath = path.join(this.logDir, date, `session-${sessionId}.jsonl`);

      try {
        const logContent = await fs.promises.readFile(logPath, 'utf-8');
        return JSON.parse(logContent);
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  async listConversations(date?: string): Promise<IndexEntry[]> {
    const indexPath = path.join(this.logDir, 'index.json');

    try {
      const indexContent = await fs.promises.readFile(indexPath, 'utf-8');
      const index: IndexEntry[] = JSON.parse(indexContent);
      if (date) {
        return index.filter(entry => entry.timestamp.startsWith(date));
      }
      return index;
    } catch {
      return [];
    }
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
    this.currentConversation = null;
  }
}
