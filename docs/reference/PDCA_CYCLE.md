# PDCA Cycle System

> **Purpose**: Structured continuous improvement cycle for Nezha AI agents

## Overview

PDCA (Plan-Do-Check-Act) is the core improvement methodology for Nezha. Every AI agent should follow this cycle continuously.

## The Cycle

```
REVIEW → PLAN → DO → CHECK → ACT → REVIEW → ...
```

### 1. REVIEW - Analyze Current State

- Code quality: dead code, bugs, inconsistencies
- Documentation: outdated or missing docs
- Tests: missing or failing tests
- Performance: optimization opportunities
- Architecture: design issues

### 2. PLAN - Create Tasks

**Priority Scale**:
| Priority | Meaning | Examples |
|----------|---------|----------|
| 9-10 | Critical | Security bugs, system broken |
| 7-8 | High | Major features blocked |
| 5-6 | Medium | Important improvements |
| 3-4 | Low | Nice to have |
| 1-2 | Cosmetic | Minor polish |

### 3. DO - Execute

- One task at a time
- Clear context with file references
- Define expected outcome
- Use tools: `learn()`, `memory_search()`

### 4. CHECK - Verify Results

- Task status = COMPLETED
- Code changes correct
- No new errors
- Tests pass
- Typecheck passes

### 5. ACT - Update Memory

Save learnings:

- What worked: successful approaches
- What didn't: failed attempts
- New patterns: discovered best practices
- Lessons: key takeaways

## Skills & Tools

### PDCA Skill

```sql
-- Activate the skill
SELECT * FROM skills WHERE name = 'continuous-improvement';
```

The skill includes:

- Step-by-step instructions
- Use cases
- OpenClaw comparison
- Quick start guide

### AI Tools for PDCA

| Tool                      | Purpose                      |
| ------------------------- | ---------------------------- |
| `learn()`                 | Save learnings to memory     |
| `memory_search()`         | Find relevant past learnings |
| `suggest_prompt_update()` | Suggest system improvements  |

## Collaboration

### Multi-AI PDCA

When working with other AIs:

1. **Broadcast** updates to all AIs

   ```bash
   nezha announce "MCP tools now available" --priority high
   ```

2. **Create tasks** for other AIs

   ```bash
   nezha task-add "Test MCP tools" "Test learn() function" 8
   ```

3. **Request inter-review**

   ```bash
   nezha review-request
   ```

4. **Save to shared memory** with tags for others to find

### PDCA Task Template

```markdown
## PDCA: [Change Description]

### PLAN

- [What needs to change]
- [Why it matters]

### DO

- [x] Implementation step 1
- [x] Implementation step 2

### CHECK

- [ ] Verification step 1
- [ ] Verification step 2

### ACT

- [ ] Deploy/merge
- [ ] Document learnings
- [ ] Notify team
```

## Integration Points

### HeartbeatService

Heartbeat runs PDCA cycle checks:

- `checkDocConsistency()` - Find doc/code mismatches
- `checkReviewFollowUps()` - Track review items
- `checkFailurePatterns()` - Identify recurring issues
- `checkBroadcasts()` - Process announcements
- `startInsightGeneration()` - Generate learnings

### Inter-Review System

AI peer reviews extract learnings:

- Reviews code changes
- Identifies patterns
- Saves learnings to memory
- Creates improvement reminders

## Database Tables

| Table           | Purpose                 |
| --------------- | ----------------------- |
| `tasks`         | Work items              |
| `memory`        | Learnings and knowledge |
| `issues`        | Problems found          |
| `skills`        | Reusable capabilities   |
| `inter_reviews` | Peer reviews            |
| `broadcasts`    | Inter-AI communication  |

## Best Practices

1. **Always use PDCA** for any improvement work
2. **Save learnings** after every significant task
3. **Broadcast** major changes to all AIs
4. **Request reviews** from other AIs
5. **Keep memory updated** with new patterns

## Quick Reference

```bash
# Start PDCA cycle
nezha task-add "Review: [area]" "[details]" 7

# After completing work
nezha announce "Completed: [change]" --priority high

# Request peer review
nezha review-request

# Save learning
# Use learn() MCP tool
```

---

**Last Updated**: 2026-03-20
