import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConversationLogger } from '../core/ConversationLogger.js';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

describe('ConversationLogger', () => {
  let logger: ConversationLogger;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join('/tmp', `conversation-logger-test-${randomUUID()}`);
    logger = new ConversationLogger(testDir);
  });

  afterEach(async () => {
    await logger.close();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should create an instance', () => {
    expect(logger).toBeDefined();
  });

  it('should initialize log directory on first use', async () => {
    await fs.stat(testDir).catch(() => {});
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    await logger.endConversation();

    const stat = await fs.stat(testDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('should start a conversation and return session id', () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    const sessionId = logger.startConversation(task);
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('should add messages to conversation', () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    logger.addMessage('user', 'Hello');
    logger.addMessage('assistant', 'Hi there');
    expect(logger.getCurrentSessionId()).toBeDefined();
  });

  it('should throw when adding message without active conversation', () => {
    expect(() => logger.addMessage('user', 'Hello')).toThrow('No active conversation');
  });

  it('should add participants', () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    logger.addParticipant('User');
    logger.addParticipant('AI');
    expect(() => logger.addParticipant('User')).not.toThrow();
  });

  it('should throw when adding participant without active conversation', () => {
    expect(() => logger.addParticipant('User')).toThrow('No active conversation');
  });

  it('should set result', () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    logger.setResult({ success: true, output: 'Done', artifacts: [] });
    expect(() => logger.setResult({ success: true, output: 'Done', artifacts: [] })).not.toThrow();
  });

  it('should throw when setting result without active conversation', () => {
    expect(() => logger.setResult({ success: true, output: 'Done', artifacts: [] })).toThrow(
      'No active conversation'
    );
  });

  it('should set learning', () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    logger.setLearning({ insights: ['insight1'], improvements: [], patterns: [] });
    expect(() =>
      logger.setLearning({ insights: ['insight1'], improvements: [], patterns: [] })
    ).not.toThrow();
  });

  it('should set metadata', () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    logger.setMetadata({ tokens_used: 100 });
    logger.setMetadata({ model: 'gpt-4' });
    expect(() => logger.setMetadata({ tokens_used: 100 })).not.toThrow();
  });

  it('should end conversation and save to file', async () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    const sessionId = logger.getCurrentSessionId()!;
    logger.addMessage('user', 'Hello');
    logger.addMessage('assistant', 'Hi');
    logger.setResult({ success: true, output: 'Done', artifacts: [] });

    await logger.endConversation();

    const dateParts = new Date().toISOString().split('T');
    const date = dateParts[0] ?? '';
    const logPath = path.join(testDir, date, `session-${sessionId}.jsonl`);
    const content = await fs.readFile(logPath, 'utf-8');
    const log = JSON.parse(content.trim());

    expect(log.session_id).toBe(sessionId);
    expect(log.messages).toHaveLength(2);
    expect(log.result?.success).toBe(true);
    expect(log.metadata.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('should update index.json after ending conversation', async () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    await logger.endConversation();

    const indexPath = path.join(testDir, 'index.json');
    const content = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(content);

    expect(index).toHaveLength(1);
    expect(index[0].task_title).toBe('Test Task');
  });

  it('should get conversation log by session id', async () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    const sessionId = logger.getCurrentSessionId()!;
    logger.addMessage('user', 'Hello');
    await logger.endConversation();

    const log = await logger.getConversationLog(sessionId);
    expect(log).toBeDefined();
    expect(log?.session_id).toBe(sessionId);
    expect(log?.messages).toHaveLength(1);
  });

  it('should return null for non-existent session', async () => {
    const log = await logger.getConversationLog('non-existent-id');
    expect(log).toBeNull();
  });

  it('should list all conversations', async () => {
    const task1 = { id: 'task-1', title: 'Task 1', description: 'Desc 1' };
    const task2 = { id: 'task-2', title: 'Task 2', description: 'Desc 2' };

    logger.startConversation(task1);
    await logger.endConversation();

    logger.startConversation(task2);
    await logger.endConversation();

    const conversations = await logger.listConversations();
    expect(conversations).toHaveLength(2);
  });

  it('should filter conversations by date', async () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    await logger.endConversation();

    const today = new Date().toISOString().split('T')[0];
    const conversations = await logger.listConversations(today);
    expect(conversations).toHaveLength(1);

    const otherDate = await logger.listConversations('2020-01-01');
    expect(otherDate).toHaveLength(0);
  });

  it('should handle index.json corruption gracefully', async () => {
    await fs.mkdir(testDir, { recursive: true });
    const indexPath = path.join(testDir, 'index.json');
    await fs.writeFile(indexPath, 'invalid json{');

    const conversations = await logger.listConversations();
    expect(conversations).toEqual([]);
  });

  it('should close and clean up resources', async () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    await logger.close();

    expect(() => logger.addMessage('user', 'test')).toThrow('No active conversation');
  });

  it('should handle close when no active conversation', async () => {
    await logger.close();
    expect(logger).toBeDefined();
  });

  it('should clear currentConversation after close', async () => {
    const task = { id: 'task-1', title: 'Test Task', description: 'Test description' };
    logger.startConversation(task);
    logger.addMessage('user', 'test');
    await logger.close();
    await logger.close();
  });

  it('should allow starting new conversation after close', async () => {
    const task1 = { id: 'task-1', title: 'Task 1', description: 'Test' };
    logger.startConversation(task1);
    await logger.endConversation();
    await logger.close();

    const task2 = { id: 'task-2', title: 'Task 2', description: 'Test' };
    const sessionId = logger.startConversation(task2);
    expect(sessionId).toBeDefined();
    await logger.close();
  });

  it('should return all conversations when no date filter', async () => {
    const task1 = { id: 'task-1', title: 'Task 1', description: 'Test 1' };

    logger.startConversation(task1);
    logger.addMessage('user', 'Hello');
    await logger.endConversation();

    const conversations = await logger.listConversations();
    expect(conversations.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter conversations by date when provided', async () => {
    const task = { id: 'task-1', title: 'Task', description: 'Test' };
    logger.startConversation(task);
    logger.addMessage('user', 'test');
    await logger.endConversation();

    const today = new Date().toISOString().split('T')[0];
    const filtered = await logger.listConversations(today);
    expect(filtered.length).toBeGreaterThanOrEqual(1);

    const yesterday = await logger.listConversations('1999-01-01');
    expect(yesterday.length).toBe(0);
  });
});
