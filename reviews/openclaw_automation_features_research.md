# OpenClaw Automation Features Research

> Research date: 2026-03-22
> Status: Complete

## Executive Summary

OpenClaw's automation features (Hooks, Mail, Convoys) are implemented as lightweight, file-based systems designed for Git-backed state management. Nezha already has equivalent or superior functionality via PostgreSQL-backed services.

## Feature Comparison

| Feature           | OpenClaw Implementation                         | Nezha Implementation          | Assessment  |
| ----------------- | ----------------------------------------------- | ----------------------------- | ----------- |
| **Hooks**         | Event-driven registry with filesystem discovery | EventBus + PluginManager      | Equivalent  |
| **Mail**          | File-based inbox (JSON per worker)              | Tasks with Discussion: prefix | Can improve |
| **Convoys**       | Git-backed work orders with bead tracking       | Tasks with depends_on         | Equivalent  |
| **Patrols**       | Loop agents (Deacon, Witness, Refinery)         | HeartbeatService + Scheduler  | Equivalent  |
| **Activity Feed** | JSONL stream to file                            | HealthServer                  | Can enhance |

---

## 1. Hooks System

### OpenClaw Implementation

**Location**: `/Users/jk/gits/hub/openclaw/src/hooks/`

**Architecture**:

- Global singleton registry using `globalThis.__openclaw_internal_hook_handlers__`
- Hook handlers registered by event key (e.g., `'command'`, `'command:new'`)
- Supports wildcard matching (type-level + specific action)
- Fire-and-forget support for non-blocking execution

**Event Types**:

```typescript
type InternalHookEventType = 'command' | 'session' | 'agent' | 'gateway' | 'message';
```

**Key Files**:

- `internal-hooks.ts` - Core registry and trigger logic
- `workspace.ts` - Filesystem-based hook discovery
- `loader.ts` - Dynamic handler loading
- `gmail.ts` - Gmail Pub/Sub integration for email triggers
- `gateway/hooks.ts` - HTTP webhook endpoints

**Webhook Endpoints**:

- `POST /hooks/wake` - Wake main agent
- `POST /hooks/agent` - Run isolated agent
- `POST /hooks/<name>` - Custom mapped endpoints

### Nezha Implementation

**Location**: `/Users/jk/gits/hub/nezha/src/core/EventBus.ts`

**Architecture**:

- Map-based handler registry with subscription tracking
- Async support with Promise handling
- Database logging for key events
- Configurable max history size (default 100)

**Event Types** (NEZHA_EVENTS):

```typescript
(TASK_STARTED, TASK_COMPLETED, TASK_FAILED, TASK_RETRY);
(SCHEDULER_HEARTBEAT, SCHEDULER_PAUSED, SCHEDULER_RESUMED);
(AGENT_REGISTERED, AGENT_UNREGISTERED, AGENT_ERROR);
(SYSTEM_STARTED, SYSTEM_STOPPED, HEALTH_CHECK);
```

### Comparison

| Aspect      | OpenClaw                      | Nezha                |
| ----------- | ----------------------------- | -------------------- |
| Registry    | Global singleton (globalThis) | Instance-based class |
| Discovery   | Filesystem-based (HOOK.md)    | Manual registration  |
| Matching    | Wildcard (type + type:action) | Exact event key      |
| Async       | Fire-and-forget option        | Promise.all()        |
| Persistence | Not built-in                  | Optional DB logging  |

### Recommendation

**Keep current EventBus implementation**. It has cleaner TypeScript typing and better async support. Consider adding:

1. Wildcard subscription matching (e.g., `task:*`)
2. Filesystem-based hook discovery for extensibility

---

## 2. Mail System

### OpenClaw Implementation

**Location**: File-based in `.prose/gas-town/rigs/*/mail/{worker}.json`

**Architecture**:

- Simple JSON file per worker inbox
- Append-only message log
- Mailbox path: `.prose/gas-town/rigs/{rig}/mail/{worker}.json`

**Operations**:

```typescript
// Send mail
block gt_mail_send(from_worker, to_worker, message):
  // Append to target worker's mail file
  // Send nudge if worker is active

// Check inbox
block gt_mail_check(worker_name):
  // Read mail file
  // Return unread messages sorted by timestamp
  // Mark as read after returning
```

### Nezha Implementation

