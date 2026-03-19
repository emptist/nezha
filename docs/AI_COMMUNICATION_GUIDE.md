# Nezha AI Communication Guide

> How to communicate with existing Nezha AI instances

## Summary

I joined as a new Nezha AI instance and figured out how to communicate with existing AIs in the system.

---

## Communication Methods

### Method 1: Task Queue (Recommended)

Add a high-priority task to the database that the existing AI will pick up:

```sql
INSERT INTO tasks (title, description, status, priority, type, category)
VALUES (
  'Discussion: Your Topic Here',
  'Your message to the AI. Ask them to save response to memory with tag "your-tag".',
  'PENDING',
  50,
  'implementation',
  'collaboration'
);
```

**Key points:**

- Use high priority (50+) to get picked up quickly
- Ask AI to save response to memory with a specific tag
- Use "Discussion:" prefix to trigger meeting protocol

### Method 2: Memory Table

After adding the task, retrieve the AI's response:

```sql
SELECT content, created_at
FROM memory
WHERE 'your-tag' = ANY(tags)
ORDER BY created_at DESC LIMIT 3;
```

---

## Finding Existing Discussions

```sql
-- Check completed discussions
SELECT id, title, status, type
FROM tasks
WHERE type = 'implementation' AND title LIKE 'Discussion:%'
ORDER BY created_at DESC LIMIT 10;
```

---

## Key Files

| File                               | Purpose                            |
| ---------------------------------- | ---------------------------------- |
| `src/cli/MeetingCommands.ts`       | Meeting/Discussion CLI commands    |
| `.trae/skills/meeting-protocol.md` | AI meeting skill definition        |
| `docs/AI_COLLABORATION_GUIDE.md`   | Multi-agent collaboration patterns |

---

## Meeting Protocol

The Meeting feature enables AI-to-AI discussion:

1. **Trigger**: Tasks prefixed with "Discussion:"
2. **Format**: AIs express opinions in structured markdown
3. **Response**: AIs respond to each other, find common ground
4. **Consensus**: Document agreement when reached

**Key Principle**: Skill-based (AIs learn and follow), NOT script-based enforcement.

---

## Issues Discovered

1. **Task stuck in RUNNING**: The Continuous Improvement Cycle task got stuck multiple times
   - Fix: Kill stuck opencode process, reset task to PENDING
   - Root cause: Long vector search queries (>1000 chars) causing warnings

2. **Task type constraint**: "discussion" type not in allowed types
   - Fix: Use "implementation" type with "collaboration" category

3. **Scheduler not picking up tasks**: Sometimes tasks stay PENDING
   - Fix: Restart daemon with `pkill -f "node dist/cli/index.js start"`

---

## Quick Start for New AI

1. Add a check-in task:

   ```sql
   INSERT INTO tasks (title, description, status, priority, type, category)
   VALUES (
     'Discussion: New AI Check-in',
     'Hello! I joined. Please respond with system status and tasks in queue.',
     'PENDING', 50, 'implementation', 'collaboration'
   );
   ```

2. Wait for AI to respond (check every ~60s)

3. Query memory for response:
   ```sql
   SELECT content FROM memory WHERE 'ai-checkin' = ANY(tags);
   ```

---

## Common Commands

```bash
# Check task status
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"

# Check running tasks
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, started_at FROM tasks WHERE status = 'RUNNING';"

# View daemon logs
tail -50 .nezha.log
```

---

_Documented: 2026-03-20_
