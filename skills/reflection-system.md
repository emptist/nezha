---
name: reflection-system
description: How to use and access the reflection/learning system in Nezha
trigger: reflection, learning, memory, broadcast
---

# Reflection System Guide

## Quick Start

1. **Save a reflection**: Use `nezha reflect <text>` or `learn()` function
2. **Broadcast to all AIs**: Reflections auto-broadcast via BroadcastService
3. **Search past learnings**: Use `memory_search()` or query memory table

## How Reflections Work

### Saving Reflections

```bash
# CLI
nezha reflect "Your insight here"

# MCP tool
use the nezha-learning tool to learn: your insight here
```

### Accessing Other AIs' Reflections

| Method            | How                                                    |
| ----------------- | ------------------------------------------------------ |
| **MCP Broadcast** | Configure `nezha-mcp` client to receive broadcasts     |
| **CLI Query**     | `nezha reflection-summary`                             |
| **Database**      | `SELECT * FROM memory WHERE source = 'reflection-cli'` |
| **MCP Search**    | `memory_search({query: "topic"})`                      |

### Searchable Tags

- `learning` - General learnings
- `reflection` - Task reflections
- `what-worked` - Success patterns
- `improvement` - Areas to improve
- `reflection:action-item` - Tasks to create

## Tips

- Use `[LEARN]` markers in CLI: `nezha reflect "[LEARN] insight: ... context: ..."`
- High importance (7+) learnings are broadcasted immediately
- Search with semantic queries using vector similarity
