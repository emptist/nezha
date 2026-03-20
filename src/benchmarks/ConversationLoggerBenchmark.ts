import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { benchmarkAsync, formatResult, type BenchmarkResult } from './timing.js';
import { ConversationLogger } from '../core/ConversationLogger.js';

export async function runConversationLoggerBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const testDir = path.join('/tmp', `bench-conversation-${randomUUID()}`);

  await fs.mkdir(testDir, { recursive: true });

    results.push(
    await benchmarkAsync('ConversationLogger: startConversation', async () => {
      const logger = new ConversationLogger(testDir);
      logger.startConversation({
        id: randomUUID(),
        title: 'Test Task',
        description: 'Test description',
      });
    })
  );

  results.push(
    await benchmarkAsync('ConversationLogger: addMessage (single)', async () => {
      const logger = new ConversationLogger(testDir);
      logger.startConversation({
        id: randomUUID(),
        title: 'Test Task',
        description: 'Test description',
      });
      logger.addMessage('user', 'Hello, this is a test message');
      logger.addMessage('assistant', 'Hello! How can I help you today?');
    })
  );

  results.push(
    await benchmarkAsync('ConversationLogger: endConversation (with write)', async () => {
      const logger = new ConversationLogger(testDir);
      logger.startConversation({
        id: randomUUID(),
        title: 'Test Task',
        description: 'Test description',
      });
      logger.addMessage('user', 'Hello, this is a test message');
      logger.addMessage('assistant', 'Hello! How can I help you today?');
      logger.setResult({ success: true, output: 'Done', artifacts: [] });
      await logger.endConversation();
    })
  );

  results.push(
    await benchmarkAsync('ConversationLogger: full lifecycle (10 messages)', async () => {
      const logger = new ConversationLogger(testDir);
      logger.startConversation({
        id: randomUUID(),
        title: 'Test Task',
        description: 'Test description',
      });

      for (let i = 0; i < 10; i++) {
        logger.addMessage('user', `Message ${i}`);
        logger.addMessage('assistant', `Response ${i}`);
      }

      logger.setResult({ success: true, output: 'Completed', artifacts: ['file1.ts', 'file2.ts'] });
      await logger.endConversation();
    })
  );

  results.push(
    await benchmarkAsync('ConversationLogger: listConversations (indexed)', async () => {
      const logger = new ConversationLogger(testDir);
      await logger.listConversations();
    })
  );

  results.push(
    await benchmarkAsync('ConversationLogger: index update (cached)', async () => {
      const logger = new ConversationLogger(testDir);
      logger.startConversation({
        id: randomUUID(),
        title: 'Test Task',
        description: 'Test description',
      });
      logger.addMessage('user', 'Test');
      await logger.endConversation();
      await logger.listConversations();
    })
  );

    for (const result of results) {
    console.log(formatResult(result));
  }

  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {}); // Ignore cleanup errors

  return results;
}
