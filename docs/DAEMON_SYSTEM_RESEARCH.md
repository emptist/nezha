# Daemon & Heartbeat System Research

Research on how OpenCode and OpenClaw manage their daemon/heartbeat systems.

## 1. How They Run Background Services

### OpenClaw: Full-Fledged Daemon System

OpenClaw implements a comprehensive multi-platform daemon architecture:

| Platform    | Technology     | Implementation                                   |
| ----------- | -------------- | ------------------------------------------------ |
| **Linux**   | systemd        | User-level services at `~/.config/systemd/user/` |
| **macOS**   | launchd        | LaunchAgent at `~/Library/LaunchAgents/`         |
| **Windows** | Task Scheduler | Scheduled tasks via `schtasks`                   |

**Key Files:**

- `openclaw/src/daemon/service.ts` - Platform abstraction layer
- `openclaw/src/daemon/systemd.ts` - systemd implementation (714 lines)
- `openclaw/src/daemon/launchd.ts` - launchd implementation (529 lines)

**Installation Pattern:**

```typescript
// From systemd.ts - installSystemdService
// Creates unit file at ~/.config/systemd/user/openclaw-gateway.service
// Runs: systemctl --user enable && systemctl --user start
```

**Key Features:**

- **User-level services**: No root required, persists across reboots
- **Environment file support**: `EnvironmentFile=` directive for secrets
- **Linger support**: For non-interactive systemd users
- **Graceful restart handoff**: Detached process restart when gateway needs to restart itself

### OpenCode: Simpler HTTP Server Model

OpenCode uses a simpler approach with `opencode serve`:

**File:** `opencode/packages/opencode/src/server/server.ts`

```typescript
// Server runs as HTTP/WebSocket server on configurable port
// Listens on 127.0.0.1 by default with optional mDNS discovery
// Basic auth via OPENCODE_SERVER_PASSWORD env var
// No native systemd/launchd integration - relies on external process managers
```

**Daemon Pattern:**

- Runs as long-lived Bun HTTP server
- mDNS for LAN discovery
- TUI connects via WebSocket

---

## 2. Background Process Management

### OpenClaw: Lane-Based Serialization

**File:** `openclaw/src/process/command-queue.ts`

OpenClaw uses a **lane-based command queue** to serialize execution:

```typescript
export const enum CommandLane {
  Main = 'main', // Primary auto-reply workflow
  Cron = 'cron', // Scheduled jobs
  Subagent = 'subagent', // Spawned sub-agents
  Nested = 'nested', // Nested command execution
}
```

**Key Design Decisions:**

- **Serial execution by default**: Prevents race conditions when agents manipulate files
- **Configurable concurrency per lane**:
  - Main lane: 1 (agent max concurrent)
  - Cron lane: configurable via `cron.maxConcurrentRuns`
  - Subagent lane: configurable via subagent limits
- **Draining support**: Graceful shutdown with `GatewayDrainingError`

**Command Queue Features:**

- Per-lane queue with configurable max concurrent tasks
- Warning callbacks for long-waiting tasks
- Diagnostic logging for queue operations
- Generation tracking to handle stale tasks after restart

### OpenCode: In-Process Task Model

OpenCode handles background tasks differently:

- Tasks run in the same process
- Uses JSONL append-only format for inbox/message passing
- Event-driven auto-wake system (no polling)
- Fire-and-forget spawning with Promise.resolve()

---

## 3. Session Tracking

### OpenClaw: Session Key Architecture

**Session Model:**

- **main session**: Primary DM-like session per agent
- **Per-channel sessions**: Separate sessions for groups/channels/threads
- **Session keys**: Flexible mapping with secure DM mode support

**Storage:**

```typescript
// Session store at ~/.openclaw/agents/<agentId>/session-store.json
// Session transcripts as JSONL files
```

**Key Files:**

- `openclaw/src/config/sessions.ts`
- Session state owned by Gateway (clients query Gateway, not files)

### OpenCode: JSONL-Based Session Storage

OpenCode uses append-only JSONL for:

- Message storage (O(1) writes)
- Inbox persistence
- Session transcripts

**Approach:** File-based with JSONL append pattern for audit trails

---

## 4. Heartbeat System

### OpenClaw: Comprehensive Heartbeat Architecture

**File:** `openclaw/src/infra/heartbeat-runner.ts` (1246 lines)

**Heartbeat Features:**

1. **File-based gating**: Checks `HEARTBEAT.md` in workspace
2. **Quiet hours**: Respects active hours configuration
3. **Active hours filtering**: Time-based scheduling
4. **Duplicate detection**: Prevents nagging when nothing changed
5. **Transcript pruning**: Removes zero-information heartbeat exchanges
6. **Multi-agent support**: Each agent can have separate heartbeat config

**Heartbeat States:**

