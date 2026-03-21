# OpenClaw Automation Features - Consolidated Research Report

**Date:** 2026-03-22
**Research Status:** Complete
**Source:** `/Users/jk/gits/hub/opencode` (OpenClaw codebase)

---

## Executive Summary

OpenClaw implements automation through **3 core systems**:

1. **Plugin-based Hooks** - Event-driven extensibility
2. **Global Bus/Event System** - Cross-instance communication
3. **Session-based Workflows** - Task chaining and sub-agents

**Key Finding:** OpenClaw does NOT have dedicated "mail" or "convoy" systems. These are achieved through:

- **Mail** → Session communication + ACP protocol + Bus
- **Convoys** → Nested sessions + Skills + task dependencies

**Nezha Assessment:** Nezha's PostgreSQL-based approach is **fundamentally equivalent or superior** for most use cases.

---

## 1. Hooks System

### OpenClaw Implementation

**Location:** `packages/opencode/src/plugin/index.ts`, `packages/plugin/src/index.ts`

**Architecture:** Plugin-based with typed hook interfaces:

```typescript
interface Plugin {
  name: string;
  init: (input: PluginInput) => Promise<Hooks>;
}

interface Hooks {
  event?: (input: { event: Event }) => Promise<void>;
  config?: (input: Config) => Promise<void>;
  tool?: { [key: string]: ToolDefinition };
  auth?: AuthHook;
  'chat.message'?: (input, output) => Promise<void>;
  'chat.params'?: (input, output) => Promise<void>;
  'permission.ask'?: (input, output) => Promise<void>;
  'command.execute.before'?: (input, output) => Promise<void>;
  'tool.execute.before'?: (input, output) => Promise<void>;
  'tool.execute.after'?: (input, output) => Promise<void>;
  'experimental.chat.messages.transform'?: (input, output) => Promise<void>;
  'experimental.session.compacting'?: (input, output) => Promise<void>;
}
```

### Built-in Plugins

| Plugin            | Purpose                  |
| ----------------- | ------------------------ |
| CodexAuthPlugin   | OpenAI authentication    |
| CopilotAuthPlugin | Microsoft authentication |
| GitlabAuthPlugin  | GitLab authentication    |

### Experimental Config Hooks

```json
{
  "experimental": {
    "hook": {
      "file_edited": {
        "pattern-match": [
          {
            "command": ["npm", "run", "lint"],
            "environment": { "FILE": "{file}" }
          }
        ]
      },
      "session_completed": [
        {
          "command": ["notify-send", "OpenCode", "Session done"],
          "environment": { "RESULT": "{result}" }
        }
      ]
    }
  }
}
```

---

## 2. Mail System (Inter-Agent Communication)

### OpenClaw Does NOT Have Dedicated Mail

Instead, communication is achieved through:

### A. Session-Based Communication (Task Tool)

**File:** `packages/opencode/src/tool/task.ts`

```typescript
const TaskTool = Tool.define("task", async (ctx) => {
  const session = await Session.create({
    parentID: ctx.sessionID,
    title: params.description + ` (@${agent.name} subagent)`,
  })
  const result = await SessionPrompt.prompt({
    sessionID: session.id,
    model: {...},
    agent: agent.name,
    parts: promptParts,
  })
})
```

### B. Global Bus/Broadcast System

**File:** `packages/opencode/src/bus/index.ts`

```typescript
export const GlobalBus = new EventEmitter<{
  event: [{ directory?: string; payload: any }];
}>();

export namespace Bus {
  export async function publish(def, properties) {
    for (const sub of [...(state().subscriptions.get(key) ?? [])]) {
      pending.push(sub(payload));
    }
    GlobalBus.emit('event', { directory, payload });
  }
  export function subscribe(def, callback) {
    return raw(def.type, callback);
  }
}
```

### C. ACP (Agent Communication Protocol)

**File:** `packages/opencode/src/acp/agent.ts`

Handles external agent connections with event types:

- `permission.asked`
- `message.part.updated`
- `message.part.delta`

---

## 3. Convoys (Workflow Chains)

### OpenClaw Does NOT Have Dedicated Convoys

Workflows use:

### A. Session-Based Task Chains

```typescript
const session = await Session.create({
  parentID: ctx.sessionID, // Links to parent session
  title: params.description,
});
```

### B. Plan Workflow

**File:** `packages/opencode/src/session/prompt.ts`

Phases: Explore → Plan → Implement

### C. Skills System

Skills are YAML-frontmatter markdown files for workflow templates:

```markdown
---
name: git-release
description: Create consistent releases and changelogs
---

## What I do

- Draft release notes from merged PRs
- Propose a version bump
- Provide copy-pasteable `gh release create` command
```

### D. Gas Town Convoys (Different System)

In Gas Town (OpenProse-based multi-agent), convoys are work-order units:

```
block create_convoy(convoy_name, initial_beads):
  session "Create convoy: {convoy_name}"
  # Generate convoy ID, create JSON file, track status
```

**Convoy Lifecycle:** create → active → landed → archived

---

## 4. Gas Town Multi-Agent System

### Overview

Gas Town is "Kubernetes for agents" with 7 predefined worker roles:

