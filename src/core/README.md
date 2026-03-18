# Core Module Architecture

This directory contains the core components of the Nezha autonomous development system.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEZHA CORE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │ UnifiedAgent    │    │   Scheduler     │    │    AgentSystem          │  │
│  │                 │    │                 │    │                         │  │
│  │ - executeTask() │    │ - scheduleTask()│    │ - registerAgent()       │  │
│  │ - transport layer│    │ - getNextTask() │    │ - getAvailableAgent()   │  │
│  │ - retry logic   │    │ - markComplete() │    │ - pool management       │  │
│  └────────┬────────┘    └────────┬────────┘    └────────────┬────────────┘  │
│           │                      │                          │               │
│           ▼                      │                          │               │
│  ┌─────────────────┐             │                          │               │
│  │   Transports    │             │                          │               │
│  │                 │             │                          │               │
│  │ - HttpTransport │             │                          │               │
│  │ - CliTransport  │             │                          │               │
│  └─────────────────┘             │                          │               │
│                                 │                          │               │
│  ┌─────────────────┐    ┌────────┴────────┐    ┌────────────┴────────────┐  │
│  │  Conversation   │    │    Memory       │    │      PluginManager        │  │
│  │    Logger       │    │    Service      │    │                          │  │
│  │                 │    │                 │    │ - registerPlugin()       │  │
│  │ - startConv()   │    │ - save()        │    │ - executePlugin()         │  │
│  │ - addMessage()  │    │ - search()      │    │ - listPlugins()           │  │
│  │ - endConv()     │    │ - link()        │    │                          │  │
│  └─────────────────┘    └─────────────────┘    └──────────────────────────┘  │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │    EventBus    │    │   SkillSystem   │    │  ContinuousImprovement  │  │
│  │                 │    │                 │    │                         │  │
│  │ - emit()        │    │ - register()    │    │ - identify()            │  │
│  │ - on()          │    │ - execute()     │    │ - improve()             │  │
│  │ - off()         │    │ - list()        │    │ - review()              │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Class Responsibilities

### UnifiedAgent (`UnifiedAgent.ts`)

**Purpose**: Transport-agnostic task execution with retry logic and logging.

**Public API**:

- `executeTask(message: string): Promise<UnifiedAgentResponse>` - Execute a simple task
- `executeStructuredTask(task: AgentTask, systemPrompt?: string): Promise<UnifiedAgentResponse>` - Execute with structured metadata
- `executeTaskStreaming(message: string, onChunk: StreamingCallback): Promise<UnifiedAgentResponse>` - Streaming execution (CLI only)
- `clearSession(): void` - Clear transport session
- `getSessionId(): string | null` - Get current session ID

**Derived Classes**:

- `Agent` - HTTP transport convenience wrapper
- `CliAgent` - CLI transport convenience wrapper

### Transport Layer (`transports/index.ts`)

**Purpose**: Abstract communication with OpenCode backend.

**Classes**:

| Class           | Protocol  | Sessions | Streaming | Use Case            |
| --------------- | --------- | -------- | --------- | ------------------- |
| `HttpTransport` | REST/HTTP | Yes      | No        | Server-to-server    |
| `CliTransport`  | CLI spawn | No       | Yes       | Local CLI execution |

**Factory Function**: `createTransport(config: TransportConfig)` - Creates appropriate transport

### Scheduler (`Scheduler.ts`)

**Purpose**: Task queue management and execution scheduling.

**Public API**:

- `scheduleTask(task: Task): Promise<string>` - Add task to queue
- `getNextTask(): Promise<Task | null>` - Get next pending task
- `markComplete(taskId: string): Promise<void>` - Mark task as done
- `getStats(): SchedulerStats` - Get queue statistics

### AgentSystem (`AgentSystem.ts`)

**Purpose**: Manages a pool of agents for parallel task execution.

**Public API**:

- `registerAgent(agent: UnifiedAgent): void` - Add agent to pool
- `getAvailableAgent(): UnifiedAgent | null` - Get idle agent
- `releaseAgent(agent: UnifiedAgent): void` - Return agent to pool

