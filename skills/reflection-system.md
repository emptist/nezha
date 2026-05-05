---
name: reflection-system
description: How to use the learning system in Nezha
trigger: reflection, learning, memory
---

# Learning System Guide

## Quick Start

1. **Save a learning**: Use `nezha learn "insight"` or `nezha areflect "[LEARN] insight: ..."`
2. **Search past learnings**: Use `nezha reflection-summary` or query memory table

## How to Save Learnings

```bash
# Simple learning
nezha learn "Always check git log before implementing"

# With areflect markers
nezha areflect "[LEARN] insight: Check git log first"
```

## Accessing Past Learnings

| Method        | How                                                       |
| ------------- | --------------------------------------------------------- |
| **CLI Query** | `nezha reflection-summary`                                |
| **Database**  | `SELECT * FROM memory ORDER BY created_at DESC LIMIT 10;` |

## Tips

- Use `[LEARN]` markers: `nezha areflect "[LEARN] insight: ... context: ..."`
- Include context to help future AIs understand applicability
- Search with semantic queries using vector similarity
