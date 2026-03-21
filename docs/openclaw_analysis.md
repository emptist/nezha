# OpenClaw-Inspired Architecture Analysis

**Created**: 2026-03-22
**Status**: Architecture Summary

---

## Overview

Nezha's autonomous agent architecture is inspired by OpenClaw's continuous execution model. Unlike OpenClaw which has its own built-in AI, Nezha delegates AI execution to the opencode CLI, creating a lightweight task-based automation system.

---

## Architecture Components

### 1. Core Agent System

```
src/core/
├── Agent.ts              # HTTP-only agent (deprecated, for backward compat)
├── UnifiedAgent.ts        # Main agent with dual transport support
├── Scheduler.ts          # Heartbeat-based task scheduler
├── OpenCodeClient.ts     # CLI transport client
└── transports/
    └── index.ts          # HttpTransport + CliTransport implementations
```

### 2. Task Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Execution Flow                           │
│                                                                  │
│  1. Task Added to DB ──→ Scheduler Heartbeat ──→ Pick Task      │
│                                │                                 │
│                                ▼                                 │
│  2. HeartbeatService.executeTask()                              │
│                                │                                 │
│                                ▼                                 │
│  3. UnifiedAgent (HTTP or CLI transport)                        │
│                                │                                 │
│              ┌─────────────────┴─────────────────┐              │
│              ▼                                   ▼              │
│     ┌────────────────┐                 ┌────────────────┐       │
│     │  HttpTransport │                 │  CliTransport  │       │
│     │ (HTTP API)     │                 │ (opencode CLI)  │       │
│     └────────────────┘                 └────────────────┘       │
│              │                                   │              │
│              └─────────────────┬─────────────────┘              │
│                                ▼                                 │
│  4. Task Result ──→ Memory ──→ Reflection                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### UnifiedAgent (`src/core/UnifiedAgent.ts`)

The main agent class providing a unified interface for AI task execution with:

- **Dual Transport Support**: HTTP or CLI mode
- **Circuit Breaker**: Prevents cascading failures
- **Retry Logic**: Exponential backoff with jitter
- **Response Caching**: Reduces redundant AI calls
- **Conversation Logging**: Records all interactions

```typescript
// Example usage
const agent = new UnifiedAgent({
  mode: 'cli', // or 'http'
  timeout: 600000,
  enableFallback: true,
  fallbackMode: 'http',
});

const result = await agent.executeTask('Fix the login bug');
```

### Scheduler (`src/core/Scheduler.ts`)

Heartbeat-based task scheduler that:

- Checks database for pending tasks on interval (default: 30s)
- Uses `FOR UPDATE SKIP LOCKED` for atomic task acquisition
- Supports task dependencies and priorities
- Implements retry with exponential backoff
- Tracks consecutive failures and auto-pause
- Dead Letter Queue for failed tasks

**Priority Calculation**:

```
final_priority = base_priority
               + age_boost (up to 10 points)
               + retry_boost (2 points per retry)
               + type_weight (bugfix: +5, deployment: +3)
               + category_weight (security: +5, bugfix: +3)
```

### Transport Layer (`src/core/transports/index.ts`)

#### HttpTransport

- Creates persistent sessions with opencode server
- Sends messages via REST API (`POST /session/:id/message`)
- Handles timeouts and error recovery

#### CliTransport

- Spawns `opencode run --attach <server> --format json` process
- Pipes prompt to stdin, parses JSON events from stdout
- Supports streaming responses (via stderr)
- Tracks PIDs for orphan cleanup (Process Guardian)

### HeartbeatService (`src/services/HeartbeatService.ts`)

The main daemon service that orchestrates everything:

1. **Bootstrap**: Load essential knowledge to database
2. **Memory Cleanup**: Periodic cleanup of old memories
3. **Checkpoint**: Save state for recovery
4. **Insight Generation**: Run periodic checks:
   - Meeting invites
   - Review follow-ups
   - DLQ to issues conversion
   - Broadcast processing
   - Communication polling

5. **Task Execution**: Delegates to UnifiedAgent
6. **Reflection**: Parses task results for learnings
7. **Webhooks**: Sends notifications on completion/failure

---

## Comparison: OpenClaw vs Nezha

| Aspect             | OpenClaw                        | Nezha                          |
| ------------------ | ------------------------------- | ------------------------------ |
| **AI Execution**   | Built-in                        | External (opencode CLI)        |
| **Continuous Run** | `while(true)` + `waitForever()` | Scheduler with `setInterval`   |
| **Task Model**     | Sessions + Convoys              | Database tasks + priorities    |
| **Hooks**          | Event-driven hook system        | Plugin system                  |
| **Memory**         | Session-based files             | PostgreSQL + vector embeddings |
| **Transport**      | Internal                        | HTTP API + CLI spawn           |

---

## Nezha Advantages over OpenClaw

1. **Lighter Weight**: No built-in AI - leverages opencode's latest model
2. **Persistence**: All state in PostgreSQL - survives restarts
3. **Searchable Memory**: Vector embeddings enable semantic search
4. **Multi-agent Ready**: Task queue supports distributed execution
5. **Production Ready**: Circuit breakers, retries, dead letter queues

---

## Key Files Reference

| Component  | File                               | Purpose                       |
| ---------- | ---------------------------------- | ----------------------------- |
| Agent      | `src/core/UnifiedAgent.ts`         | Main task execution           |
| Scheduler  | `src/core/Scheduler.ts`            | Task scheduling & heartbeat   |
| Transports | `src/core/transports/index.ts`     | HTTP & CLI communication      |
| Daemon     | `src/services/HeartbeatService.ts` | Main service orchestration    |
| Memory     | `src/core/Memory.ts`               | Vector-based long-term memory |
| Learning   | `src/core/LearningAnalysis.ts`     | Outcome tracking & insights   |

---

## Implementation Patterns

### 1. Agent Transport Pattern

```typescript
// Create transport based on config
export function createTransport(config: TransportConfig): HttpTransport | CliTransport {
  if (config.mode === 'cli') {
    return new CliTransport(config.serverUrl, config.timeout);
  }
  return new HttpTransport(config.serverUrl, config.timeout);
}
```

### 2. Session Management

- HttpTransport: Creates session on first message, reuses
- CliTransport: No sessions (stateless spawns)

### 3. Error Classification

Errors are categorized into:

- `AUTH`: Non-retryable (auth failures)
- `NETWORK`: Retryable
- `TIMEOUT`: Retryable with backoff
- `UNKNOWN`: Retryable with caution

### 4. Task Retry Logic

```typescript
// Exponential backoff with jitter
const delay = baseDelay * Math.pow(2, attempt - 1);
const jitter = Math.random() * 0.3 * baseDelay;
const finalDelay = Math.min(delay + jitter, maxDelay);
```

---

## Reflection System

After each task, `HeartbeatService.runReflection()` parses output for:

- `[LEARN]` - Save insights to memory
- `[PROMPT_UPDATE]` - Suggest system prompt improvements
- `[ISSUE]` - Create issues from problems
- `**What worked well:**` - Positive learnings
- `**What could be improved:**` - Improvement suggestions

---

## Conclusion

Nezha implements OpenClaw's continuous execution model while:

- Offloading AI to opencode (staying lightweight)
- Adding PostgreSQL persistence (production-ready)
- Implementing vector search (semantic memory)
- Supporting multi-agent via task queue

The architecture is well-suited for autonomous software engineering with self-improvement capabilities.
