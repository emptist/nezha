export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export interface TaskConfig {
  heartbeatIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
  taskTimeoutMs: number;
}

export interface MemoryConfig {
  bootstrapDir: string;
  maxMemoryAgeMs: number;
}

export interface EmbeddingConfig {
  provider: 'zhipu' | 'openai' | 'ollama';
  model: string;
  apiKey?: string;
  apiUrl?: string;
}

export interface NezhaConfig {
  db: DbConfig;
  task: TaskConfig;
  memory: MemoryConfig;
  embedding?: EmbeddingConfig;
  env: 'development' | 'production' | 'test';
  transport: TransportConfig;
}

export interface TransportConfig {
  mode: 'http' | 'cli';
  opencodeApiUrl: string;
  fallbackMode?: 'http' | 'cli';
  timeout?: number;
  enableFallback?: boolean;
  enableCache?: boolean;
  cacheTtlMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Task {
  id: string;
  status: TaskStatus;
  data: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface TaskFilter {
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Memory {
  id: string;
  projectId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryFilter {
  projectId?: string;
  limit?: number;
  offset?: number;
}

export interface AgentSession {
  id: string;
  projectId: string;
  createdAt: Date;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentResponse {
  success: boolean;
  message?: string;
  sessionId?: string;
  data?: unknown;
}

export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
}

export interface IConfig {
  getDbConfig(): DbConfig;
  getTaskConfig(): TaskConfig;
  getMemoryConfig(): MemoryConfig;
  getEmbeddingConfig(): EmbeddingConfig | undefined;
  getEnv(): string;
  getTransportConfig(): TransportConfig;
  validate(): boolean;
}
