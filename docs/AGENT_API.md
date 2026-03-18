# Unified Agent API Reference

The Nezha Unified Agent provides a unified interface for AI task execution with support for multiple transport modes, automatic failover, caching, and resilience patterns.

## Table of Contents

- [UnifiedAgent](#unifiedagent)
- [Agent](#agent)
- [CliAgent](#cliagent)
- [HttpTransport](#httptransport)
- [CliTransport](#clitransport)
- [Type Definitions](#type-definitions)

---

## UnifiedAgent

Main agent class that provides unified interface for AI task execution with dual-mode transport support.

```typescript
import { UnifiedAgent } from './core/UnifiedAgent';
```

### Constructor

```typescript
new UnifiedAgent(config?: UnifiedAgentConfig)
```

Creates a new UnifiedAgent instance with the specified configuration.

**Parameters:**

| Parameter                        | Type            | Default                   | Description                         |
| -------------------------------- | --------------- | ------------------------- | ----------------------------------- |
| `config.mode`                    | `TransportMode` | `'http'`                  | Transport mode: `'http'` or `'cli'` |
| `config.timeout`                 | `number`        | `600000`                  | Request timeout in milliseconds     |
| `config.maxRetries`              | `number`        | `3`                       | Maximum retry attempts              |
| `config.retryDelay`              | `number`        | `1000`                    | Initial retry delay in milliseconds |
| `config.serverUrl`               | `string`        | `'http://localhost:4096'` | Server URL                          |
| `config.logDir`                  | `string`        | `'conversations'`         | Directory for conversation logs     |
| `config.enableLogging`           | `boolean`       | `true`                    | Enable conversation logging         |
| `config.enableFallback`          | `boolean`       | `true`                    | Enable automatic fallback           |
| `config.fallbackMode`            | `TransportMode` | -                         | Fallback transport mode             |
| `config.enableCache`             | `boolean`       | `true`                    | Enable response caching             |
| `config.cacheTtlMs`              | `number`        | `300000`                  | Cache TTL in milliseconds           |
| `config.circuitBreakerThreshold` | `number`        | `3`                       | Circuit breaker failure threshold   |
| `config.circuitBreakerResetMs`   | `number`        | `300000`                  | Circuit breaker reset timeout       |
| `config.enableObservability`     | `boolean`       | `true`                    | Enable metrics and health checks    |

### Methods

#### executeTask(message: string): Promise\<UnifiedAgentResponse\>

Executes a task by sending a message to the AI agent. Implements retry logic, circuit breaker, and caching.

```typescript
const result = await agent.executeTask('Fix the login bug');
console.log(result.message);
```

**Parameters:**

- `message` - The task description (max 100000 chars)

**Returns:** `Promise<UnifiedAgentResponse>`

---

#### executeStructuredTask(task: AgentTask, systemPrompt?: string): Promise\<UnifiedAgentResponse\>

Executes a structured task with title, description, and optional context.

```typescript
const result = await agent.executeStructuredTask({
  title: 'Implement user authentication',
  description: 'Add OAuth2 login support',
  context: 'We use Express.js with TypeScript',
});
```

**Parameters:**

- `task` - The structured task object
  - `task.title` - Task title (max 500 chars)
  - `task.description` - Task description (max 5000 chars)
  - `task.context` - Optional additional context
- `systemPrompt` - Optional system prompt to prepend

**Returns:** `Promise<UnifiedAgentResponse>`

---

#### executeTaskStreaming(message: string, onChunk: StreamingCallback): Promise\<UnifiedAgentResponse\>

Executes a task with streaming response callback. Only available in CLI transport mode.

```typescript
await agent.executeTaskStreaming('Analyze the codebase', (chunk, type) => {
  console.log(`[${type}] ${chunk}`);
});
```

**Parameters:**

- `message` - The task description
- `onChunk` - Callback function invoked for each streaming chunk

**Returns:** `Promise<UnifiedAgentResponse>`

**Throws:** `Error` if not using CLI transport mode

---

#### getHealth(): Promise\<AgentHealth\>

Returns the health status of the agent and its transports.

```typescript
const health = await agent.getHealth();
console.log(`Agent healthy: ${health.healthy}`);
```

**Returns:** `Promise<AgentHealth>`

---

#### getMetrics(): Metrics

Returns execution metrics for the agent.

```typescript
const metrics = agent.getMetrics();
console.log(`Total executions: ${metrics.totalExecutions}`);
```

**Returns:** Object containing:

- `totalExecutions` - Total number of task executions
- `avgDurationMs` - Average execution duration in milliseconds
- `activeConnections` - Number of active connections
- `tokenUsageTotal` - Total tokens used

---

#### exportMetrics(): string

Exports all metrics in Prometheus format.

```typescript
const prometheusMetrics = agent.exportMetrics();
```

**Returns:** Metrics in Prometheus text format

---

#### getCorrelationId(): string

Returns the correlation ID for request tracing.

```typescript
const correlationId = agent.getCorrelationId();
```

**Returns:** The correlation ID string

---

#### calculateRetryDelay(attempt: number): number

Calculates retry delay with exponential backoff and jitter.

```typescript
const delay = agent.calculateRetryDelay(2); // 2nd retry
```

**Returns:** Delay in milliseconds

---

#### clearSession(): void

Clears the current session for both primary and fallback transports.

```typescript
agent.clearSession();
```

---

#### getSessionId(): string | null

Returns the current session ID from the active transport.

```typescript
const sessionId = agent.getSessionId();
```

**Returns:** The session ID or null

---

#### getResilienceStats(): ResilienceStats

Returns resilience statistics including circuit breaker state, cache hit rate, and retry count.

```typescript
const stats = agent.getResilienceStats();
console.log(`Cache hit rate: ${stats.cacheHitRate}`);
```

**Returns:** `ResilienceStats` object containing:

- `circuitBreaker` - Current circuit breaker state
- `cacheHitRate` - Cache hit rate (0-1)
- `retryCount` - Number of retries attempted
- `lastError` - Last error if any

---

#### resetCircuits(): void

Resets all resilience mechanisms.

```typescript
agent.resetCircuits();
```

---

## Agent

HTTP-only agent for backward compatibility. Use `UnifiedAgent` for new code.

```typescript
import { Agent } from './core/UnifiedAgent';
```

### Constructor

```typescript
new Agent(config?: Omit<UnifiedAgentConfig, 'mode'>)
```

Creates a new Agent instance using HTTP transport.

### Methods

#### executeTask(message: string): Promise\<{ success: boolean; message?: string; sessionId?: string }\>

Executes a task via HTTP transport. Simplified response compared to UnifiedAgent.

```typescript
const agent = new Agent({ serverUrl: 'http://localhost:4096' });
const result = await agent.executeTask('Create a new API endpoint');
```

---

## CliAgent

CLI transport agent for local execution. Spawns opencode CLI process for task execution.

```typescript
import { CliAgent } from './core/UnifiedAgent';
```

### Constructor

```typescript
new CliAgent(config?: Omit<UnifiedAgentConfig, 'mode'>)
```

Creates a new CliAgent instance using CLI transport. Automatically enables logging.

### Methods

`CliAgent` inherits all methods from `UnifiedAgent`. Additional capability:

#### executeTaskStreaming(message: string, onChunk: StreamingCallback): Promise\<UnifiedAgentResponse\>

Supports streaming in CLI mode.

```typescript
const agent = new CliAgent();
await agent.executeTaskStreaming('Analyze codebase', (chunk, type) => {
  process.stdout.write(chunk);
});
```

---

## HttpTransport

HTTP-based transport for communicating with OpenCode server via REST API.

```typescript
import { HttpTransport } from './core/transports';
```

### Constructor

```typescript
new HttpTransport(serverUrl: string, timeout: number)
```

### Methods

#### getSessionId(): string | null

Returns the current session ID.

#### setSessionId(id: string | null): void

Sets the session ID.

#### clearSession(): void

Clears/resets the current session.

#### createSession(): Promise\<string\>

Creates a new session with the server. Thread-safe.

**Returns:** The session ID

#### sendMessage(message: string): Promise\<string\>

Sends a message via HTTP. Automatically creates/uses a session.

**Parameters:**

- `message` - The message to send

**Returns:** The response content

---

## CliTransport

CLI-based transport that spawns opencode process for local execution.

```typescript
import { CliTransport } from './core/transports';
```

### Constructor

```typescript
new CliTransport(serverUrl: string, timeout: number)
```

### Methods

#### getSessionId(): null

CLI mode always returns null (no session concept).

#### setSessionId(\_id: string | null): void

No-op for CLI mode.

#### clearSession(): void

No-op for CLI mode.

#### sendMessage(message: string): Promise\<string\>

Sends a message by spawning opencode CLI process.

**Parameters:**

- `message` - The message to send

**Returns:** The response content

#### sendMessageStreaming(message: string, onChunk: StreamingCallback): Promise\<string\>

Sends a message with streaming response callback.

```typescript
const transport = new CliTransport('http://localhost:4096', 600000);
await transport.sendMessageStreaming('Analyze code', (chunk, type) => {
  console.log(`[${type}] ${chunk}`);
});
```

**Parameters:**

- `message` - The message to send
- `onChunk` - Callback for each streaming chunk

**Returns:** The complete response content

---

## Type Definitions

### UnifiedAgentConfig

```typescript
interface UnifiedAgentConfig {
  mode?: TransportMode;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  serverUrl?: string;
  logDir?: string;
  enableLogging?: boolean;
  correlationId?: string;
  fallbackMode?: TransportMode;
  enableFallback?: boolean;
  enableCache?: boolean;
  enableObservability?: boolean;
  cacheTtlMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  retryPolicy?: Partial<RetryPolicy>;
}
```

### UnifiedAgentResponse

```typescript
interface UnifiedAgentResponse {
  success: boolean;
  message?: string;
  output?: string;
  artifacts?: string[];
  sessionId?: string;
  correlationId?: string;
  durationMs?: number;
  errorCategory?: string;
  fallbackUsed?: boolean;
  fromCache?: boolean;
}
```

### AgentTask

```typescript
interface AgentTask {
  id?: string;
  title: string;
  description: string;
  context?: string;
}
```

### ResilienceStats

```typescript
interface ResilienceStats {
  circuitBreaker: CircuitState;
  cacheHitRate: number;
  retryCount: number;
  lastError?: CategorizedError;
}
```

### TransportMode

```typescript
type TransportMode = 'http' | 'cli';
```

### StreamingCallback

```typescript
type StreamingCallback = (chunk: string, type: 'text' | 'thinking' | 'error') => void;
```

### TransportConfig

```typescript
interface TransportConfig {
  mode: TransportMode;
  serverUrl: string;
  timeout: number;
}
```

---

## Usage Examples

### Basic HTTP Agent

```typescript
import { Agent } from './core/UnifiedAgent';

const agent = new Agent({
  serverUrl: 'http://localhost:4096',
  timeout: 600000,
});

const result = await agent.executeTask('Fix the login bug');
if (result.success) {
  console.log(result.message);
}
```

### Unified Agent with Fallback

```typescript
import { UnifiedAgent } from './core/UnifiedAgent';

const agent = new UnifiedAgent({
  mode: 'http',
  serverUrl: 'http://localhost:4096',
  enableFallback: true,
  fallbackMode: 'cli',
  circuitBreakerThreshold: 3,
});

const result = await agent.executeTask('Create a new component');
console.log(`Fallback used: ${result.fallbackUsed}`);
```

### CLI Agent with Streaming

```typescript
import { CliAgent } from './core/UnifiedAgent';

const agent = new CliAgent();

await agent.executeTaskStreaming('Analyze the codebase', (chunk, type) => {
  if (type === 'text') {
    process.stdout.write(chunk);
  } else if (type === 'thinking') {
    process.stdout.write(`\n[Thinking] ${chunk}\n`);
  }
});
```

### Structured Task Execution

```typescript
import { UnifiedAgent } from './core/UnifiedAgent';

const agent = new UnifiedAgent();

const result = await agent.executeStructuredTask(
  {
    title: 'Implement user authentication',
    description: 'Add OAuth2 login with Google and GitHub providers',
    context: 'Using Express.js with TypeScript, existing user table exists',
  },
  'Follow security best practices and use environment variables for secrets.'
);

console.log(`Artifacts: ${result.artifacts}`);
```

### Monitoring and Metrics

```typescript
import { UnifiedAgent } from './core/UnifiedAgent';

const agent = new UnifiedAgent({ enableObservability: true });

// Check health
const health = await agent.getHealth();
console.log(`Server connectivity: ${health.serverConnectivity}`);

// Get metrics
const metrics = agent.getMetrics();
console.log(`Total executions: ${metrics.totalExecutions}`);
console.log(`Avg duration: ${metrics.avgDurationMs}ms`);

// Export Prometheus metrics
const prometheusMetrics = agent.exportMetrics();
```

### Transport Direct Usage

```typescript
import { HttpTransport, CliTransport, createTransport } from './core/transports';

// Direct HTTP transport
const httpTransport = new HttpTransport('http://localhost:4096', 600000);
const response = await httpTransport.sendMessage('Hello');

// Factory creation
const transport = createTransport({
  mode: 'cli',
  serverUrl: 'http://localhost:4096',
  timeout: 600000,
});

// CLI with streaming
if (transport instanceof CliTransport) {
  await transport.sendMessageStreaming('Analyze', (chunk, type) => {
    console.log(chunk);
  });
}
```