Nezha uses **tasks with special prefixes** for inter-agent communication:

```
Discussion: <message>  // Async discussion between AIs
Question: <query>      // Direct query to another AI
```

This is implemented in:

- `src/cli/TaskCommands.ts` - Task creation with prefixes
- `src/core/Scheduler.ts` - Task pickup and execution

### Comparison

| Aspect        | OpenClaw              | Nezha                   |
| ------------- | --------------------- | ----------------------- |
| Storage       | Per-worker JSON file  | PostgreSQL tasks table  |
| Delivery      | Push (append + nudge) | Pull (scheduler checks) |
| Persistence   | Git-backed            | Database                |
| Query         | File read + filter    | SQL query               |
| Notifications | Explicit nudge        | Scheduler heartbeat     |

### Recommendation

**Consider adding direct messaging capability**:

1. Create `messages` table for direct agent-to-agent messages
2. Add inbox check to scheduler (similar to task check)
3. Support push notifications via existing AlertService

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  from_agent VARCHAR(255) NOT NULL,
  to_agent VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

This would be **medium priority** - current task-based approach works well.

---

## 3. Convoys System

### OpenClaw Implementation

**Location**: `.prose/gas-town/convoys/`

**Architecture**:

- Git-backed work-order units tracking delivery
- Wraps beads (atomic work units) into trackable groups
- Multiple polecats can "attack" a convoy
- Lands when all beads complete AND MRs merge

**Convoy Structure**:

```json
{
  "id": "convoy-1234",
  "name": "dark-mode-dashboard",
  "status": "active" | "landed" | "blocked",
  "beads": ["bead-1", "bead-2", ...],
  "created": "2026-03-22T10:00:00Z",
  "landed_at": null,
  "swarm": {
    "polecat-1": { "bead": "bead-1", "status": "working" },
    "polecat-2": { "bead": "bead-2", "status": "complete" }
  }
}
```

**Operations**:

- `create_convoy()` - Start tracking a unit of work
- `land_convoy()` - Mark as complete, archive
- `spawn_swarm()` - Allocate polecats to convoy
- `check_swarm_health()` - Monitor progress

### Nezha Implementation

Nezha uses **tasks with dependencies**:

```sql
-- Tasks table has depends_on column
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title VARCHAR(500),
  status VARCHAR(50),
  depends_on UUID REFERENCES tasks(id)
);
```

**Execution Flow**:

1. Scheduler picks up tasks where `depends_on IS NULL` or dependency is COMPLETED
2. Task executes via Agent.executeTask()
3. On completion, dependent tasks become eligible

### Comparison

| Aspect     | OpenClaw                    | Nezha                    |
| ---------- | --------------------------- | ------------------------ |
| Work units | BEADS (Git-backed JSON)     | Tasks (Database)         |
| Tracking   | Dedicated convoy structure  | Task.depends_on          |
| Swarm      | Multiple workers per convoy | Single executor per task |
| Delivery   | Tracks MR merges            | Tracks task completion   |
| Archival   | Manual archive to /archive/ | Database retention       |

### Recommendation

**Nezha's approach is simpler and more flexible**. Key differences:

1. **Nezha has better querying** - SQL enables complex dependency graphs
2. **Nezha has better concurrency** - Multiple agents can pick different tasks
3. **OpenClaw has better visual tracking** - Convoy structure shows swarm status

**Consider adding convoy-like features**:

1. Task groups with shared metadata
2. Swarm status in task response
3. Cross-task MR tracking (link GitHub PRs to tasks)

---

## 4. Patrol System

### OpenClaw Implementation

**Location**: Agent prompts in `28-gas-town.prose`

**Patrol Agents**:
| Agent | Purpose | Loop |
|-------|---------|------|
| **Deacon** | Town-level heartbeat propagation | Every ~2 min |
| **Witness** | Swarm health monitoring per rig | Continuous |
| **Refinery** | Merge queue processing | Until queue empty |
| **Dogs** | Maintenance tasks (Boot watches Deacon) | As needed |

**Key Pattern: GUPP**

```
"If there is work on your hook, YOU MUST RUN IT"
Physics over politeness. No waiting for permission.
```

### Nezha Implementation

**HeartbeatService** (`src/services/HeartbeatService.ts`):