### MemoryService (`MemoryService.ts`)

**Purpose**: Persistent storage and semantic search of knowledge.

**Public API**:

- `save(key: string, data: unknown): Promise<void>` - Store memory
- `search(query: string): Promise<MemoryResult[]>` - Semantic search
- `link(source: string, target: string, type: LinkType): Promise<void>` - Create memory links

### ConversationLogger (`ConversationLogger.ts`)

**Purpose**: Log conversations for learning and audit.

**Public API**:

- `startConversation(task: Task, type: string): string` - Start new conversation
- `addMessage(role: 'user' | 'assistant', content: string): void` - Log message
- `endConversation(result: ConversationResult): void` - End conversation

### PluginManager (`PluginManager.ts`)

**Purpose**: Extend system functionality via plugins.

**Public API**:

- `registerPlugin(plugin: Plugin): void` - Register new plugin
- `executePlugin(name: string, context: PluginContext): Promise<unknown>` - Execute plugin
- `listPlugins(): Plugin[]` - List registered plugins

### EventBus (`EventBus.ts`)

**Purpose**: Pub/sub system for loose coupling between components.

**Public API**:

- `emit(event: string, data: unknown): void` - Publish event
- `on(event: string, handler: EventHandler): void` - Subscribe
- `off(event: string, handler: EventHandler): void` - Unsubscribe

### SkillSystem (`SkillSystem.ts`)

**Purpose**: Register and execute reusable skill modules.

**Public API**:

- `register(skill: Skill): void` - Register skill
- `execute(name: string, context: SkillContext): Promise<unknown>` - Execute skill
- `list(): Skill[]` - List available skills

## Transport Interface Contract

All transports must implement `SessionManager`:

```typescript
interface SessionManager {
  getSessionId(): string | null;
  setSessionId(id: string | null): void;
  clearSession(): void;
}
```

### Required Methods

| Method             | Return Type      | Description                                 |
| ------------------ | ---------------- | ------------------------------------------- |
| `getSessionId()`   | `string \| null` | Get current session ID (null if no session) |
| `setSessionId(id)` | `void`           | Set session ID (optional implementation)    |
| `clearSession()`   | `void`           | Clear/reset session state                   |

### Optional Methods (Transport-specific)

| Method                                    | Class              | Description                   |
| ----------------------------------------- | ------------------ | ----------------------------- |
| `sendMessage(message)`                    | Both               | Send message and get response |
| `sendMessageStreaming(message, callback)` | CliTransport only  | Streaming response            |
| `createSession()`                         | HttpTransport only | Explicit session creation     |

### Error Handling

Transports should throw errors that:

- Include descriptive messages
- Indicate error type (timeout, network, session)
- Allow callers to implement appropriate retry logic

Example error handling in UnifiedAgent:

```typescript
if (err.name === 'AbortError') {
  this.transport.clearSession();
}

if (err.message.includes('session')) {
  this.transport.clearSession();
}
```

## Data Flow

### Task Execution Flow

```
User Code
    │
    ▼
UnifiedAgent.executeTask()
    │
    ▼
UnifiedAgent.executeWithRetry()
    │
    ├──► ConversationLogger.startConversation()
    │
    ▼
Transport.sendMessage()
    │
    ├──► HttpTransport: POST /session/{id}/message
    │
    └──► CliTransport: spawn opencode CLI
    │
    ▼
Parse Response & Extract Artifacts
    │
    ├──► ConversationLogger.addMessage()
    ├──► ConversationLogger.endConversation()
    │
    ▼
Return UnifiedAgentResponse
```

### Retry Flow

```
executeWithRetry(attempt=1)
    │
    ▼
Transport.sendMessage()
    │
    ├──► Success ──► Return response
    │
    └──► Failure ──► attempt < maxRetries?
                        │
                        ├──► Yes ──► calculateRetryDelay()
                        │           │
                        │           ▼
                        │      sleep(delay)
                        │           │
                        │           ▼
                        │      executeWithRetry(attempt+1)
                        │
                        └──► No ──► Return error response
```
