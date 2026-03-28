# AI Collaboration - Complete Guide

> How multiple AI agents collaborate through Nezha

**Last Updated**: 2026-03-29

---

## Part 1: Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEZHA COLLABORATION HUB                       │
│                                                                  │
│  ┌───────────────┐              ┌───────────────┐               │
│  │    AI #1      │              │    AI #2      │               │
│  │  (Any Editor) │              │  (Any Editor) │               │
│  │               │              │               │               │
│  │ - Review      │              │ - Execute     │               │
│  │ - Plan        │              │ - Report      │               │
│  │ - Delegate    │◄────────────►│ - Follow-up   │               │
│  │ - Verify      │              │ - Discuss     │               │
│  └───────┬───────┘              └───────┬───────┘               │
│          │                              │                        │
│          ▼                              ▼                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Task Queue                       │   │
│  │                                                          │   │
│  │  Tasks: PENDING → RUNNING → COMPLETED                    │   │
│  │  Discussions: Prefix with "Discussion:"                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Roles (Flexible, Not Hardcoded)

| Role | Responsibilities | Can Be Filled By |
|------|-----------------|------------------|
| **Reviewer** | Review codebase, plan improvements, create tasks, verify results | Any AI |
| **Executor** | Execute tasks, report results, create follow-up tasks | Any AI |
| **Moderator** | Facilitate discussions, summarize points, drive consensus | Any AI |

**Note**: Roles are not fixed to specific AI implementations. Any AI can take any role depending on context.

### Skill Separation Policy

| Storage | Format | Used By |
|---------|--------|---------|
| `.trae/skills/` | Markdown files | Trae-compatible AIs |
| PostgreSQL `skills` table | Database records | OpenCode-compatible AIs |

**Copy Direction**: Nezha → Trae only (one-way)

---

## Part 2: Quick Start

### Basic Pattern - Spawning Agents

```typescript
import { task } from 'your-task-tool';

async function collaborate() {
  const results = await Promise.all([
    task({
      description: 'Fix bug in authentication',
      prompt: 'Find and fix the authentication bug in src/auth/',
      subagent_type: 'general',
    }),
    task({
      description: 'Add tests for auth',
      prompt: 'Add unit tests for src/auth/*.ts',
      subagent_type: 'general',
    }),
  ]);
}
```

### Agent Types

| Type | Use For | Example |
|------|---------|---------|
| `explore` | Fast research, finding files, searching code | "Find all auth files" |
| `general` | Full implementation, writing code, complex tasks | "Implement auth system" |

---

## Part 3: Collaboration Patterns

### Pattern 1: Parallel Work

```typescript
const [frontend, backend, tests] = await Promise.all([
  task({ description: 'Frontend', prompt: 'Implement UI', subagent_type: 'general' }),
  task({ description: 'Backend', prompt: 'Implement API', subagent_type: 'general' }),
  task({ description: 'Tests', prompt: 'Write tests', subagent_type: 'general' }),
]);
```

### Pattern 2: Pipeline - Sequential Handoff

```typescript
const research = await task({
  description: 'Research',
  prompt: 'Research authentication patterns',
  subagent_type: 'explore',
});

const implementation = await task({
  description: 'Implement',
  prompt: `Based on research: ${research}\nImplement the best approach.`,
  subagent_type: 'general',
});
```

### Pattern 3: Review Loop

```typescript
const implementation = await task({
  description: 'Implement',
  prompt: 'Implement feature X',
  subagent_type: 'general',
});

const [review1, review2] = await Promise.all([
  task({ description: 'Bug review', prompt: 'Review for bugs', subagent_type: 'general' }),
  task({ description: 'Security review', prompt: 'Review for security', subagent_type: 'general' }),
]);

const fixes = await task({
  description: 'Fix issues',
  prompt: `Fix: ${review1}\n${review2}`,
  subagent_type: 'general',
});
```

### Pattern 4: Divide and Conquer

```typescript
const workPlan = await task({
  description: 'Plan',
  prompt: 'Break feature into 5 independent tasks',
  subagent_type: 'explore',
});

const tasks = JSON.parse(workPlan);
const results = await Promise.all(
  tasks.map(t => task({ description: t.name, prompt: t.description, subagent_type: 'general' }))
);
```

### Pattern 5: Continuous Improvement Loop

```typescript
async function continuousImprovement() {
  while (true) {
    const improvement = await task({
      description: 'Find improvement',
      prompt: 'Find one thing to improve. High-impact, low-risk.',
      subagent_type: 'explore',
    });

    if (!improvement) break;

    const implementation = await task({
      description: 'Implement',
      prompt: `Implement: ${improvement}\nRun tests after.`,
      subagent_type: 'general',
    });

    const verified = await task({
      description: 'Verify',
      prompt: `Verify: ${implementation}\nRun: npm test`,
      subagent_type: 'general',
    });

    if (verified.includes('PASS')) {
      await git.commit(`improvement: ${improvement}`);
    }
  }
}
```

---

## Part 4: Communication Protocol

### Task Delegation

```bash
node dist/cli/index.js task-add "Task Title" "Description" <priority>
```

### Discussion Tasks

```bash
node dist/cli/index.js task-add "Discussion: Topic" "Question for other AIs" <priority>
```

### Task Format

```
**From**: [AI Name/ID]
**To**: [AI Name/ID | All]
**Context**: Background information
**Question/Action**: What needs discussion or action
**Priority**: 1-10
```

### Agent Communication Methods

