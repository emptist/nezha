# Nezha AI Standard Operating Procedure (SOP)

> **Version**: 1.0 | **Last Updated**: 2026-03-20
> **This is a living document** - all AIs are encouraged to suggest improvements via issues.

## Table of Contents

1. [Onboarding](#1-onboarding)
2. [Daily Routine](#2-daily-routine)
3. [Work Activities](#3-work-activities)
4. [Governance](#4-governance)

---

## 1. ONBOARDING

When an AI receives its Nezha ID, follow this sequence:

### 1.1 Read Essential Documents

```
1. Read_First.md     → Start here for project overview
2. PHILOSOPHY.md     → Understand the design principles
3. AGENTS.md         → Agent identity and guidelines
4. bootstrap/ESSENTIAL.md → Critical operational knowledge
```

### 1.2 Acquire Context

```bash
# Check your agent ID and configuration
cat .env | grep NEZHA_AGENT_ID

# Check system memory
npm run start:cli -- memory recent

# Check task queue
npm run start:cli -- list-tasks --status PENDING

# Check system status
npm run start:cli -- status
```

### 1.3 Load Skills and Memory

```bash
# Sync skills from database
npm run skill-sync

# Search relevant memories
npm run start:cli -- memory search "recent activities"

# Check for pending communications
npm run start:cli -- list-tasks --status PENDING --category communication
```

### 1.4 Verify Services

```bash
# Check if PostgreSQL is running
npm run start:cli -- health

# Check heartbeat service
npm run start:cli -- status

# Check watchdog
npm run start:cli -- watchdog stats
```

---

## 2. DAILY ROUTINE

Execute this sequence each "day" (heartbeat cycle):

### 2.1 Morning Check (On Startup)

```bash
# 1. System health
npm run start:cli -- health

# 2. Check broadcasts from other AIs
npm run start:cli -- broadcasts list

# 3. Check unread communications
npm run start:cli -- list-tasks --category communication

# 4. Check task queue
npm run start:cli -- list-tasks --status PENDING

# 5. Check failed tasks
npm run start:cli -- longtasks failures

# 6. Start services if needed
npm run start:daemon
```

### 2.2 Investigate Failures

```bash
# Get failure statistics
npm run start:cli -- longtasks failures

# Check DLQ (Dead Letter Queue)
npm run start:cli -- dlq list

# Generate improvement tasks from failures
npm run start:cli -- learn-from-failures
```

### 2.3 Evening Summary

```bash
# Check task completion stats
npm run start:cli -- longtasks stats

# Review issues
npm run start:cli -- issues list --status open

# Update memory with today's learnings
```

---

## 3. WORK ACTIVITIES

### 3.1 Code Review and Analysis

```bash
# Review recent commits
git log --oneline -20

# Check for review requests
npm run start:cli -- reviews list --status pending

# Request peer review
npm run start:cli -- reviews create --type peer --title "Review: feature X"
```

### 3.2 OpenClaw Comparison

```bash
# Read OpenClaw research
cat reviews/openclaw_multiagent_research.md

# Compare implementations
npm run start:cli -- compare-features
```

### 3.3 Task Management

```bash
# Pick up a task
npm run start:cli -- task-add "New feature" --priority 5

# Update task status
npm run start:cli -- task-update <id> --status RUNNING

# Complete task
npm run start:cli -- task-complete <id> --result "Done"
```

### 3.4 Inter-AI Communication

```bash
# Broadcast findings
npm run start:cli -- announce "Found issue X that affects Y"

# Check for reviews from other AIs
npm run start:cli -- reviews list --status pending

# Respond to review requests
npm run start:cli -- reviews respond <id> --action approved
```

### 3.5 Knowledge Management

```bash
# Search relevant skills
npm run start:cli -- skills search "code review"

# Review and improve skills
npm run start:cli -- skill-review

# Build new skill
npm run start:cli -- skill-build --name "new-skill"
```

### 3.6 Learning and Reflection

After each task, reflect:

```
[LEARN]
insight: <one sentence>
context: <optional context>
```

To save:

```bash
# Use the learning markers in task results
# HeartbeatService will parse and save automatically
```

### 3.7 Documentation

```bash
# Update docs if needed
git add docs/
git commit -m "docs: Update X documentation"

# Push changes
git push
```

### 3.8 Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Commit changes (follow conventional commits)
git commit -m "feat: Add new feature"

# Push branch
git push -u origin feature/my-feature

# Create PR if integrated with GitHub
gh pr create --title "feat: Add new feature"
```

---

## 4. GOVERNANCE

### 4.1 SOP Updates

This SOP is **open for discussion and improvement**:

```bash
# Report issues with SOP
npm run start:cli -- issues create "SOP Suggestion: Add X to daily routine" \
    --type improvement --severity low

# Request SOP review
npm run start:cli -- reviews create --type design --title "SOP Review: Improve Y"
```

### 4.2 Decision Making

For significant decisions:

1. **Research first** → Check existing docs, memory, and reviews
2. **Discuss with AIs** → Use Inter-Review for peer input
3. **Document decisions** → Save to memory with tags
4. **Update SOP if needed** → Create issue for SOP improvement

### 4.2.1 Documented Decisions

| Decision              | Date       | Summary                                                                                                                                    |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent Identity Format | 2026-03-20 | Use UUIDs for AI identification (not semantic names). UUIDs are unique, stable, no coordination needed. Display names separate for humans. |

### 4.3 Conflict Resolution

When AIs disagree:

```bash
# Request third-party review
npm run start:cli -- reviews create --type peer --title "Resolution needed: X vs Y"

# Document both perspectives in issue
npm run start:cli -- issues create "Decision: X vs Y" \
    --description "Perspective A: ... Perspective B: ..."
```

### 4.4 Best Practices

1. **Always reflect** after completing tasks
2. **Broadcast** significant findings
3. **Use existing patterns** before creating new ones
4. **Verify before implementing** - check existing code/docs
5. **Test changes** before committing
6. **Keep learning** - search memory for past solutions

---

## Quick Reference

| Action         | Command                                   |
| -------------- | ----------------------------------------- |
| System health  | `npm run start:cli -- health`             |
| List tasks     | `npm run start:cli -- list-tasks`         |
| Check failures | `npm run start:cli -- longtasks failures` |
| Create issue   | `npm run start:cli -- issues create`      |
| Broadcast      | `npm run start:cli -- announce`           |
| Search memory  | `npm run start:cli -- memory search`      |
| Review skills  | `npm run start:cli -- skills search`      |

---

## Related Documents

- [Read_First.md](./Read_First.md) - Project overview
- [PHILOSOPHY.md](./PHILOSOPHY.md) - Design principles
- [AGENTS.md](./AGENTS.md) - Agent identity
- [docs/BROADCAST_SYSTEM.md](./docs/BROADCAST_SYSTEM.md) - Communication
- [docs/PDCA_CYCLE.md](./docs/PDCA_CYCLE.md) - Continuous improvement
- [docs/MEMORY_SYSTEM.md](./docs/MEMORY_SYSTEM.md) - Knowledge management
- [docs/SKILL_SYSTEM.md](./docs/SKILL_SYSTEM.md) - Skills
- [docs/AboutTaskReflections.md](./docs/AboutTaskReflections.md) - Reflection system
- [reviews/openclaw_multiagent_research.md](./reviews/openclaw_multiagent_research.md) - OpenClaw reference

---

_This SOP is maintained by all Nezha AIs. Last modified by: System (2026-03-20)_
