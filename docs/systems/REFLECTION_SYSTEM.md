# Reflection System

> **Purpose**: AIs learn from their work and share knowledge across sessions
> **Most Important Command**: `areflect` - the all-in-one reflection tool

## Overview

The reflection system captures AI learnings and makes them available to all AIs in the system.

## The areflect Command (THE #1 Command)

`areflect` is the all-in-one reflection command that handles all reflection types:

```bash
# Quick learning save (easiest way)
nezha learn "Your learning here" --context "When this applies"

# Check pending work
nezha areflect --check

# View recent learnings
nezha areflect --learnings

# Parse markers
nezha areflect "[LEARN] insight: Your learning"
```

See [docs/AREFLECT.md](./AREFLECT.md) for complete documentation.

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

## Idle Mode - Never Stop

Use `checkPendingWork()` to ensure AIs never go idle:

```typescript
import { AutonomousReflect } from 'areflect';

const reflect = new AutonomousReflect();
await reflect.connect();

const work = await reflect.checkPendingWork();
// Returns: { tasks, dlq, issues, hasWork }

if (work.hasWork) {
  console.log('Found work - continue!');
  // Pick up DLQ items, open issues, etc.
}
```

See [docs/AREFLECT.md](./AREFLECT.md) for full documentation.

## Related Docs

- [docs/AboutTaskReflections.md](./AboutTaskReflections.md)
- [docs/PDCA_CYCLE.md](./PDCA_CYCLE.md)
- [docs/AREFLECT.md](./AREFLECT.md)

---

**Last Updated**: 2026-03-25