- Runs scheduler at configurable interval (default 30s)
- Checks for pending tasks
- Executes via Agent.executeTask()
- Exponential backoff on failure

**Scheduler** (`src/core/Scheduler.ts`):

- Task priority queue with age boost
- Dependency checking
- Recurring task support (cron)
- Dead letter queue for failures

### Comparison

| Aspect            | OpenClaw                   | Nezha                     |
| ----------------- | -------------------------- | ------------------------- |
| Pattern           | GUPP (pull from hook)      | Heartbeat (push to agent) |
| Staggering        | Top-of-hour load spreading | Random jitter on interval |
| Backoff           | Exponential on idle        | Exponential on failure    |
| Health monitoring | Witness agent              | HealthServer              |

### Recommendation

**Nezha's heartbeat approach is more robust**:

1. Predictable resource usage
2. Better failure isolation
3. Simpler debugging

**Consider adding health monitoring improvements**:

1. Activity feed endpoint (like OpenClaw's)
2. Worker status dashboard data
3. Automatic recycling of stuck tasks

---

## 5. Activity Feed

### OpenClaw Implementation

**Location**: `.prose/gas-town/activity-feed.jsonl`

**Format** (JSONL - one JSON per line):

```json
{"timestamp": "2026-03-22T10:00:00Z", "worker": "polecat-1", "type": "bead_complete", "details": "Added dark mode toggle"}
{"timestamp": "2026-03-22T10:01:00Z", "worker": "refinery", "type": "mr_merged", "details": "PR #123 merged to main"}
```

### Nezha Implementation

**HealthServer** (`src/services/HealthServer.ts`):

- `/health` - Basic health check
- `/status` - System status with task counts
- `/stats` - Historical statistics
- `/metrics` - Prometheus-format metrics

### Recommendation

**Add activity feed to HealthServer**:

```typescript
// New endpoint: GET /activity?since=<timestamp>&worker=<name>
interface ActivityEntry {
  timestamp: string;
  worker: string;
  type: string;
  details: string;
}
```

This would enable real-time dashboards and historical analysis.

---

## Implementation Roadmap

### Phase 1: Quick Wins (Low Effort, High Value)

1. **Activity Feed Endpoint**
   - Add `/activity` to HealthServer
   - Log key events to activity table
   - Query with timestamp filtering

2. **Wildcard Event Subscriptions**
   - Support `task:*` pattern in EventBus
   - Backward compatible

### Phase 2: Enhancements (Medium Effort)

3. **Direct Messaging Table**
   - Create `messages` table
   - Add inbox check to scheduler
   - Support `@agent message` syntax

4. **Task Groups**
   - Add `group_id` to tasks
   - Group-level status aggregation
   - Visual grouping in dashboards

### Phase 3: Advanced (Higher Effort)

5. **Git-backed Task Snapshots**
   - Optional: save task diffs to Git
   - Audit trail for task execution
   - Integration with existing Git workflows

6. **Cross-Agent Swarm Status**
   - Track parallel task execution
   - Resource utilization metrics
   - Automatic load balancing

---

## Conclusion

**Nezha already has equivalent or superior implementations** of OpenClaw's automation features:

| Feature       | Status         | Notes                                |
| ------------- | -------------- | ------------------------------------ |
| Hooks         | ✅ Adequate    | EventBus works well                  |
| Mail          | 🔄 Optional    | Tasks work, direct msgs nice-to-have |
| Convoys       | ✅ Adequate    | Tasks with deps are simpler          |
| Patrols       | ✅ Superior    | Heartbeat is more robust             |
| Activity Feed | 🔄 Can enhance | Add to HealthServer                  |

**Key Takeaway**: Don't over-engineer. OpenClaw's MEOW stack is designed for Git-backed persistence which has different trade-offs. PostgreSQL gives Nezha better querying and relationships.

**Recommended Focus**: Activity feed endpoint + optional direct messaging.

---

## Sources

- OpenClaw Hooks: `/Users/jk/gits/hub/openclaw/src/hooks/`
- OpenClaw Gas Town: `/Users/jk/gits/hub/openclaw/extensions/open-prose/skills/prose/examples/28-gas-town.prose`
- Nezha EventBus: `/Users/jk/gits/hub/nezha/src/core/EventBus.ts`
- Nezha Scheduler: `/Users/jk/gits/hub/nezha/src/core/Scheduler.ts`
