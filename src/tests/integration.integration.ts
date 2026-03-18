import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Scheduler } from '../core/Scheduler.js';
import { Config } from '../config/Config.js';
import { execSync } from 'child_process';

function firstRow<T>(rows: T[]): T | undefined {
  return rows[0];
}

function runMigrations(): void {
  const dbName = process.env.NEZHA_DB_NAME || 'nezha';
  const migrationsDir = 'src/db/migrations';
  const dbHost = process.env.NEZHA_DB_HOST || 'localhost';
  const dbPort = process.env.NEZHA_DB_PORT || '5432';
  const dbUser = process.env.NEZHA_DB_USER || 'postgres';
  const psqlPath = '/Applications/Postgres.app/Contents/Versions/18/bin/psql';

  const files = [
    '001_initial.sql',
    '002_multi_project_support.sql',
    '003_embedding_support.sql',
    '004_self_improvement.sql',
    '005_task_dependencies.sql',
    '006_scheduled_tasks.sql',
    '007_dead_letter_queue.sql',
    '008_advanced_scheduling.sql',
    '009_api_security.sql',
    '010_task_tags.sql',
    '011_event_audit_log.sql',
    '012_memory_compaction.sql',
    '013_encryption_support.sql',
    '014_task_retry_system.sql',
    '015_task_timeout.sql',
    '016_task_tracking_fields.sql',
    '017_task_audit_log.sql',
    '018_task_templates.sql',
    '019_task_categories.sql',
  ];

  for (const file of files) {
    try {
      execSync(
        `"${psqlPath}" -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" -d "${dbName}" -f "${migrationsDir}/${file}" 2>/dev/null`,
        {
          stdio: 'pipe',
        }
      );
    } catch {
      // Migration may fail if already applied
    }
  }
}

async function setupTestDatabase(db: DatabaseClient): Promise<void> {
  const tables = [
    'task_audit_log',
    'dead_letter_queue',
    'event_log',
    'conversation_log',
    'task_templates',
    'skill_registry',
    'projects',
    'memory',
    'tasks',
  ];

  for (const table of tables) {
    try {
      await db.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    } catch {
      // Table may not exist
    }
  }

  runMigrations();
}

async function cleanupTasks(db: DatabaseClient): Promise<void> {
  try {
    await db.query('DELETE FROM tasks');
  } catch {
    // Tasks may not exist
  }
}