| Role     | Model  | Purpose                             |
| -------- | ------ | ----------------------------------- |
| Mayor    | sonnet | Concierge, receives user requests   |
| Polecats | sonnet | Ephemeral workers, swarm on work    |
| Refinery | sonnet | Merge queue processor               |
| Witness  | sonnet | Swarm health monitor                |
| Deacon   | sonnet | Daemon beacon, propagates heartbeat |
| Dogs     | sonnet | Maintenance crew                    |
| Crew     | opus   | Long-lived coding agents            |

### Key Concepts

**GUPP (Gas Town Universal Propulsion Principle):**

> "If there is work on your hook, YOU MUST RUN IT. Physics over politeness."

**NDI (Nondeterministic Idempotence):**

- Agent is persistent (Bead in Git)
- Hook is persistent (Bead in Git)
- Path is nondeterministic but outcome is guaranteed
- Crashes don't matter - new session picks up where left off

### Communication Mechanisms

| Mechanism     | Description                  |
| ------------- | ---------------------------- |
| Hooks         | Work queue for each worker   |
| Mail          | Message inbox (files in Git) |
| Convoys       | Work-order tracking          |
| Patrols       | Ephemeral workflows in loops |
| Activity Feed | Live status dashboard        |

---

## 5. Feature Comparison

| Feature    | OpenClaw Implementation            | Nezha Status                  |
| ---------- | ---------------------------------- | ----------------------------- |
| Hooks      | Plugin system with 15+ event types | PluginManager ✓               |
| Bus/Events | Global event bus                   | Via PostgreSQL pub/sub        |
| Mail       | Session + ACP protocol             | Tasks with Discussion: prefix |
| Convoys    | Session chains + Skills            | Task dependencies ✓           |
| Sub-Agents | sessions_spawn tool                | Via opencode CLI ✓            |
| Skills     | SKILL.md with YAML frontmatter     | Partially implemented         |
| Cron       | croner library                     | Scheduler ✓                   |
| Webhooks   | /hooks/\* HTTP endpoints           | WebhookServer ✓               |

---

## 6. Recommendations for Nezha

### Already Equivalent (No Change Needed)

| Feature    | Current Implementation         | Assessment           |
| ---------- | ------------------------------ | -------------------- |
| Hooks      | HeartbeatService + tasks table | Better than OpenClaw |
| Convoys    | Task dependencies + status     | Equivalent           |
| Patrols    | HeartbeatService loops         | Equivalent           |
| Scheduling | PostgreSQL queries             | More flexible        |

### Can Improve (Optional)

| Feature           | Current           | Suggested              | Priority |
| ----------------- | ----------------- | ---------------------- | -------- |
| Mail/Inbox        | Tasks with prefix | notifications table    | Medium   |
| Activity Feed     | DB queries        | Add activity_log table | Low      |
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

### Skills System Enhancement

Current status: Partially implemented. Suggested improvements:

1. Add YAML frontmatter validation (SKILL.md format)
2. Add remote skill discovery (fetch from URLs)
3. Add skill permission system
4. Add skill versioning

---

## 7. Key Files Reference

| Feature   | Main File                                                       | Supporting Files                        |
| --------- | --------------------------------------------------------------- | --------------------------------------- |
| Hooks     | `src/plugin/index.ts`                                           | `plugin/codex.ts`, `plugin/copilot.ts`  |
| Bus       | `src/bus/index.ts`                                              | `cli/cmd/tui/event.ts`                  |
| Tasks     | `src/tool/task.ts`                                              | `session/index.ts`                      |
| Skills    | `src/skill/service.ts`                                          | `skill/loader.ts`, `skill/discovery.ts` |
| ACP       | `src/acp/agent.ts`                                              | `acp/sdk.ts`                            |
| Questions | `src/question/service.ts`                                       | -                                       |
| Gas Town  | `extensions/open-prose/skills/prose/examples/28-gas-town.prose` | -                                       |

---

## 8. Conclusion

**Nezha's PostgreSQL-based architecture is fundamentally equivalent or superior to OpenClaw's Git-backed approach.**

| Aspect      | OpenClaw      | Nezha             | Advantage                        |
| ----------- | ------------- | ----------------- | -------------------------------- |
| Persistence | Git + JSON    | PostgreSQL        | Transactions, queries, relations |
| Hooks       | GUPP hooks    | Heartbeat polling | More control, priority queues    |
| Mail        | File inboxes  | Task prefixes     | Unified task/notif system        |
| Convoys     | JSON tracking | Dependencies      | Standard SQL approach            |

**Main Gap:** Activity feed / live dashboard can be enhanced via HealthServer.

**Recommendation:** Keep current architecture. Add notifications table only if direct messaging becomes a bottleneck.

---

## References

- OpenClaw Codebase: `/Users/jk/gits/hub/opencode`
- Plugin System: `packages/opencode/src/plugin/index.ts`
- Skill System: `packages/opencode/src/skill/service.ts`
- Bus/Events: `packages/opencode/src/bus/index.ts`
- Gas Town: `extensions/open-prose/skills/prose/examples/28-gas-town.prose`
