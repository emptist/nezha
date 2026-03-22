import { config } from 'dotenv';
config();

import { Config } from '../config/Config.js';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { HeartbeatService } from '../services/HeartbeatService.js';
import { HealthServer } from '../services/HealthServer.js';
import { CheckpointService } from '../services/CheckpointService.js';
import { AgentSystem } from '../core/AgentSystem.js';
import { logger } from '../utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 30000;
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
  logger.info('Starting Nezha Daemon (lightweight mode)...');

  const config = Config.getInstance();
  const db = new DatabaseClient(config);
  const checkpointService = new CheckpointService();

  const embeddingConfig = config.getEmbeddingConfig();
  const transportConfig = config.getTransportConfig();

  const agentSystem = new AgentSystem({
    maxAgents: 10,
    heartbeatIntervalMs: config.getTaskConfig().heartbeatIntervalMs,
    agentConfig: {},
    unifiedAgentConfig: {
      mode: transportConfig.mode,
      serverUrl: transportConfig.opencodeApiUrl,
    },
    defaultMode: transportConfig.mode,
  });
  await agentSystem.start();

  const heartbeatService = new HeartbeatService(db, {
    heartbeatIntervalMs: config.getTaskConfig().heartbeatIntervalMs,
    embedding: embeddingConfig,
    agent: {
      mode: transportConfig.mode,
      serverUrl: transportConfig.opencodeApiUrl,
    },
  });

  heartbeatService.setCheckpointService(checkpointService);

  const healthServer = new HealthServer(db, 4097);
  healthServer.setAgentSystem(agentSystem);
  await healthServer.start();

  await heartbeatService.start();

  const shutdown = async (signal: string) => {
    logger.info(`Graceful shutdown initiated (${signal})...`);

    logger.info('Saving checkpoint state...');
    await checkpointService.saveState();

    logger.info('Waiting for running tasks...');
    const runningCount = await waitForRunningTasks(db, TASK_WAIT_TIMEOUT_MS);

    await heartbeatService.stop();
    await healthServer.stop();
    await agentSystem.stop();
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
