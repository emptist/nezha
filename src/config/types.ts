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

export interface NezhaConfig {
  db: DbConfig;
  task: TaskConfig;
  memory: MemoryConfig;
  env: 'development' | 'production' | 'test';
}

export enum TaskStatus {
  PENDING = 'PENDING',
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
  projectId: string;
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
  getEnv(): string;
  validate(): boolean;
}
