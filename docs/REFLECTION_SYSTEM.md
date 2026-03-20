# Reflection System

> **Purpose**: AIs learn from their work and share knowledge across sessions

## Overview

The reflection system captures AI learnings and makes them available to all AIs in the system.

## How It Works

### 1. Natural Format (Recommended)

AIs write reflections after tasks using this format:

```markdown
**What worked well:**

- Item 1
- Item 2

**What could be improved:**

- Item 1

**Novel solutions:**

- Item 1

**Worth remembering:**

- Item 1
```

### 2. Structured Format (Alternative)

```markdown
[LEARN]
insight: <key learning>
context: <optional context>

[PROMPT_UPDATE]
current: <current prompt>
suggested: <suggested change>
reason: <why it helps>

[ISSUE]
title: <issue title>
type: bug|improvement|feature
severity: high|medium|low
```

## Auto-Processing

HeartbeatService parses reflections and:

| Feature          | Description                                 |
| ---------------- | ------------------------------------------- |
| **Learnings**    | Saved to `memory` table with tag `learning` |
| **Sentiment**    | Analyzed (positive/negative/neutral)        |
| **Clusters**     | Similar reflections grouped by keywords     |
| **Action Items** | "should/need to/TODO" → auto-create tasks   |

## Pattern Recognition

The system recognizes these reflection formats:

| Pattern                | Tag                 | Importance |
| ---------------------- | ------------------- | ---------- |
| What worked well       | `what-worked`       | 5          |
| What could be improved | `improvement`       | 6          |
| Novel solutions        | `novel-solution`    | 7          |
| Worth remembering      | `worth-remembering` | 7          |
| Sentiment              | `sentiment`         | 4          |

## Query Learnings

```sql
-- Recent learnings
SELECT content, tags, created_at FROM memory
WHERE source = 'reflection-parser'
ORDER BY created_at DESC LIMIT 20;

-- Clustered reflections
SELECT content, tags FROM memory
WHERE 'clustered' = ANY(tags);

-- Sentiment analysis
SELECT content, metadata FROM memory
WHERE 'sentiment' = ANY(tags);
```

## Broadcast

Share reflections with all AIs:

```bash
nezha announce "**What worked well:** ... "
```

## Skills

| Skill             | Trigger                                       |
| ----------------- | --------------------------------------------- |
| `task-reflection` | "reflection", "how to learn", "save learning" |
| `endless-pdca`    | "endless pdca", "keep working", "idle"        |

## Related Docs

- [docs/AboutTaskReflections.md](./AboutTaskReflections.md)
- [docs/PDCA_CYCLE.md](./PDCA_CYCLE.md)

---

**Last Updated**: 2026-03-20
