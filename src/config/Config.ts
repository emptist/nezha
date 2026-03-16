import {
  type DbConfig,
  type TaskConfig,
  type MemoryConfig,
  type NezhaConfig,
  type IConfig,
} from './types.js';
import {
  DATABASE_CONFIG,
  TASK_CONFIG,
  MEMORY_CONFIG,
  ENV_KEYS,
  ENV_DEFAULT,
} from './constants.js';

export class Config implements IConfig {
  private static instance: Config | null = null;
  private readonly config: NezhaConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  static resetInstance(): void {
    Config.instance = null;
  }

  private loadConfig(): NezhaConfig {
    const dbConfig = this.loadDbConfig();
    const taskConfig = this.loadTaskConfig();
    const memoryConfig = this.loadMemoryConfig();
    const env = this.loadEnv();

    return {
      db: dbConfig,
      task: taskConfig,
      memory: memoryConfig,
      env,
    };
  }

  private loadDbConfig(): DbConfig {
    const host = process.env[ENV_KEYS.DB_HOST];
    const port = process.env[ENV_KEYS.DB_PORT];
    const database = process.env[ENV_KEYS.DB_NAME];
    const user = process.env[ENV_KEYS.DB_USER];
    const password = process.env[ENV_KEYS.DB_PASSWORD];
    const max = process.env[ENV_KEYS.DB_MAX];
    return {
      host: host && host.trim() !== '' ? host : DATABASE_CONFIG.DEFAULT_HOST,
      port: port && port.trim() !== '' ? parseInt(port, 10) : DATABASE_CONFIG.DEFAULT_PORT,
      database: database && database.trim() !== '' ? database : 'nezha',
      user: user && user.trim() !== '' ? user : 'postgres',
      password: password ?? '',
      max: max && max.trim() !== '' ? parseInt(max, 10) : DATABASE_CONFIG.DEFAULT_MAX,
      idleTimeoutMillis: DATABASE_CONFIG.DEFAULT_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: DATABASE_CONFIG.DEFAULT_CONNECTION_TIMEOUT_MS,
    };
  }

  private loadTaskConfig(): TaskConfig {
    return {
      heartbeatIntervalMs: parseInt(
        process.env[ENV_KEYS.HEARTBEAT_INTERVAL] || String(TASK_CONFIG.DEFAULT_HEARTBEAT_INTERVAL_MS),
        10
      ),
      maxRetries: parseInt(
        process.env[ENV_KEYS.MAX_RETRIES] || String(TASK_CONFIG.DEFAULT_MAX_RETRIES),
        10
      ),
      retryDelayMs: parseInt(
        process.env[ENV_KEYS.RETRY_DELAY] || String(TASK_CONFIG.DEFAULT_RETRY_DELAY_MS),
        10
      ),
      taskTimeoutMs: parseInt(
        process.env[ENV_KEYS.TASK_TIMEOUT] || String(TASK_CONFIG.DEFAULT_TASK_TIMEOUT_MS),
        10
      ),
    };
  }

  private loadMemoryConfig(): MemoryConfig {
    return {
      bootstrapDir: process.env[ENV_KEYS.MEMORY_BOOTSTRAP_DIR] || MEMORY_CONFIG.DEFAULT_BOOTSTRAP_DIR,
      maxMemoryAgeMs: parseInt(
        process.env[ENV_KEYS.MAX_MEMORY_AGE] || String(MEMORY_CONFIG.DEFAULT_MAX_MEMORY_AGE_MS),
        10
      ),
    };
  }

  private loadEnv(): 'development' | 'production' | 'test' {
    const env = process.env[ENV_KEYS.ENV] || ENV_DEFAULT.DEVELOPMENT;
    if (
      env === ENV_DEFAULT.DEVELOPMENT ||
      env === ENV_DEFAULT.PRODUCTION ||
      env === ENV_DEFAULT.TEST
    ) {
      return env;
    }
    return ENV_DEFAULT.DEVELOPMENT;
  }

  getDbConfig(): DbConfig {
    return { ...this.config.db };
  }

  getTaskConfig(): TaskConfig {
    return { ...this.config.task };
  }

  getMemoryConfig(): MemoryConfig {
    return { ...this.config.memory };
  }

  getEnv(): string {
    return this.config.env;
  }

  validate(): boolean {
    if (!this.config.db.host) {
      return false;
    }
    if (this.config.db.port <= 0 || this.config.db.port > 65535) {
      return false;
    }
    if (!this.config.db.database) {
      return false;
    }
    if (this.config.task.heartbeatIntervalMs <= 0) {
      return false;
    }
    if (this.config.task.maxRetries < 0) {
      return false;
    }
    return true;
  }
}