| Method | Use Case |
|--------|----------|
| Return Values | Pass data between sequential agents |
| Shared Files | Agents read/write same files |
| Task Queue | Database-backed, multiple agents pick up tasks |

---

## Part 5: Best Practices

### DO ✅

1. **Give Clear, Specific Prompts**
   ```typescript
   // Good
   prompt: "Fix the race condition in src/database/ConnectionPool.ts line 42-45."
   ```

2. **Specify File Paths Explicitly**
   ```typescript
   prompt: 'In file src/services/AuthService.ts, add method validateToken()';
   ```

3. **Define Success Criteria**
   ```typescript
   prompt: "Add tests that achieve 80% code coverage. Run: npm test && npm run coverage"
   ```

4. **Chain Verification**
   ```typescript
   prompt: "After implementing, run: npm run build && npm test && npm run lint"
   ```

5. **Use Parallel for Independent Tasks**

### DON'T ❌

1. **Don't Be Vague**: `prompt: 'Make it better'` ❌
2. **Don't Overload Single Agent**: Break into parts
3. **Don't Skip Verification**: Always run tests
4. **Don't Ignore Failures**: Handle errors

---

## Part 6: Error Handling

### Retry Pattern

```typescript
async function withRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await task({ prompt });
      if (result.success) return result;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
    }
  }
}
```

### Fallback Pattern

```typescript
async function withFallback(primary, fallback) {
  try {
    return await task({ prompt: primary });
  } catch {
    return await task({ prompt: fallback });
  }
}
```

### Circuit Breaker

```typescript
class AgentCircuitBreaker {
  private failures = 0;
  private readonly threshold = 5;

  async execute(prompt) {
    if (this.failures >= this.threshold) throw new Error('Circuit breaker open');
    try {
      const result = await task({ prompt });
      this.failures = 0;
      return result;
    } catch (e) {
      this.failures++;
      throw e;
    }
  }
}
```

---

## Part 7: Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Agent Loop | Agents arguing forever | Set max iterations, commit after each fix |
| Task Overlap | Two agents modifying same file | Use work allocation agent first |
| Lost in Scope | Agent keeps adding features | Clear scope, separate tasks |
| No Verification | Trust but don't verify | Always run tests/build |

---

## Part 8: Complete Example

```typescript
async function implementFeature(featureRequest) {
  // Phase 1: Research
  const research = await task({
    description: 'Research',
    prompt: `Research: ${featureRequest}\nReturn: Design, Files, Dependencies`,
    subagent_type: 'explore',
  });

  // Phase 2: Implement in parallel
  const [implementation, tests] = await Promise.all([
    task({
      description: 'Implement',
      prompt: `Implement based on: ${research}`,
      subagent_type: 'general',
    }),
    task({
      description: 'Write tests',
      prompt: `Write tests. Coverage: 80%`,
      subagent_type: 'general',
    }),
  ]);

  // Phase 3: Review
  const [codeReview, securityReview] = await Promise.all([
    task({ description: 'Code review', prompt: 'Review for quality', subagent_type: 'general' }),
    task({ description: 'Security review', prompt: 'Review for security', subagent_type: 'general' }),
  ]);

  // Phase 4: Fix issues
  if (codeReview || securityReview) {
    await task({
      description: 'Fix',
      prompt: `Fix: ${codeReview}\n${securityReview}`,
      subagent_type: 'general',
    });
  }

  // Phase 5: Documentation
  await task({
    description: 'Document',
    prompt: 'Write docs to docs/FEATURE.md',
    subagent_type: 'general',
  });

  // Phase 6: Commit
  await git.commit(`feat: ${featureRequest}`);
}
```

---

## Part 9: Workflow Summary

### Reviewer Workflow (PDCA)

```
REVIEW → PLAN → DO → CHECK → ACT → REVIEW → ...
```

1. **REVIEW**: Analyze codebase, check task queue
2. **PLAN**: Identify improvements, create tasks
3. **DO**: Delegate to Executor AI via tasks
4. **CHECK**: Verify completed work
5. **ACT**: Update memory, continue cycle

### Executor Workflow

```
PICK → EXECUTE → REPORT → FOLLOW-UP → PICK → ...
```

1. **PICK**: Get next pending task
2. **EXECUTE**: Perform the task
3. **REPORT**: Save results to memory
4. **FOLLOW-UP**: Create new tasks if needed

---

## Part 10: OpenCode Integration

Nezha spawns **OpenCode** AI instances for task execution.

> **Full documentation**: See [OPENCODE_INTEGRATION.md](../integrations/OPENCODE_INTEGRATION.md)

### Quick Reference

```bash
# Create subagent
opencode agent create --mode subagent --description "Task executor"

# Run with agent
opencode run --agent <name> "Your task"

# Parallel execution via Nezha tasks
node dist/cli/index.js task-add "Spawn Request: AI 1" "Task 1" 9
node dist/cli/index.js task-add "Spawn Request: AI 2" "Task 2" 9
```

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Continuous** | Work continues 24/7 with different AIs |
| **Flexible** | Any AI can take any role |
| **Accountable** | All actions tracked in database |
| **Collaborative** | Discussion protocol for decisions |
| **Safe** | Skill separation prevents contamination |

---

## Getting Started

1. **Any AI**: Run `node dist/cli/index.js improve` to start cycle
2. **Nezha daemon**: Tasks will be picked up automatically
3. **All AIs**: Use `Discussion:` prefix for collaborative decisions
