# Nezha System Review - Comparison with OpenClaw

**Reviewer**: AI Assistant  
**Date**: 2026-03-18  
**Version**: 1.0

---

## Executive Summary

This review compares the Nezha autonomous agent system against its reference implementation, OpenClaw. The analysis reveals significant gaps in architecture, implementation, and design that need to be addressed for Nezha to achieve its intended capabilities.

---

## Architecture Comparison

### OpenClaw Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      OpenClaw System                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Gateway   │  │   Channels  │  │    Memory System       │ │
│  │  (Webhooks) │  │ (Telegram,  │  │  - Vector Search       │ │
│  │             │  │  WhatsApp)   │  │  - Hybrid Search       │ │
│  │             │  │              │  │  - Embeddings          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Heartbeat System (1200+ lines)                │ │
│  │  - HEARTBEAT.md file execution                            │ │
│  │  - Active hours configuration                              │ │
│  │  - Wake modes (cron/immediate)                             │ │
│  │  - Empty content detection                                  │ │
│  │  - Token-based acknowledgment                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Bootstrap File System                          │ │
│  │  AGENTS.md | HEARTBEAT.md | SOUL.md | IDENTITY.md |       │ │
│  │  USER.md | MEMORY.md | memory/YYYY-MM-DD.md               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              LLM Integration                                │ │
│  │  - Direct model calls                                      │ │
│  │  - Context injection                                        │ │
│  │  - Tool execution                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Nezha Architecture (Current)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Nezha System                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                     NezhaCore                                │ │
│  │  - DatabaseClient (PostgreSQL)                              │ │
│  │  - Scheduler (basic task polling)                          │ │
│  │  - HeartbeatService (simple interval-based)                │ │
│  │  - AgentSystem (agent registry)                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐ │
│  │       Agent         │  │        MemoryService              │ │
│  │  (HTTP wrapper for │  │  (Database-backed storage)       │ │
│  │   opencode CLI)    │  │  - Vector search (not working)   │ │
│  │                     │  │  - Keyword search                 │ │
│  └─────────────────────┘  │  - Hybrid search                 │ │
│                            └──────────────────────────────────┘ │
│                                                                  │
│  ❌ Missing: Bootstrap files, Learning tools, HEARTBEAT.md     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Issues

### Issue 1: Learning System Not Implemented

**Severity**: CRITICAL

**Description**: The LEARNING_SYSTEM.md contains comprehensive documentation for an AI-driven learning system, but the actual tools described (memory_save, memory_search, memory_link) do not exist as callable AI tools.

