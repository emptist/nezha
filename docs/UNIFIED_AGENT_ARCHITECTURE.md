# Unified Agent Architecture

A transport-agnostic agent system that supports both HTTP and CLI modes through a pluggable transport layer.

## Overview

The Unified Agent architecture provides a flexible foundation for executing AI-powered tasks through different communication mechanisms. The core principle is **transport separation** - business logic is decoupled from the underlying communication method.

```
┌─────────────────────────────────────────────────────────────────┐
│                         UnifiedAgent                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Agent     │  │  CliAgent   │  │ UnifiedAgent (generic)  │  │
│  │  (HTTP)     │  │   (CLI)     │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                           │                                     │
│                           ▼                                     │
│              ┌────────────────────────┐                          │
│              │     Transport Layer    │                          │
│              ├────────────────────────┤                          │
│              │  createTransport()     │                          │
│              └────────────────────────┘                          │
│                    │            │                                │
│                    ▼            ▼                                │
│              ┌──────────┐  ┌──────────┐                          │
│              │HttpTrans │  │CliTrans  │                          │
│              │  -port   │  │ spawn()  │                          │
│              │ sessions │  │ streaming│                          │
│              └──────────┘  └──────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## Transport Layer Pattern

### Transport Interface Contract

Both `HttpTransport` and `CliTransport` implement the `SessionManager` interface:

```typescript
interface SessionManager {
  getSessionId(): string | null;
  setSessionId(id: string | null): void;
  clearSession(): void;
}
```

### HttpTransport vs CliTransport

| Feature            | HttpTransport                         | CliTransport                     |
| ------------------ | ------------------------------------- | -------------------------------- |
| **Protocol**       | REST API via HTTP                     | Spawns `opencode` CLI process    |
| **Sessions**       | Full session management               | No sessions (stateless)          |
| **Streaming**      | Not supported                         | Supported via stderr parsing     |
| **Use Case**       | Server-to-server, long-running agents | Local CLI execution, interactive |
| **Error Recovery** | Session-based retry with clearSession | Process re-spawn on failure      |
| **Session ID**     | Managed internally                    | Always returns `null`            |

### HttpTransport Details

- Maintains a persistent session with the OpenCode server
- Session ID is created lazily on first message
- Thread-safe session creation via `sessionCreationLock`
- Automatic timeout handling with AbortController

```typescript
const transport = new HttpTransport('http://localhost:4096', 600000);
const sessionId = await transport.createSession();
const response = await transport.sendMessage('Your task here');
```

### CliTransport Details

- Spawns `opencode run --attach <server> --format json <prompt>`
- Parses JSON events from stderr for streaming responses
- Supports `--thinking` flag for streaming mode
- Process cleanup on timeout/SIGTERM/SIGINT

```typescript
const transport = new CliTransport('http://localhost:4096', 600000);

// Non-streaming
const response = await transport.sendMessage('Your task here');

// Streaming
await transport.sendMessageStreaming('Your task here', (chunk, type) => {
  console.log(`[${type}]`, chunk);
});
```

## Using UnifiedAgent, Agent, and CliAgent

### UnifiedAgent (Generic)

Base class supporting both HTTP and CLI modes:

```typescript
import { UnifiedAgent } from './core/UnifiedAgent';

const agent = new UnifiedAgent({
  mode: 'http', // or 'cli'
  timeout: 600000, // 10 minutes
  maxRetries: 3,
  retryDelay: 1000,
  serverUrl: 'http://localhost:4096',
  enableLogging: true,
  logDir: 'conversations',
});

// Simple task execution
const result = await agent.executeTask('Fix the authentication bug');

// Structured task with metadata
const taskResult = await agent.executeStructuredTask({
  title: 'Implement feature X',
  description: 'Add support for OAuth2',
  context: 'Existing codebase uses Passport.js',
});

// Streaming (CLI mode only)
await agent.executeTaskStreaming('Deploy to production', (chunk, type) => {
  process.stdout.write(chunk);
});
```

### Agent (HTTP Mode)

Convenience class for HTTP-only operations:

```typescript
import { Agent } from './core/UnifiedAgent';

const agent = new Agent({
  timeout: 300000,
  maxRetries: 3,
  serverUrl: 'http://localhost:4096',
});

const result = await agent.executeTask('Run the test suite');
```

### CliAgent (CLI Mode)

Convenience class for CLI-mode operations with logging enabled:

```typescript
import { CliAgent } from './core/UnifiedAgent';

const agent = new CliAgent({
  timeout: 600000,
  logDir: './conversation-logs',
});

const result = await agent.executeTask('Analyze the codebase');
```

## Migration Guide from Old Agent.ts

### Before (Old Agent.ts)

```typescript
import { Agent } from './core/Agent';

const agent = new Agent({
  timeout: 600000,
  maxRetries: 3,
  serverUrl: 'http://localhost:4096',
});

const result = await agent.executeTask('Your task');
```

### After (New UnifiedAgent)

```typescript
import { Agent } from './core/UnifiedAgent';

const agent = new Agent({
  timeout: 600000,
  maxRetries: 3,
  serverUrl: 'http://localhost:4096',
});

const result = await agent.executeTask('Your task');
```

### Key Differences

| Aspect                   | Old Agent               | New UnifiedAgent                                     |
| ------------------------ | ----------------------- | ---------------------------------------------------- |
| **Import path**          | `'./core/Agent'`        | `'./core/UnifiedAgent'`                              |
| **Session management**   | Manual, stored in class | Delegated to transport                               |
| **Response type**        | `{ success, message }`  | `{ success, message, output, artifacts, sessionId }` |
| **Structured tasks**     | Not supported           | `executeStructuredTask()`                            |
| **Streaming**            | Not supported           | `executeTaskStreaming()` (CLI only)                  |
| **Conversation logging** | Always enabled          | Configurable via `enableLogging`                     |
| **Transport layer**      | Built-in HTTP only      | Pluggable HTTP/CLI                                   |

### Breaking Changes

1. **Import path changed**: Update from `'./core/Agent'` to `'./core/UnifiedAgent'`
2. **Response structure**: Now includes `output`, `artifacts`, and `sessionId` fields
3. **Session handling**: Sessions are managed by the transport layer

### Import Compatibility

For backwards compatibility, you can use named imports:

```typescript
// Old import still works via re-export in index.ts
import { Agent } from './core/UnifiedAgent';

// Or use the new unified import
import { UnifiedAgent, Agent, CliAgent } from './core/UnifiedAgent';
```

## Architecture Benefits

1. **Testability**: Transport implementations can be easily mocked
2. **Extensibility**: New transports can be added without modifying agent logic
3. **Flexibility**: Switch between HTTP and CLI modes without changing business logic
4. **Streaming**: CLI mode supports real-time streaming of responses
5. **Consistent API**: All transports provide the same interface contract
