import { config } from 'dotenv';
config();

import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { HeartbeatService } from '../services/heartbeat/index.js';
import { HealthServer } from '../services/HealthServer.js';
import { OpenCodeReminderService } from '../services/OpenCodeReminderService.js';
import { logger } from '../utils/logger.js';

const TASK_WAIT_TIMEOUT_MS = 20000;

async function waitForRunningTasks(db: DatabaseClient, timeoutMs: number): Promise<number> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'RUNNING'`
    );
    const runningCount = parseInt(result.rows[0]?.count ?? '0', 10);

    if (runningCount === 0) {
      return 0;
    }

    logger.debug(`Waiting for ${runningCount} running tasks...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return (
    await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'RUNNING'`
    )
  ).rows.length;
}

async function main(): Promise<void> {
  logger.info('Starting Nezha Daemon...');

  const config = Config.getInstance();
  const db = new DatabaseClient(config);

  const heartbeatService = new HeartbeatService(db, {
    heartbeatIntervalMs: config.getTaskConfig().heartbeatIntervalMs,
  });

  const healthServer = new HealthServer(db, 4097);
  await healthServer.start();

  await heartbeatService.start();

  const opencodeReminder = new OpenCodeReminderService(db, {
    opencodeUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:56795',
    username: process.env.OPENCODE_SERVER_USERNAME,
    password: process.env.OPENCODE_SERVER_PASSWORD,
    reminderIntervalMs: 2 * 60 * 1000,
  });

  try {
    await opencodeReminder.start();
    logger.info('[Daemon] OpenCode reminder service started');
  } catch (error) {
    logger.warn('[Daemon] Failed to start OpenCode reminder service:', error);
  }

  const shutdown = async (signal: string) => {
    logger.info(`Graceful shutdown initiated (${signal})...`);

    logger.info('Waiting for running tasks...');
    const runningCount = await waitForRunningTasks(db, TASK_WAIT_TIMEOUT_MS);

    opencodeReminder.stop();
    await heartbeatService.stop();
    await healthServer.stop();
    await db.close();

    logger.info(`Shutdown complete. Tasks waiting: ${runningCount}`);
  };

  process.on('SIGINT', async () => {
    await shutdown('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await shutdown('SIGTERM');
    process.exit(0);
  });

  logger.info('Nezha Daemon running. PID:', process.pid);
}

main().catch(error => {
  logger.error('Daemon failed to start:', error);
  process.exit(1);
});
