# AI Collaboration Examples

> **This directory contains example patterns for multi-agent collaboration.**
> These are DOCUMENTATION examples showing the patterns.
> In actual use, the `task()` function is provided by the execution environment.

## Patterns Overview

| Pattern                | When to Use             | Agents |
| ---------------------- | ----------------------- | ------ |
| Parallel Review        | Multiple angles at once | 3-5    |
| Sequential Handoff     | Dependent steps         | 2-N    |
| Review Loop            | Quality critical        | 2-4    |
| Divide & Conquer       | Large tasks             | 4+     |
| Continuous Improvement | Ongoing optimization    | 1      |
| Multi-Reviewer         | Important decisions     | 3-5    |

## Quick Reference

### Spawning Multiple Agents

```typescript
// Parallel - use when tasks are independent
const [a, b, c] = await Promise.all([
  task({ description: 'Task A', prompt: '...', subagent_type: 'general' }),
  task({ description: 'Task B', prompt: '...', subagent_type: 'general' }),
  task({ description: 'Task C', prompt: '...', subagent_type: 'general' }),
]);

// Sequential - use when tasks depend on previous results
const research = await task({ description: 'Research', prompt: '...', subagent_type: 'explore' });
const impl = await task({
  description: 'Implement',
  prompt: `Based on: ${research}`,
  subagent_type: 'general',
});
```

### Error Handling

```typescript
// Retry pattern
for (let i = 0; i < maxRetries; i++) {
  try {
    return await task({ ... });
  } catch (e) {
    if (i === maxRetries - 1) throw e;
  }
}

// Fallback pattern
try {
  return await task({ ... }); // Primary approach
} catch {
  return await task({ ... }); // Fallback approach
}
```

## See Also

- [AI_COLLABORATION_GUIDE.md](../AI_COLLABORATION_GUIDE.md) - Full guide
- [AI_COLLABORATION_TUTORIAL.md](../AI_COLLABORATION_TUTORIAL.md) - Step-by-step tutorial