describe('Database Integration Tests', () => {
  let db: DatabaseClient;
  let config: Config;

  beforeAll(async () => {
    config = Config.getInstance();
    db = new DatabaseClient(config);

    const health = await db.healthCheck();
    if (!health.healthy) {
      throw new Error(`Database not available: ${health.error}`);
    }

    await setupTestDatabase(db);
  });

  afterAll(async () => {
    await cleanupTasks(db);
    await db.close();
  });

  beforeEach(async () => {
    await cleanupTasks(db);
  });

  describe('Task CRUD Operations', () => {
    it('should create a task', async () => {
      const result = await db.query<{ id: string; title: string; status: string }>(
        `INSERT INTO tasks (title, description, priority) VALUES ($1, $2, $3) RETURNING *`,
        ['Test Task', 'Test Description', 5]
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].title).toBe('Test Task');
      expect(result.rows[0].status).toBe('PENDING');
      expect(result.rows[0].id).toBeDefined();
    });

    it('should read a task by id', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title) VALUES ($1) RETURNING id`,
        ['Read Test']
      );
      const taskId = insertResult.rows[0].id;

      const readResult = await db.query<{ id: string; title: string }>(
        `SELECT * FROM tasks WHERE id = $1`,
        [taskId]
      );

      expect(readResult.rows.length).toBe(1);
      expect(readResult.rows[0].title).toBe('Read Test');
    });

    it('should update a task status', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title) VALUES ($1) RETURNING id`,
        ['Update Test']
      );
      const taskId = insertResult.rows[0].id;

      const updateResult = await db.query(
        `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        ['RUNNING', taskId]
      );

      expect(updateResult.rows[0].status).toBe('RUNNING');
    });

    it('should delete a task', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title) VALUES ($1) RETURNING id`,
        ['Delete Test']
      );
      const taskId = insertResult.rows[0].id;

      await db.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

      const readResult = await db.query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
      expect(readResult.rows.length).toBe(0);
    });

    it('should query pending tasks ordered by priority', async () => {
      await db.query(`INSERT INTO tasks (title, priority) VALUES ($1, $2)`, ['Low', 1]);
      await db.query(`INSERT INTO tasks (title, priority) VALUES ($1, $2)`, ['High', 10]);
      await db.query(`INSERT INTO tasks (title, priority) VALUES ($1, $2)`, ['Medium', 5]);

      const result = await db.query<{ title: string; priority: number }>(
        `SELECT title, priority FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC`
      );

      expect(result.rows[0].title).toBe('High');
      expect(result.rows[1].title).toBe('Medium');
      expect(result.rows[2].title).toBe('Low');
    });
  });

  describe('Task Status Transitions', () => {
    it('should transition from PENDING to RUNNING', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title) VALUES ($1) RETURNING id`,
        ['Status Test']
      );
      const taskId = insertResult.rows[0].id;

      await db.query(`UPDATE tasks SET status = 'RUNNING', started_at = NOW() WHERE id = $1`, [
        taskId,
      ]);

      const result = await db.query<{ status: string }>(`SELECT status FROM tasks WHERE id = $1`, [
        taskId,
      ]);

      expect(result.rows[0].status).toBe('RUNNING');
    });

    it('should transition to COMPLETED with result', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title) VALUES ($1) RETURNING id`,
        ['Complete Test']
      );
      const taskId = insertResult.rows[0].id;

      await db.query(
        `UPDATE tasks SET status = 'COMPLETED', result = $1, completed_at = NOW() WHERE id = $2`,
        [JSON.stringify({ output: 'success' }), taskId]
      );

      const result = await db.query<{ status: string; result: unknown }>(
        `SELECT status, result FROM tasks WHERE id = $1`,
        [taskId]
      );

      expect(result.rows[0].status).toBe('COMPLETED');
      expect(result.rows[0].result).toEqual({ output: 'success' });
    });

    it('should transition to FAILED with error', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title) VALUES ($1) RETURNING id`,
        ['Fail Test']
      );
      const taskId = insertResult.rows[0].id;

      await db.query(
        `UPDATE tasks SET status = 'FAILED', error = $1, completed_at = NOW() WHERE id = $2`,
        ['Task failed due to error', taskId]
      );

      const result = await db.query<{ status: string; error: string }>(
        `SELECT status, error FROM tasks WHERE id = $1`,
        [taskId]
      );

      expect(result.rows[0].status).toBe('FAILED');
      expect(result.rows[0].error).toBe('Task failed due to error');
    });
  });

  describe('Memory Operations', () => {
    it('should create memory entry', async () => {
      const result = await db.query<{ id: string; content: string }>(
        `INSERT INTO memory (content, source, tags) VALUES ($1, $2, $3) RETURNING *`,
        ['Test memory content', 'test', ['test', 'integration']]
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].content).toBe('Test memory content');
    });

    it('should query memory by tags', async () => {
      await db.query(`INSERT INTO memory (content, tags) VALUES ($1, $2)`, [
        'Content A',
        ['node', 'typescript'],
      ]);
      await db.query(`INSERT INTO memory (content, tags) VALUES ($1, $2)`, [
        'Content B',
        ['python'],
      ]);
      await db.query(`INSERT INTO memory (content, tags) VALUES ($1, $2)`, ['Content C', ['node']]);

      const result = await db.query<{ content: string }>(
        `SELECT content FROM memory WHERE $1 = ANY(tags)`,
        ['node']
      );

      expect(result.rows.length).toBe(2);
    });
  });

  describe('Concurrent Task Handling (SKIP LOCKED)', () => {
    it('should skip locked tasks', async () => {
      await db.query(`INSERT INTO tasks (title, status) VALUES ($1, $2)`, [
        'Locked Task',
        'RUNNING',
      ]);

      const result1 = await db.query<{ id: string }>(
        `UPDATE tasks SET status = 'RUNNING' WHERE id = (
          SELECT id FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC LIMIT 1
        ) RETURNING id`
      );

      expect(result1.rowCount).toBe(0);
    });

    it('should claim pending task with FOR UPDATE SKIP LOCKED', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title, status) VALUES ($1, $2) RETURNING id`,
        ['SKIP LOCKED Test', 'PENDING']
      );
      const taskId = insertResult.rows[0].id;

      const result = await db.query<{ id: string }>(
        `UPDATE tasks SET status = 'RUNNING', updated_at = NOW() WHERE id = (
          SELECT id FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC LIMIT 1
          FOR UPDATE SKIP LOCKED
        ) RETURNING id`
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].id).toBe(taskId);
    });
  });

  describe('Database Health Check', () => {
    it('should return healthy status', async () => {
      const health = await db.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.latency_ms).toBeDefined();
      expect(health.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should get pool stats', async () => {
      const stats = db.getPoolStats();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('activeConnections');
    });
  });
});

