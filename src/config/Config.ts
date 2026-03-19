import {
  type DbConfig,
  type TaskConfig,
  type MemoryConfig,
  type EmbeddingConfig,
  type NezhaConfig,
  type IConfig,
  type TransportConfig,
} from './types.js';
import { DATABASE_CONFIG, TASK_CONFIG, MEMORY_CONFIG, ENV_KEYS, ENV_DEFAULT } from './constants.js';
import { loadYamlConfig, type NezhaYamlConfig } from './YamlConfigLoader.js';

function parseIntEnv(value: string | undefined, defaultValue: number, key: string): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid value for ${key}: "${value}" is not a valid integer`);
  }
  return parsed;
}

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
    const yamlResult = loadYamlConfig();
    const yamlConfig = yamlResult.config;

    if (!yamlResult.valid) {
      console.warn('YAML config validation warnings:', yamlResult.errors);
    }

    const dbConfig = this.loadDbConfig(yamlConfig);
    const taskConfig = this.loadTaskConfig(yamlConfig);
    const memoryConfig = this.loadMemoryConfig();
    const embeddingConfig = this.loadEmbeddingConfig(yamlConfig);
    const transportConfig = this.loadTransportConfig(yamlConfig);
    const env = this.loadEnv();

    return {
      db: dbConfig,
      task: taskConfig,
      memory: memoryConfig,
      embedding: embeddingConfig,
      env,
      transport: transportConfig,
    };
  }

  private loadDbConfig(yaml?: NezhaYamlConfig): DbConfig {
    const host = process.env[ENV_KEYS.DB_HOST] || yaml?.database?.host;
    const port = process.env[ENV_KEYS.DB_PORT];
    const database = process.env[ENV_KEYS.DB_NAME] || yaml?.database?.database;
    const user = process.env[ENV_KEYS.DB_USER] || yaml?.database?.user;
    const password = process.env[ENV_KEYS.DB_PASSWORD] || yaml?.database?.password;
    const max = process.env[ENV_KEYS.DB_MAX];
    return {
      host: host || DATABASE_CONFIG.DEFAULT_HOST,
      port: parseIntEnv(
        port,
        yaml?.database?.port || DATABASE_CONFIG.DEFAULT_PORT,
        ENV_KEYS.DB_PORT
      ),
      database: database || 'nezha',
      user: user || 'postgres',
      password: password || '',
      max: parseIntEnv(max, yaml?.database?.max || DATABASE_CONFIG.DEFAULT_MAX, ENV_KEYS.DB_MAX),
      idleTimeoutMillis: DATABASE_CONFIG.DEFAULT_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: DATABASE_CONFIG.DEFAULT_CONNECTION_TIMEOUT_MS,
    };
  }

  private loadTaskConfig(yaml?: NezhaYamlConfig): TaskConfig {
    return {
      heartbeatIntervalMs: parseIntEnv(
        process.env[ENV_KEYS.HEARTBEAT_INTERVAL],
        yaml?.task?.heartbeatIntervalMs || TASK_CONFIG.DEFAULT_HEARTBEAT_INTERVAL_MS,
        ENV_KEYS.HEARTBEAT_INTERVAL
      ),
      maxRetries: parseIntEnv(
        process.env[ENV_KEYS.RETRY_MAX_ATTEMPTS] || process.env[ENV_KEYS.MAX_RETRIES],
        yaml?.task?.maxRetries || TASK_CONFIG.DEFAULT_MAX_RETRIES,
        ENV_KEYS.RETRY_MAX_ATTEMPTS
      ),
      retryDelayMs: parseIntEnv(
        process.env[ENV_KEYS.RETRY_DELAY_MS] || process.env[ENV_KEYS.RETRY_DELAY],
        yaml?.task?.retryDelayMs || TASK_CONFIG.DEFAULT_RETRY_DELAY_MS,
        ENV_KEYS.RETRY_DELAY_MS
      ),
      taskTimeoutMs: parseIntEnv(
        process.env[ENV_KEYS.TASK_TIMEOUT],
        yaml?.task?.taskTimeoutMs || TASK_CONFIG.DEFAULT_TASK_TIMEOUT_MS,
        ENV_KEYS.TASK_TIMEOUT
      ),
    };
  }

  private loadMemoryConfig(): MemoryConfig {
    return {
      bootstrapDir:
        process.env[ENV_KEYS.MEMORY_BOOTSTRAP_DIR] || MEMORY_CONFIG.DEFAULT_BOOTSTRAP_DIR,
      maxMemoryAgeMs: parseIntEnv(
        process.env[ENV_KEYS.MAX_MEMORY_AGE],
        MEMORY_CONFIG.DEFAULT_MAX_MEMORY_AGE_MS,
        ENV_KEYS.MAX_MEMORY_AGE
      ),
    };
  }

  private loadEmbeddingConfig(yaml?: NezhaYamlConfig): EmbeddingConfig | undefined {
    const provider = process.env[ENV_KEYS.EMBEDDING_PROVIDER] || yaml?.embedding?.provider;
    if (!provider) {
      return undefined;
    }

    if (provider !== 'ollama' && provider !== 'zhipu' && provider !== 'openai') {
      return undefined;
    }

    return {
      provider,
      model:
        process.env[ENV_KEYS.EMBEDDING_MODEL] ||
        yaml?.embedding?.model ||
        (provider === 'ollama' ? 'nomic-embed-text' : 'embedding-2'),
      apiKey: process.env[ENV_KEYS.ZHIPU_API_KEY] || yaml?.embedding?.apiKey,
      apiUrl: process.env[ENV_KEYS.EMBEDDING_API_URL] || yaml?.embedding?.apiUrl,
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

  private loadTransportConfig(yaml?: NezhaYamlConfig): TransportConfig {
    const mode = process.env[ENV_KEYS.TRANSPORT_MODE] || yaml?.transport?.mode || 'http';
    const validMode = mode === 'cli' ? 'cli' : 'http';

    return {
      mode: validMode,
      opencodeApiUrl:
        process.env[ENV_KEYS.OPENCODE_API_URL] ||
        yaml?.transport?.opencodeApiUrl ||
        'http://localhost:4096',
    };
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

  getEmbeddingConfig(): EmbeddingConfig | undefined {
    return this.config.embedding ? { ...this.config.embedding } : undefined;
  }

  getEnv(): string {
    return this.config.env;
  }

  getTransportConfig(): TransportConfig {
    return { ...this.config.transport };
  }

  validate(): boolean {
    if (!this.config.db.host || this.config.db.host.trim() === '') {
      return false;
    }
    if (!this.config.db.port || this.config.db.port <= 0 || this.config.db.port > 65535) {
      return false;
    }
    if (!this.config.db.database || this.config.db.database.trim() === '') {
      return false;
    }
    if (!this.config.db.user || this.config.db.user.trim() === '') {
      return false;
    }
    // Password can be empty for Keychain/trust authentication
    // Removed: if (!this.config.db.password || this.config.db.password.trim() === '')
    if (!this.config.task.heartbeatIntervalMs || this.config.task.heartbeatIntervalMs <= 0) {
      return false;
    }
    if (this.config.task.maxRetries < 0) {
      return false;
    }
    return true;
  }
}
