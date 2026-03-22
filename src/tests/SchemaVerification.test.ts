import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { DatabaseClient } from '../db/DatabaseClient.js';
import { Config } from '../config/Config.js';
import crypto from 'crypto';

describe('Schema Verification Tests', () => {
  let db: DatabaseClient;
  let config: Config;
  const testRecords: { table: string; condition: string }[] = [];

  beforeAll(async () => {
    config = Config.getInstance();
    db = new DatabaseClient(config);

    const health = await db.healthCheck();
    if (!health.healthy) {
      throw new Error(`Database not available: ${health.error}`);
    }
  });

  afterEach(async () => {
    for (const record of testRecords) {
      await db.query(`DELETE FROM ${record.table} WHERE ${record.condition}`);
    }
    testRecords.length = 0;
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Migration 051: Fix Agent Identity', () => {
    it('should have agent_identity table', async () => {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'agent_identity'
        ) as exists
      `);
      expect(result.rows[0]?.exists).toBe(true);
    });

    it('should have agent_name column', async () => {
      const result = await db.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'agent_identity' AND column_name = 'agent_name'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('should have capabilities column as TEXT[]', async () => {
      const result = await db.query(`
        SELECT data_type, udt_name FROM information_schema.columns 
        WHERE table_name = 'agent_identity' AND column_name = 'capabilities'
      `);
      expect(result.rows[0]?.udt_name).toBe('_text');
    });

    it('should have last_seen_at column', async () => {
      const result = await db.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'agent_identity' AND column_name = 'last_seen_at'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('should have metadata column as JSONB', async () => {
      const result = await db.query(`
        SELECT data_type, udt_name FROM information_schema.columns 
        WHERE table_name = 'agent_identity' AND column_name = 'metadata'
      `);
      expect(result.rows[0]?.udt_name).toBe('jsonb');
    });

    it('should have description column', async () => {
      const result = await db.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'agent_identity' AND column_name = 'description'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('should have register_agent function', async () => {
      const result = await db.query(`
        SELECT routine_name FROM information_schema.routines 
        WHERE routine_name = 'register_agent' AND routine_schema = 'public'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('should allow NULL project_id in agent_identity', async () => {
      const result = await db.query(`
        SELECT is_nullable FROM information_schema.columns 
        WHERE table_name = 'agent_identity' AND column_name = 'project_id'
      `);
      expect(result.rows[0]?.is_nullable).toBe('YES');
    });
  });

  describe('Migration 052: Executor Tracking', () => {
    it('should have executor_type column in tasks table', async () => {
      const result = await db.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'executor_type'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.data_type).toBe('character varying');
    });

    it('should have executor_model column in tasks table', async () => {
      const result = await db.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'executor_model'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.data_type).toBe('character varying');
    });

    it('should have executor_provider column in tasks table', async () => {
      const result = await db.query(`
        SELECT column_name, data_type FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'executor_provider'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]?.data_type).toBe('character varying');
    });

    it('should have index on executor_type', async () => {
      const result = await db.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'tasks' AND indexname = 'idx_tasks_executor_type'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('should have index on executor_model', async () => {
      const result = await db.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'tasks' AND indexname = 'idx_tasks_executor_model'
      `);
      expect(result.rows.length).toBe(1);
    });

    it('should be able to insert task with executor fields', async () => {
      const testId = crypto.randomUUID();
      const result = await db.query(
        `
        INSERT INTO tasks (id, title, executor_type, executor_model, executor_provider)
        VALUES ($1, 'Executor Test', 'opencode', 'big-pickle', 'opencode')
        RETURNING id, executor_type, executor_model, executor_provider
      `,
        [testId]
      );
      testRecords.push({ table: 'tasks', condition: `id = '${testId}'` });
      expect(result.rows[0]?.executor_type).toBe('opencode');
      expect(result.rows[0]?.executor_model).toBe('big-pickle');
      expect(result.rows[0]?.executor_provider).toBe('opencode');
    });
  });

  describe('Schema Integrity Tests', () => {
    it('should not have duplicate columns in same table', async () => {
      const result = await db.query(`
        SELECT table_name, column_name, COUNT(*) as count
        FROM information_schema.columns
        WHERE table_schema = 'public'
        GROUP BY table_name, column_name
        HAVING COUNT(*) > 1
      `);
      expect(result.rows.length).toBe(0);
    });

    it('should have primary keys on all core tables', async () => {
      const tables = ['tasks', 'projects', 'memory', 'agent_identity', 'inter_reviews'];
      for (const table of tables) {
        const result = await db.query(
          `
          SELECT COUNT(*) as pk_count
          FROM information_schema.table_constraints
          WHERE table_name = $1
          AND constraint_type = 'PRIMARY KEY'
        `,
          [table]
        );
        expect(Number(result.rows[0]?.pk_count)).toBeGreaterThanOrEqual(1);
      }
    });

    it('should have all expected indexes on tasks table', async () => {
      const result = await db.query(`
        SELECT indexname FROM pg_indexes WHERE tablename = 'tasks'
      `);
      const indexes = result.rows.map((r: any) => r.indexname);
      expect(indexes).toContain('idx_tasks_status');
      expect(indexes).toContain('idx_tasks_priority');
      expect(indexes).toContain('idx_tasks_executor_type');
      expect(indexes).toContain('idx_tasks_executor_model');
    });
  });

  describe('Function Tests', () => {
    it('should register_agent function work correctly', async () => {
      const agentId = crypto.randomUUID();
      const result = await db.query<{ id: string }>(
        `
        SELECT register_agent($1, 'Test Agent', 'Test Description', ARRAY['task_execution'], 'worker', 'background text', '{"skill": "test"}'::jsonb) as id
      `,
        [agentId]
      );
      testRecords.push({ table: 'agent_identity', condition: `id = '${agentId}'` });
      expect(result.rows[0]?.id).toBeDefined();
    });

    it('should handle duplicate agent registration', async () => {
      const agentId = crypto.randomUUID();
      await db.query(
        `
        SELECT register_agent($1, 'First Agent', NULL, NULL, NULL, NULL, NULL)
      `,
        [agentId]
      );
      testRecords.push({ table: 'agent_identity', condition: `id = '${agentId}'` });

      const result = await db.query(
        `
        SELECT register_agent($1, 'Updated Agent', NULL, NULL, NULL, NULL, NULL)
      `,
        [agentId]
      );
      expect(Object.keys(result.rows[0] || {}).length).toBeGreaterThan(0);
    });
  });
});
