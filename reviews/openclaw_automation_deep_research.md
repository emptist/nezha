# OpenClaw Automation Features - Deep Research Report

> Research date: 2026-03-22
> Task: Study how OpenClaw implements hooks, mail, and convoys

## Executive Summary

OpenClaw's automation features (hooks, mail, convoys) are implemented as **protocols/procedures** within the OpenProse DSL, not as separate infrastructure. They are **Git-backed patterns** with specific file-based storage.

---

## 1. Hooks System

### How OpenClaw Implements Hooks

**Storage**: `.prose/gas-town/rigs/{name}/hooks/` (per-worker hook files)

**Mechanism**: GUPP Principle - "Gas Town Universal Propulsion Principle"

> "If there is work on your hook, YOU MUST RUN IT. Physics over politeness."

**Implementation** (from gas-town.prose):

```
block sling_work(bead_id, target_worker):
  session "Sling bead {bead_id} to {target_worker}"
    prompt: """
1. Read .prose/gas-town/beads/{bead_id}.json
2. Add to .prose/gas-town/hooks/{target_worker}.json
3. Send nudge message to {target_worker}
4. Return confirmation
"""
```

**Hook Discovery**: Filesystem-based

- Worker starts → reads hook file → executes GUPP
- New work added → hook file updated → worker nudged

**Key Files**:

- `/hooks/` directory per rig for worker hooks
- Hook files are JSON arrays of bead IDs
- Workers check hooks on startup and via patrol loops

### Nezha Equivalence

| Aspect                | OpenClaw               | Nezha                      |
| --------------------- | ---------------------- | -------------------------- |
| Work storage          | JSON files in Git      | PostgreSQL tasks table     |
| Trigger mechanism     | GUPP (check hook file) | HeartbeatService (DB poll) |
| Worker discovery      | Hook files             | Task assignment            |
| Delivery confirmation | Nudge + log activity   | Task status update         |

**Assessment**: Nezha's database approach is MORE flexible:

- SQL queries for priority, dependencies, deadlines
- Atomic updates, transactions
- Rich metadata (tags, importance, metadata)
- No file parsing needed

---

## 2. Mail System

### How OpenClaw Implements Mail

**Storage**: `.prose/gas-town/rigs/*/mail/{worker}.json` (per-worker inboxes)

**Implementation** (from gas-town.prose):

```
block gt_mail_send(from_worker, to_worker, message):
  session "Mail: {from_worker} -> {to_worker}"
    prompt: """
Send mail message:
1. Create mail entry with timestamp, from, to, message
2. Append to .prose/gas-town/rigs/*/mail/{to_worker}.json
3. If to_worker is active, send nudge
4. Log to activity feed
5. Return message ID
"""

block gt_mail_check(worker_name):
  session "Check mail for {worker_name}"
    prompt: """
Read mail inbox:
1. Read .prose/gas-town/rigs/*/mail/{worker_name}.json
2. Also check town-level mail
3. Return unread messages sorted by timestamp
4. Mark as read after returning
"""
```

**Mail Format**:

```json
{
  "messages": [
    {
      "id": "msg-123",
      "from": "polecat-42",
      "to": "mayor",
      "message": "MR #45 ready for review",
      "timestamp": "2026-03-22T10:00:00Z",
      "read": false
    }
  ]
}
```

### Nezha Equivalence

| Aspect          | OpenClaw               | Nezha                           |
| --------------- | ---------------------- | ------------------------------- |
| Message storage | JSON files             | Tasks with "Discussion:" prefix |
| Delivery        | Nudge to active worker | Broadcast via MCP/DB            |
| Inbox check     | Explicit gt_mail_check | Query tasks with filters        |
| Persistence     | Git-tracked            | PostgreSQL                      |

**Current Nezha Pattern**:

```sql
-- Messages are tasks with special prefix
INSERT INTO tasks (title, status)
VALUES ('Discussion: polecat-42 → mayor: MR #45 ready', 'PENDING');
```

**Assessment**: Nezha's task-based approach works but lacks:

- Dedicated inbox per agent
- Unread/read tracking
- Direct push notifications (vs polling)

### Recommendation for Improvement

Add a lightweight `notifications` table:

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  recipient VARCHAR(255) NOT NULL,
  sender VARCHAR(255),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

This would provide:

- Direct inbox per agent
- Read/unread state
- Optional expiration
- Can be queried alongside tasks

---

## 3. Convoys System

### How OpenClaw Implements Convoys

**Storage**: `.prose/gas-town/convoys/` (work orders)

**Purpose**: Track multi-bead work orders through completion

**Implementation** (from gas-town.prose):

```
block create_convoy(convoy_name, initial_beads):
  session "Create convoy: {convoy_name}"
    prompt: """
1. Generate convoy ID (timestamp + random)
2. Create .prose/gas-town/convoys/{convoy_id}.json:
   - name: {convoy_name}
   - status: "active"
   - beads: {initial_beads}
   - created: now()
3. Return convoy ID
"""

block land_convoy(convoy_id):
  session "Land convoy {convoy_id}"
    prompt: """
1. Update .prose/gas-town/convoys/{convoy_id}.json:
   - status: "landed"
   - landed_at: now()
2. Notify Mayor that convoy has landed
3. Archive convoy to .prose/gas-town/convoys/archive/
"""
```

