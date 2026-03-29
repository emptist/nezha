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

export interface HealthConfig {
  port: number;
  requireAuth: boolean;
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
  health: HealthConfig;
  embedding?: EmbeddingConfig;
  env: 'development' | 'production' | 'test';
  transport: TransportConfig;
  agentId: string;
  agentDisplayName?: string;
}

export interface TransportConfig {
  /** @deprecated CLI mode removed - only HTTP is supported */
  mode?: 'http' | 'cli';
  opencodeApiUrl?: string;
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
  FAKE_COMPLETE = 'FAKE_COMPLETE',
}

export type AICapability = 'pi' | 'internal' | 'opencode' | 'human';

export interface Task {
  id: string;
  projectId?: string;
  status: TaskStatus;
  data: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  delegateTo?: AICapability;
  complexity?: number;
  delegatedFrom?: AICapability;
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

export interface TaskOutcome {
  id: string;
  taskId: string;
  projectId?: string;
  taskType?: string;
  taskDescription?: string;
  status: string;
  errorMessage?: string;
  errorCategory?: string;
  solutionApplied?: string;
  solutionWorked?: boolean;
  executionTimeMs?: number;
  attempts: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskPattern {
  id: string;
  projectId?: string;
  patternType: 'success' | 'failure' | 'workaround';
  patternCategory: string;
  patternContent: string;
  patternContext?: string;
  successRate: number;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastConfirmedAt?: Date;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  isActive: boolean;
}

export interface KnowledgeLink {
  id: string;
  fromType: 'memory' | 'pattern' | 'outcome';
  fromId: string;
  toType: 'memory' | 'pattern' | 'outcome';
  toId: string;
  relation: 'relates-to' | 'causes' | 'solves' | 'contradicts' | 'improves' | 'confirms';
  confidence: number;
  context?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface LearningInsight {
  id: string;
  projectId?: string;
  insightType: 'improvement' | 'warning' | 'pattern' | 'recommendation';
  title: string;
  content: string;
  evidence: unknown[];
  priority: number;
  confidence: number;
  isApplied: boolean;
  appliedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface SimilarSolution {
  outcomeId: string;
  taskDescription: string;
  solutionApplied: string;
  solutionWorked: boolean;
  similarityScore: number;
  executionTimeMs?: number;
  attempts: number;
}

export interface FailureImprovement {
  errorCategory: string;
  failureCount: number;
  avgExecutionTimeMs?: number;
  suggestedImprovement: string;
  confidenceScore: number;
  relatedPatternId?: string;
  relatedMemoryId?: string;
}

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  TIMEOUT = 'TIMEOUT',
  SERVER = 'SERVER',
  TRANSPORT = 'TRANSPORT',
  LOGIC = 'LOGIC',
  RESOURCE = 'RESOURCE',
  UNKNOWN = 'UNKNOWN',
}

export interface DeadLetterItem {
  id: string;
  originalTaskId: string;
  title: string;
  description?: string;
  errorMessage: string;
  errorCategory?: ErrorCategory;
  failurePattern?: string;
  retryCount: number;
  maxRetries: number;
  failedAt: Date;
  lastRetryAt?: Date;
  resolved: boolean;
  resolutionNotes?: string;
  alertSent: boolean;
  reviewStatus: 'pending' | 'reviewed' | 'resolved' | 'ignored';
  reviewedBy?: string;
  reviewedAt?: Date;
  watchdogKills: number;
}

export interface IConfig {
  getDbConfig(): DbConfig;
  getTaskConfig(): TaskConfig;
  getMemoryConfig(): MemoryConfig;
  getEmbeddingConfig(): EmbeddingConfig | undefined;
  getEnv(): string;
  getTransportConfig(): TransportConfig;
  getAgentIdAsync(): Promise<string>;
  getAgentDisplayName(): string | undefined;
  validate(): boolean;
}
