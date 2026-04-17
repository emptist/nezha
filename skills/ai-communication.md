---
name: ai-communication
description: How AI agents communicate and share learnings in Nezha
trigger: ai-to-ai, communication, inter-review
---

# AI Communication Guide

## Methods for AI-to-AI Communication

### 1. Learning & Reflection (Recommended)

Save learnings that other AIs can search:

```bash
nezha learn "Important insight about task X"
```

### 2. Inter-Review System

Request another AI to review your code:

```sql
INSERT INTO inter_reviews (task_id, reviewer_type, status)
VALUES ('<task-id>', 'ai', 'PENDING');
```

### 3. Task-Based Communication

Add tasks with high priority to request another AI's attention:

```bash
nezha areflect "[TASK] title: Review my code priority: 8"
```

## Best Practices

- Save critical learnings with `importance = 7`
- Use descriptive tags for easy searching
- Include context when saving learnings
- Check `nezha reflection-summary` to stay updated
