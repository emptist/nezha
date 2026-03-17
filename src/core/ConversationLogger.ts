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

export class ConversationLogger {
  private currentConversation: ConversationLog | null = null;
  private readonly logDir: string;
  private startTime: number = 0;

  constructor(logDir: string = 'conversations') {
    this.logDir = logDir;
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
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

  endConversation(result?: ConversationResult): void {
    if (!this.currentConversation) {
      return;
    }

    if (result) {
      this.currentConversation.result = result;
    }

    this.currentConversation.metadata.duration_ms = Date.now() - this.startTime;
    this.saveConversation();
    this.currentConversation = null;
  }

  private saveConversation(): void {
    if (!this.currentConversation) {
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    const dateDir = path.join(this.logDir, date);
    
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }

    const logPath = path.join(dateDir, `session-${this.currentConversation.session_id}.jsonl`);
    const logEntry = JSON.stringify(this.currentConversation) + '\n';
    
    fs.writeFileSync(logPath, logEntry, 'utf-8');
    this.updateIndex();
  }

  private updateIndex(): void {
    if (!this.currentConversation) {
      return;
    }

    const indexPath = path.join(this.logDir, 'index.json');
    let index: Array<{
      session_id: string;
      timestamp: string;
      task_title: string;
      conversation_type: string;
      success?: boolean;
    }> = [];

    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } catch (error) {
        index = [];
      }
    }

    index.push({
      session_id: this.currentConversation.session_id,
      timestamp: this.currentConversation.timestamp.toISOString(),
      task_title: this.currentConversation.task.title,
      conversation_type: this.currentConversation.conversation_type,
      success: this.currentConversation.result?.success,
    });

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  getCurrentSessionId(): string | null {
    return this.currentConversation?.session_id || null;
  }

  getConversationLog(sessionId: string): ConversationLog | null {
    const indexPath = path.join(this.logDir, 'index.json');
    if (!fs.existsSync(indexPath)) {
      return null;
    }

    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const entry = index.find((e: { session_id: string }) => e.session_id === sessionId);
      if (!entry) {
        return null;
      }

      const date = entry.timestamp.split('T')[0];
      const logPath = path.join(this.logDir, date, `session-${sessionId}.jsonl`);
      
      if (!fs.existsSync(logPath)) {
        return null;
      }

      const logContent = fs.readFileSync(logPath, 'utf-8');
      return JSON.parse(logContent);
    } catch (error) {
      return null;
    }
  }

  listConversations(date?: string): Array<{
    session_id: string;
    timestamp: string;
    task_title: string;
    conversation_type: string;
    success?: boolean;
  }> {
    const indexPath = path.join(this.logDir, 'index.json');
    if (!fs.existsSync(indexPath)) {
      return [];
    }

    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (date) {
        return index.filter((entry: { timestamp: string }) => entry.timestamp.startsWith(date));
      }
      return index;
    } catch (error) {
      return [];
    }
  }
}