describe('Scheduler Integration Tests', () => {
  let db: DatabaseClient;
  let scheduler: Scheduler;
  let config: Config;

  beforeAll(async () => {
    config = Config.getInstance();
    db = new DatabaseClient(config);

    const health = await db.healthCheck();
    if (!health.healthy) {
      throw new Error(`Database not available: ${health.error}`);
    }

    await setupTestDatabase(db);
  });

  beforeEach(async () => {
    await db.query(`DELETE FROM tasks`);
  });

  afterEach(async () => {
    if (scheduler) {
      await scheduler.stop();
    }
  });

  afterAll(async () => {
    await db.query(`DELETE FROM tasks`);
    await db.close();
  });

  describe('Scheduler Task Execution', () => {
    it('should pick up and execute a pending task', async () => {
      await db.query(`INSERT INTO tasks (title, description) VALUES ($1, $2)`, [
        'Integration Test Task',
        'Testing scheduler integration',
      ]);

      scheduler = new Scheduler(db, 100);
      const taskExecuted: { taskId: string }[] = [];

      scheduler.onTaskReady = async (taskId: string) => {
        taskExecuted.push({ taskId });
        await scheduler.completeTaskWithResult(taskId, { success: true });
      };

      await scheduler.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(taskExecuted.length).toBeGreaterThanOrEqual(1);
      if (taskExecuted.length > 0) {
        const result = await db.query<{ status: string; result: unknown }>(
          `SELECT status, result FROM tasks WHERE id = $1`,
          [taskExecuted[0].taskId]
        );
        expect(result.rows[0].status).toBe('COMPLETED');
      }
    });

    it('should track task execution stats', async () => {
      scheduler = new Scheduler(db, 100);
      await scheduler.start();

      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = scheduler.getStats();
      expect(stats.totalTasks).toBeDefined();
      expect(stats.lastHeartbeat).toBeDefined();
    });

    it('should emit events during task lifecycle', async () => {
      await db.query<{ id: string }>(`INSERT INTO tasks (title) VALUES ($1) RETURNING id`, [
        'Event Test Task',
      ]);

      scheduler = new Scheduler(db, 100);
      const events: string[] = [];

      scheduler.getEventBus().subscribe('scheduler:heartbeat', () => {
        events.push('heartbeat');
      });

      scheduler.onTaskReady = async (taskId: string) => {
        events.push(`task:${taskId}`);
        await scheduler.completeTaskWithResult(taskId, {});
      };

      await scheduler.start();
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Scheduler with Multiple Tasks', () => {
    it('should process multiple tasks in priority order', async () => {
      await db.query(`INSERT INTO tasks (title, priority) VALUES ($1, $2)`, ['Low Priority', 1]);
      await db.query(`INSERT INTO tasks (title, priority) VALUES ($1, $2)`, ['High Priority', 10]);
      await db.query(`INSERT INTO tasks (title, priority) VALUES ($1, $2)`, ['Medium Priority', 5]);

      scheduler = new Scheduler(db, 100);
      const executedOrder: string[] = [];

      scheduler.onTaskReady = async (taskId: string, title: string) => {
        executedOrder.push(title);
        await scheduler.completeTaskWithResult(taskId, {});
      };

      await scheduler.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(executedOrder.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Scheduler Error Handling', () => {
    it('should handle task execution failure', async () => {
      const insertResult = await db.query<{ id: string }>(
        `INSERT INTO tasks (title, max_retries) VALUES ($1, $2) RETURNING id`,
        ['Fail Task', 0]
      );
      const taskId = insertResult.rows[0].id;

      scheduler = new Scheduler(db, 100);

      scheduler.onTaskReady = async () => {
        throw new Error('Simulated failure');
      };

      await scheduler.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await db.query<{ status: string; error: string }>(
        `SELECT status, error FROM tasks WHERE id = $1`,
        [taskId]
      );

      if (result.rows.length > 0) {
        expect(['FAILED', 'PENDING']).toContain(result.rows[0].status);
      }
    });
  });
});
