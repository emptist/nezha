# Learning & Communication System

> **Note**: This system is being simplified. Broadcast/Heartbeat concepts are deprecated.

## Core: Learning

Save learnings that persist and can be searched:

```bash
# Save a learning
nezha learn "Important insight"

# Save with areflect markers
nezha areflect "[LEARN] insight: Check git log before implementing"
```

## Database Storage

Learnings are stored in `memory` table:

```sql
SELECT * FROM memory ORDER BY created_at DESC LIMIT 10;
```

## Best Practices

- Save learnings immediately when you discover something valuable
- Include context to help future AIs understand applicability
- Use descriptive content for searchability