**Location**: 
- Documentation: `LEARNING_SYSTEM.md`
- Missing implementation: `src/tools/` (directory doesn't exist)

**Impact**: The AI cannot autonomously learn from experiences or retrieve past knowledge.

**Recommendation**: Implement the memory tools as actual function calls available to the AI agent.

---

### Issue 2: Agent is Just an HTTP Wrapper

**Severity**: CRITICAL

**Description**: The Agent class (`src/core/Agent.ts`) is merely an HTTP client that forwards requests to the opencode CLI. It has no real AI/LLM integration.

**Code Reference**: `src/core/Agent.ts:62-283`

```typescript
// Current implementation - just forwards to opencode
async executeTask(message: string): Promise<AgentResponse> {
  const session = await this.createSession();  // Creates opencode session
  return await this.sendMessage(session.id, message);  // Sends message
}
```

**Impact**: Nezha cannot function autonomously - it depends entirely on opencode being running and accessible.

**Recommendation**: Implement direct LLM integration using a model provider (OpenAI, Anthropic, etc.).

---

### Issue 3: SQL Injection Vulnerabilities

**Severity**: HIGH

**Description**: Multiple methods in Memory.ts use string interpolation instead of parameterized queries, allowing SQL injection attacks.

**Vulnerable Code**:

**Location**: `src/core/Memory.ts`

**Line 113-137 - vectorSearch**:
```typescript
const result = await this.db.query<VectorSearchResult>(
  `SELECT ... (1 - (embedding <=> '${embeddingStr}'::vector)) ...`
);
// embeddingStr, queryThreshold, queryLimit are interpolated
```

**Line 147-169 - keywordSearch**:
```typescript
`SELECT ... plainto_tsquery('english', '${query}') ...`
// query is directly interpolated
```

**Line 186-252 - hybridSearch**: Same issues.

**Impact**: User-controlled input can manipulate SQL queries.

**Recommendation**: Use parameterized queries for all user input.

---

### Issue 4: Heartbeat System Too Simplistic

**Severity**: HIGH

**Description**: OpenClaw's heartbeat is 1200+ lines with sophisticated features. Nezha's is a basic interval poller.

**OpenClaw Features (Missing in Nezha)**:
- HEARTBEAT.md file reading and execution
- Empty content detection to skip unnecessary runs
- Active hours configuration
- Wake modes (cron-style vs immediate)
- Visibility controls
- Token-based acknowledgment (HEARTBEAT_OK)
- Session management

**Location**: `src/services/HeartbeatService.ts`

**Current Implementation**: Simple `setInterval` that polls database for pending tasks.

**Recommendation**: Implement proper HEARTBEAT.md-based execution model.

---

### Issue 5: Missing Bootstrap File System

**Severity**: HIGH

**Description**: OpenClaw uses workspace bootstrap files for configuration, identity, and memory. Nezha has none of these.

**OpenClaw Files**:
- `AGENTS.md` - Agent instructions and capabilities
- `HEARTBEAT.md` - Periodic checklist
- `SOUL.md` - Core identity
- `IDENTITY.md` - Identity configuration
- `USER.md` - User preferences
- `MEMORY.md` - Permanent memory
- `memory/YYYY-MM-DD.md` - Daily memory files

**Impact**: No way to configure agent behavior, no persistent memory system.

**Recommendation**: Implement workspace bootstrap file system.

---

### Issue 6: Fire-and-Forget Task Execution

**Severity**: MEDIUM

**Description**: In HeartbeatService.ts:156, tasks are sent to the agent but the code doesn't wait for actual completion.

**Code**:
```typescript
const result = await this.agent.executeTask(description || title);
// Returns immediately after sending - doesn't wait for task completion
```

**Impact**: Task success/failure cannot be properly tracked.

**Recommendation**: Implement proper async task tracking with status callbacks.

---

### Issue 7: Duplicate Code

**Severity**: LOW

**Description**: Multiple re-export files that serve no purpose.

**Examples**:
- `src/core/MemoryService.ts` (5 lines) - re-exports from `src/core/Memory.ts`
- `src/services/MemoryService.ts` (5 lines) - also re-exports from `src/core/Memory.ts`

**Recommendation**: Remove duplicate re-exports.

---

### Issue 8: Memory System Not Integrated

**Severity**: MEDIUM

**Description**: MemoryService is created in HeartbeatService but never used for:
- Context injection before task execution
- Learning from task results
- Knowledge retrieval for task context

**Location**: `src/services/HeartbeatService.ts:65`

```typescript
this.memory = new MemoryService(db, undefined, embeddingProvider);
// Created but never used for context injection
```

**Recommendation**: Integrate memory with task execution flow.

---

### Issue 9: Missing Workspace Concept

**Severity**: MEDIUM

**Description**: OpenClaw has agent workspaces with file-based state management. Nezha has no equivalent.

**Impact**: No persistent state between sessions beyond database.

**Recommendation**: Implement workspace directory concept.

---

### Issue 10: Improper Error Handling in Agent

**Severity**: MEDIUM

**Description**: `Agent.ts:246-268` returns `success: true` even when response is empty or malformed.

**Location**: `src/core/Agent.ts:253-262`

```typescript
if (!result.ok) {
  return { success: false, message: errorMsg };
}
return { success: true, sessionId };  // Always true if HTTP 200
```

**Impact**: False positives for task success.

**Recommendation**: Validate response content before returning success.

---

## Summary Table

| Issue | Severity | Effort to Fix |
|-------|----------|---------------|
| Learning System Not Implemented | CRITICAL | High |
| Agent is HTTP Wrapper | CRITICAL | High |
| SQL Injection Vulnerabilities | HIGH | Medium |
| Heartbeat Too Simplistic | HIGH | High |
| Missing Bootstrap Files | HIGH | Medium |
| Fire-and-Forget Tasks | MEDIUM | Low |
| Duplicate Code | LOW | Low |
| Memory Not Integrated | MEDIUM | Medium |
| Missing Workspace Concept | MEDIUM | Medium |
| Improper Error Handling | MEDIUM | Low |

---

## Conclusion

Nezha is currently a thin wrapper around the opencode CLI with a database-backed task queue. It lacks the sophisticated AI-driven memory, learning, and heartbeat mechanisms that make OpenClaw autonomous. To achieve its goals, Nezha needs significant architectural improvements in:

1. Direct LLM integration (not HTTP wrapper)
2. Complete memory tool implementation
3. HEARTBEAT.md-based execution
4. Bootstrap file system
5. Proper error handling

---

**End of Review**
