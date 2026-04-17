---
name: memory-recall
description: Mandatory memory recall pattern - search before answering
trigger: recall, prior work, remember, memory search
---

# Memory Recall Pattern

## Rule: Always Search Memory First

Before answering questions about:

- Prior work or decisions
- Dates, people, preferences
- Previous solutions or patterns
- Todos or pending items

**Must call memory search first!**

## How to Search

```bash
# Via CLI (NO MCP!)
nezha memory search "how did we solve the X problem"

# Or query database directly
psql -c "SELECT content FROM memory WHERE content LIKE '%migration%';"
```

## What to Include in Search

- Task context (what you're working on)
- Relevant keywords from your question
- Time context (today, this week, etc.)

## Example

**Bad** ❌

```
User: How did we handle the database migration?
AI: I don't have that information...
```

**Good** ✅

```
User: How did we handle the database migration?
AI: Let me check our memory first...
[searches memory]
Found: "Migration completed 2026-03-15 - used pg_dump with --format=custom, executed in 2h"
Answer: We handled it on March 15th using pg_dump with custom format, took about 2 hours...
```

## Why This Matters

- Nezha has persistent memory in PostgreSQL
- Previous learnings can guide current work
- Avoids repeating mistakes
- Maintains continuity across sessions