- `skipped`: Empty file, quiet hours, requests in flight
- `ok-empty`: No action needed, sends HEARTBEAT_TOKEN
- `ok-token`: Only heartbeat acknowledgment
- `ran`: Actual response delivered
- `failed`: Error occurred

**Cron Integration:**

- Cron jobs can trigger heartbeats
- Heartbeats can trigger cron job runs
- Session reaper integrated into timer ticks

### OpenClaw Cron Service

**File:** `openclaw/src/cron/service.ts` + `timer.ts`

**Timer Architecture:**

```typescript
// Uses Node.js setTimeout with MAX_TIMER_DELAY_MS = 60,000ms cap
// Re-arms every minute to avoid schedule drift
// Supports missed job catchup on startup
```

**Job States:**

- `running`: Currently executing
- `scheduled`: Next run time calculated
- `backoff`: Exponential backoff after errors

**Failure Handling:**

- Exponential backoff schedule: 30s, 1m, 5m, 15m, 60m
- Transient error retry (rate limit, network, timeout)
- Max retries configurable (default 3 for one-shot jobs)
- Failure alerts after N consecutive errors

---

## 5. Resource Consumption Patterns

### OpenClaw

**Memory Issues Identified:**

- SQLite database bloat (sessions never deleted)
- Bash tool output accumulation
- LSP diagnostics Map grows monotonically
- RPC pending map orphaned promises
- FileTime per-session tracking

**Best Practices from OpenClaw:**

- Scheduled compaction
- Context-aware session limits
- JSONL append-only (bounded growth)
- Per-job timeouts

### OpenCode

**Observations:**

- Uses Bun runtime (efficient for long-running processes)
- In-memory state management
- Per-project Instance management
- Disposable Instance pattern for cleanup

---

## 6. systemd/pm2/forever Patterns Used

### OpenClaw: Native Service Manager Integration

**systemd:**

```bash
# Unit file location: ~/.config/systemd/user/openclaw-gateway.service
# Commands: systemctl --user start/stop/restart/status
```

**LaunchAgent:**

```bash
# Plist location: ~/Library/LaunchAgents/ai.openclaw.gateway.plist
# Commands: launchctl bootstrap/bootout/kickstart
```

**Key systemd features used:**

- `Restart=always` implied by service persistence
- `WorkingDirectory=` configuration
- `EnvironmentFile=` for secrets
- `StandardOutput=/path/to/gateway.log`
- User linger for background operation

### OpenCode: No Native Service Management

OpenCode relies on external process managers:

- Manual `opencode serve` invocation
- External supervisor (systemd user service, PM2, etc.)
- No built-in service installation

---

## 7. Key Architectural Differences

| Aspect                | OpenClaw                            | OpenCode                              |
| --------------------- | ----------------------------------- | ------------------------------------- |
| **Daemon Model**      | Full native service integration     | HTTP server + external supervisor     |
| **Heartbeat**         | Comprehensive with file gating      | Not implemented (no persistent agent) |
| **Cron Jobs**         | Built-in scheduler with retry logic | Not implemented                       |
| **Process Isolation** | Lane-based serialization            | Same-process with JSONL               |
| **Multi-Agent**       | Multiple agents with routing        | Single agent + subagents              |
| **Service Install**   | `openclaw onboard --install-daemon` | Manual setup required                 |

---

## 8. Resource Patterns Summary

### OpenClaw Patterns:

1. **Watchdog timers**: Prevent hung executions
2. **Exponential backoff**: Error recovery with delays
3. **Concurrent run limits**: Configurable per-lane
4. **Session reaper**: Periodic cleanup
5. **Transcript pruning**: Memory management for heartbeats
6. **Graceful draining**: Finish in-flight work before restart

### OpenCode Patterns:

1. **JSONL append-only**: Audit trail + O(1) writes
2. **Event-driven messaging**: No polling overhead
3. **Per-project isolation**: Instance-based cleanup
4. **mDNS discovery**: Zero-config networking

---

## Source Code References

| Component           | Location                                          |
| ------------------- | ------------------------------------------------- |
| OpenClaw Daemon     | `openclaw/src/daemon/service.ts`                  |
| OpenClaw systemd    | `openclaw/src/daemon/systemd.ts`                  |
| OpenClaw launchd    | `openclaw/src/daemon/launchd.ts`                  |
| OpenClaw Cron Timer | `openclaw/src/cron/service/timer.ts`              |
| OpenClaw Heartbeat  | `openclaw/src/infra/heartbeat-runner.ts`          |
| OpenClaw Lanes      | `openclaw/src/process/lanes.ts`                   |
| OpenClaw Queue      | `openclaw/src/process/command-queue.ts`           |
| OpenCode Server     | `opencode/packages/opencode/src/server/server.ts` |
| OpenCode Bus        | `opencode/packages/opencode/src/bus/index.ts`     |
