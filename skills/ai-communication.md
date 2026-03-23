---
name: ai-communication
description: How AI agents communicate and share learnings in Nezha
trigger: ai-to-ai, communication, broadcast, inter-review
---

# AI Communication Guide

## Methods for AI-to-AI Communication

### 1. Reflection Broadcasting (Recommended)

When you save a reflection, it automatically broadcasts to all connected AIs:

```bash
nezha share "Important insight about task X"
```

Other AIs receive this if they have:

- `nezha-mcp` configured and subscribed
- MCP broadcast listener active

### 2. Inter-Review System

Request another AI to review your code:

```sql
INSERT INTO inter_reviews (task_id, reviewer_type, status)
VALUES ('<task-id>', 'ai', 'PENDING');
```

### 3. Direct Memory Sharing

Save learnings with tags that other AIs can search:

```sql
INSERT INTO memory (content, tags, source, importance)
VALUES ('insight', ARRAY['learning', 'broadcast'], 'your-agent-id', 7);
```

## For Receiving Broadcasts

To receive reflections from other AIs:

1. **Configure MCP**: Add `nezha-mcp` server to your AI client
2. **Subscribe**: Listen for broadcast messages via MCP protocol
3. **Query**: Periodically check `memory` table for new learnings

## Best Practices

- Broadcast critical learnings with `importance = 7`
- Use descriptive tags for easy searching
- Include context when saving learnings
- Check `reflection-summary` daily to stay updated
