# OpenClaw Automation Features Research - 2026-03-22

**Research Date:** 2026-03-22
**Source:** `/Users/jk/gits/hub/opencode`
**Tag:** openclaw-automation-research

## Executive Summary

OpenClaw has 3 main automation systems: **Hooks**, **Bus/Events**, and **Session-based workflows**. No dedicated "mail" or "convoy" systems - these are achieved through other primitives.

Nezha has **equivalent or superior implementations** for most features due to PostgreSQL backend.

---

## 1. Hooks System Analysis

### OpenClaw Implementation

| Aspect       | Details                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| Architecture | Plugin-based with `@opencode-ai/plugin` package                                        |
| Event Types  | 15+ hooks: `chat.message`, `tool.execute.before/after`, `command.execute.before`, etc. |
| Trigger      | Sequential hook execution via `trigger()` function                                     |
| Discovery    | Bundled plugins + workspace hooks directory                                            |

### Nezha Implementation

| Aspect       | Details                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Architecture | `PluginManager.ts` + `EventBus.ts`                                                                    |
| Hooks        | `beforeTask`, `afterTask`, `onError`, `onStartup`, `onShutdown`, `onHeartbeat`, `onWebhook`, `onWake` |
| Event Types  | 12+ via `NEZHA_EVENTS` constants                                                                      |
| Discovery    | Programmatic registration via `registerPlugin()`                                                      |

### Comparison

| Feature               | OpenClaw | Nezha                    |
| --------------------- | -------- | ------------------------ |
| Hook lifecycle events | ✅       | ✅                       |
| Wildcard matching     | ❌       | ❌                       |
| DB persistence        | ❌       | ✅ (via event_log table) |
| Async support         | ✅       | ✅                       |
| Error isolation       | Per-hook | Per-plugin               |

**Verdict:** Nezha hooks are **equivalent** with better persistence.

---

## 2. Bus/Event System Analysis

### OpenClaw Implementation

```typescript
export const GlobalBus = new EventEmitter();
export namespace Bus {
  export async function publish(def, properties) { ... }
  export function subscribe(def, callback) { ... }
}
```

- In-process EventEmitter
- ACP protocol for cross-instance communication
- Broadcasts to MCP clients

### Nezha Implementation

```typescript
export class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  async publish<T>(event: string, data: T): Promise<void> { ... }
  subscribe<T>(event: string, handler: EventHandler<T>): string { ... }
}
```

- Same Map-based architecture
- DB-backed event logging
- MCP server for external subscriptions (planned)

**Verdict:** Nezha is **equivalent** with DB persistence advantage.

---

## 3. Mail System Analysis

### OpenClaw

No dedicated mail. Uses:

- **Session-based tasks**: Parent-child session chains
- **ACP protocol**: Inter-agent messaging
- **Question system**: Request/response patterns

### Nezha

Uses **PostgreSQL tasks**:

- Tasks table with priority, status, dependencies
- Task-based communication via `task.tool`
- Database queries for coordination

**Verdict:** Nezha approach is **superior** - PostgreSQL enables:

- Reliable persistence
- Queryable history
- Priority-based routing
- Dependency management

---

## 4. Convoys Analysis

### OpenClaw

Not a dedicated feature. Achieved via:

- Session chains (parentID linking)
- Skills for workflow templates
- AsyncQueue for parallelization

### Nezha

Uses **task `depends_on`** field:

- SQL-level dependency tracking
- Task grouping in UI
- Parallel execution of independent tasks

**Verdict:** Nezha approach is **equivalent** with better visualization potential.

---

## 5. Key Insights

### What OpenClaw Does Better

1. **MCP Integration**: Native MCP server for external subscriptions
2. **Skills System**: YAML-frontmatter workflow templates
3. **Wildcard Hooks**: Pattern matching in event subscriptions (noted as low priority)

### What Nezha Does Better

1. **Persistence**: PostgreSQL backend for all events/tasks
2. **Queryability**: SQL queries on events and tasks
3. **Reliability**: Transaction-based operations
4. **Multi-agent**: Built-in agent registry and coordination

### Simplicity Principle

From AGENTS.md learnings: "Simpler mechanisms (heartbeat daemon) often more robust than complex ones."

OpenClaw achieves complexity through:

- File-based state (Git)
- In-process events
- Session chains

Nezha achieves the same through:

- PostgreSQL tables
- Query-based operations
- Task dependencies

---

## 6. Recommendations

### Low Priority Improvements

| Item                                 | Rationale                   |
| ------------------------------------ | --------------------------- |
| Add wildcard matching (`task:*`)     | Nice-to-have, not blocking  |
| Activity feed endpoint               | Basic implementation exists |
| Task groups for convoy visualization | Can add later if needed     |

### Not Needed

| Feature            | Reason                                  |
| ------------------ | --------------------------------------- |
| Gmail integration  | Webhook system covers external triggers |
| File-based mail    | Database approach is superior           |
| ACP protocol clone | PostgreSQL handles coordination better  |

### Key Takeaway

**Don't over-engineer to match OpenClaw's Git-backed approach.** PostgreSQL gives Nezha better querying and relationships. Focus on:

1. Process Guardian completion (P0)
2. Inter-Review integration (P0)
3. Test coverage (P1)

---

## 7. Implementation Status

| Feature           | OpenClaw           | Nezha           | Status          |
| ----------------- | ------------------ | --------------- | --------------- |
| Hooks             | ✅                 | ✅              | **Implemented** |
| Event Bus         | ✅                 | ✅              | **Implemented** |
| Webhook endpoints | ✅                 | ✅              | **Implemented** |
| Plugin system     | ✅                 | ✅              | **Implemented** |
| Mail system       | ⚠️ (session-based) | ✅ (task-based) | **Superior**    |
| Convoys           | ⚠️ (patterns)      | ✅ (depends_on) | **Equivalent**  |
| MCP server        | ✅                 | 🔄 (planned)    | Gap             |
| Skills system     | ✅                 | 🔄 (basic)      | Gap             |

---

## References

- OpenClaw hooks: `packages/plugin/src/index.ts`
- OpenClaw bus: `packages/opencode/src/bus/index.ts`
- Nezha EventBus: `src/core/EventBus.ts`
- Nezha PluginManager: `src/core/PluginManager.ts`
- Previous research: `reviews/openclaw_automation_features_2026-03-22.md`