**Convoy Lifecycle**:

1. Create → Wrap beads into trackable unit
2. Active → Work in progress (multiple swarms can attack)
3. Landing → All beads complete, MRs merged
4. Archived → Stored for reference

**Convoy Tracking** (from swarm workflow):

```
loop until **all convoy beads are complete or blocked**
  # Check convoy status
  let convoy_status = resume: mayor

Check convoy {convoy_name} status:
- Read .prose/gas-town/convoys/{convoy_name}.json
- Report progress to activity feed
- Handle blocked beads
```

### Nezha Equivalence

| Aspect    | OpenClaw                           | Nezha                         |
| --------- | ---------------------------------- | ----------------------------- |
| Work unit | BEADS (Git-backed issues)          | Tasks (DB)                    |
| Grouping  | Convoys (chains of beads)          | Task dependencies             |
| Status    | create → active → landed → archive | PENDING → RUNNING → COMPLETED |
| Tracking  | Read convoy JSON                   | Query tasks table             |

**Current Nezha Pattern**:

```sql
-- Tasks with dependencies
INSERT INTO tasks (title, depends_on)
VALUES ('Implement feature X', NULL);

INSERT INTO tasks (title, depends_on)
VALUES ('Write tests for X', (SELECT id FROM tasks WHERE title='Implement feature X'));
```

### Assessment

Nezha already has equivalent functionality via:

- `depends_on` column for task chains
- `status` for lifecycle tracking
- `priority` for ordering
- Archive via completed_tasks or history table

**Convoy concept could enhance**:

- Visual tracking of multi-task work units
- Progress reporting
- Cross-agent coordination

---

## 4. Key Implementation Patterns

### Pattern 1: Filesystem as Database

OpenClaw uses Git-tracked JSON files:

- `.prose/gas-town/hooks/{worker}.json` - Work queue
- `.prose/gas-town/mail/{worker}.json` - Inbox
- `.prose/gas-town/convoys/{id}.json` - Work orders

**Advantages**:

- Version control for free
- Git-based backup/replication
- Simple to understand

**Disadvantages**:

- No atomic transactions
- No queries (must read and filter)
- Concurrent access issues (race conditions)

### Pattern 2: GUPP - Self-Propelling Work

> "If there is work on your hook, YOU MUST RUN IT. Physics over politeness."

Workers check hooks on:

- Startup
- After completing previous work
- When nudged by another worker

### Pattern 3: Activity Feed

Append-only log for live dashboard:

```
block log_activity(worker_name, activity_type, details):
  # Append to .prose/gas-town/activity-feed.jsonl
```

---

## 5. Recommendations for Nezha

### Already Have (No Change Needed)

| Feature | Current Implementation         | Assessment           |
| ------- | ------------------------------ | -------------------- |
| Hooks   | HeartbeatService + tasks table | Better than OpenClaw |
| Convoys | Task dependencies + status     | Equivalent           |
| Patrols | HeartbeatService loops         | Equivalent           |

### Can Improve (Optional)

| Feature           | Current           | Suggested              | Priority |
| ----------------- | ----------------- | ---------------------- | -------- |
| Mail/Inbox        | Tasks with prefix | notifications table    | Medium   |
| Activity Feed     | Database queries  | Add activity_log table | Low      |
| Progress Tracking | Task status       | Add convoy grouping    | Low      |

### Suggested Implementation: notifications Table

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  recipient VARCHAR(255) NOT NULL,
  sender VARCHAR(255),
  subject VARCHAR(500),
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_notifications_recipient_unread
ON notifications(recipient, read) WHERE read = FALSE;
```

This provides:

- Direct inbox per agent
- Read/unread tracking
- Optional TTL via expires_at
- Queryable with SQL

---

## 6. Conclusion

**Nezha's architecture is fundamentally equivalent to OpenClaw's automation system**, with the key difference being **PostgreSQL vs Git-backed files**.

| OpenClaw     | Nezha             | Advantage                        |
| ------------ | ----------------- | -------------------------------- |
| Git + JSON   | PostgreSQL        | Transactions, queries, relations |
| GUPP hooks   | Heartbeat polling | More control, priority queues    |
| File inboxes | Task prefixes     | Unified task/notif system        |
| Convoys      | Dependencies      | Standard SQL approach            |

**Main Gap**: Activity feed / live dashboard can be enhanced via HealthServer.

**Recommendation**: Keep current architecture, add notifications table if direct messaging becomes a bottleneck.

---

## References

- OpenClaw Gas Town: `/Users/jk/gits/hub/openclaw/extensions/open-prose/skills/prose/examples/28-gas-town.prose`
- Hooks: `.prose/gas-town/hooks/` directory
- Mail: `.prose/gas-town/mail/` directory
- Convoys: `.prose/gas-town/convoys/` directory
