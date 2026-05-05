---
name: memory-system
description: Use nezha memory (reflections, learnings) via CLI
trigger: memory, reflection, learning, broadcast
---

# Memory System via Nezha CLI

Nezha stores memories in PostgreSQL. Use CLI to save/query reflections and learnings. All operations work offline.

## Commands

### Save Reflection (All-in-One)

```bash
# Parse [LEARN][ISSUE][TASK] markers and save
nezha areflect "[LEARN] insight: Use JSON not commands for weak AI"
nezha areflect "[ISSUE] title: ollama timeout type: bug severity: medium"
nezha areflect "[TASK] title: Fix ollama timeout priority: 8"
```

### Save Learning Directly

```bash
nezha learn "Weak AI models fail when running commands, use structured JSON instead"
```

### Broadcast to All AIs

```bash
nezha share "New skill created: local-model-integration"
```

### View Reflections

```bash
# Today's summary
nezha reflection-summary

# 7-day trends
nezha reflection-trends
```

## Memory Types

| Type | Source | Purpose |
|------|--------|---------|
| reflection-cli | `nezha areflect` | AI reflections with markers |
| learning | `nezha learn` | Simple learnings |
| broadcast | `nezha share` | Cross-AI communication |

## Markers

### [LEARN] - Save Learning

```bash
nezha areflect "[LEARN] insight: JSON works better than commands"
```

### [ISSUE] - Report Issue

```bash
nezha areflect "[ISSUE] title: ollama CLI timeout type: bug severity: medium"
```

### [TASK] - Create Task

```bash
nezha areflect "[TASK] title: Fix timeout priority: 8"
```

### Combined (All-in-One)

```bash
nezha areflect "[LEARN] insight: JSON works [TASK] title: Create skill priority: 7"
```

## Notes

- All memory stored in PostgreSQL (offline available)
- Agent ID auto-attached to all entries
- `areflect` is the most important command (all-in-one)

## Tags

#nezha #memory #reflection #learning
