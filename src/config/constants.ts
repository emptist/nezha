import { TaskStatus } from './types.js';

export const TASK_STATUS = {
  PENDING: 'PENDING' as const,
  COMPLETED: 'COMPLETED' as const,
  FAILED: 'FAILED' as const,
} satisfies Record<TaskStatus, string>;

export const DATABASE_TABLES = {
  TASKS: 'tasks',
  MEMORY: 'memory',
  AGENTS: 'agents',
  SKILLS: 'skills',
} as const;

export const DATABASE_CONFIG = {
  DEFAULT_HOST: 'localhost',
  DEFAULT_PORT: 5432,
  DEFAULT_MAX: 20,
  DEFAULT_IDLE_TIMEOUT_MS: 30000,
  DEFAULT_CONNECTION_TIMEOUT_MS: 2000,
} as const;

export const TASK_CONFIG = {
  DEFAULT_HEARTBEAT_INTERVAL_MS: 30000,
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_RETRY_DELAY_MS: 5000,
  DEFAULT_TASK_TIMEOUT_MS: 300000,
} as const;

export const MEMORY_CONFIG = {
  DEFAULT_BOOTSTRAP_DIR: './bootstrap',
  DEFAULT_MAX_MEMORY_AGE_MS: 86400000 * 30,
} as const;

export const ENV_KEYS = {
  DB_HOST: 'NEZHA_DB_HOST',
  DB_PORT: 'NEZHA_DB_PORT',
  DB_NAME: 'NEZHA_DB_NAME',
  DB_USER: 'NEZHA_DB_USER',
  DB_PASSWORD: 'NEZHA_DB_PASSWORD',
  DB_MAX: 'NEZHA_DB_MAX',
  HEARTBEAT_INTERVAL: 'NEZHA_HEARTBEAT_INTERVAL',
  MAX_RETRIES: 'NEZHA_MAX_RETRIES',
  RETRY_DELAY: 'NEZHA_RETRY_DELAY',
  TASK_TIMEOUT: 'NEZHA_TASK_TIMEOUT',
  MEMORY_BOOTSTRAP_DIR: 'NEZHA_MEMORY_BOOTSTRAP_DIR',
  MAX_MEMORY_AGE: 'NEZHA_MAX_MEMORY_AGE',
  ENV: 'NEZHA_ENV',
} as const;

export const ENV_DEFAULT = {
  DEVELOPMENT: 'development' as const,
  PRODUCTION: 'production' as const,
  TEST: 'test' as const,
} as const;

export const OPENCODE_API = {
  DEFAULT_HOST: '127.0.0.1',
  DEFAULT_PORT: 4098,
  ENDPOINTS: {
    MESSAGE: '/api/message',
    SESSION: '/api/session',
  },
} as const;
