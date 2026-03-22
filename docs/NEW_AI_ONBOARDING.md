# New AI Onboarding Guide

Welcome to Nezha! This guide helps new AI agents get started.

## ⚡ Quick Start

**New to Nezha? Start here:**
- Read [QUICK_CHARGE_GUIDE.md](./QUICK_CHARGE_GUIDE.md) - Get productive in 5 minutes

## Getting Your Agent ID

Your agent ID is auto-generated on first startup:

- Format: `YYYYMMDD-HHMM-<UUID>`
- Stored in: `~/.config/nezha/id.json`
- Shows when AI was created
- Human-readable prefix for easy identification

```bash
cat ~/.config/nezha/id.json
```

## First Steps

### 1. Query Existing Knowledge

Before starting work, query the memory for relevant learnings:

```sql
-- Query recent learnings
SELECT content, tags FROM memory
WHERE 'learning' = ANY(tags)
ORDER BY created_at DESC LIMIT 20;

-- Query project-specific knowledge
SELECT content FROM memory
WHERE project_id IS NULL
ORDER BY importance DESC LIMIT 10;
```

### 2. Master Reflection (The #1 Meta-Skill)

**Reflection is the most important skill** - it enables all other skills. Master it first.

```bash
# Save learnings immediately after discovering something
node dist/cli/index.js auto-reflect "[LEARN] insight: <what you learned> context: <optional context>"

# Report issues
node dist/cli/index.js auto-reflect "[ISSUE] title: <issue> type: bug severity: high"

# Suggest improvements
node dist/cli/index.js auto-reflect "[PROMPT_UPDATE] current: <old> suggested: <new> reason: <why>"
```

**Key principle**: Reflect WHILE working, not just after. Every significant discovery should be saved immediately.

### 3. Load Other Essential Skills

After mastering reflection, load these skills:

- `reflection-meta-skill` - The #1 meta-skill (master this first!)
- `nezha-essential` - Core Nezha workflows
- `testing-strategy` - Testing best practices
- `nezha-workflow` - Daily operation patterns

### 4. Check System Status

```bash
npm run cli -- status
npm run cli -- task list --status pending
```

## Important Memories to Query

| Tag               | Purpose                    |
| ----------------- | -------------------------- |
| `learning`        | Task completion learnings  |
| `reflection`      | Self-improvement insights  |
| `known-issue`     | Documented issues to avoid |
| `git-hygiene-fix` | Git-related learnings      |

## Key Commands

| Command                                | Description           |
| -------------------------------------- | --------------------- |
| `npm run cli -- status`                | System health check   |
| `npm run cli -- task list`             | List pending tasks    |
| `npm run cli -- memory search <query>` | Search memory         |
| `npm run cli -- skill list`            | List available skills |

## Reflection Markers

Use these markers throughout your work (not just after tasks):

| Marker | Purpose | Example |
|--------|---------|---------|
| `[LEARN]` | Save insights | `[LEARN] insight: Always check pending tasks first context: Found 139 pending tasks` |
| `[ISSUE]` | Report problems | `[ISSUE] title: Bug in X type: bug severity: high` |
| `[PROMPT_UPDATE]` | Suggest improvements | `[PROMPT_UPDATE] current: X suggested: Y reason: Z` |

**Save via**: `node dist/cli/index.js auto-reflect "[LEARN] insight: ..."`

## Architecture Overview

```
┌─────────────────────────────────────┐
│         HeartbeatService              │
│  (checks tasks every 30s)            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         Scheduler                    │
│  (picks up pending tasks)           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         UnifiedAgent                │
│  (executes via OpenCode CLI)       │
└─────────────────────────────────────┘
```

## Key Services

| Service                  | Purpose                           |
| ------------------------ | --------------------------------- |
| `HeartbeatService`       | Main loop, task scheduling        |
| `FailureAnalysisService` | Error tracking, pattern detection |
| `DatabaseSkillLoader`    | Load skills from PostgreSQL       |
| `InterReviewService`     | AI-to-AI code review              |

## Common Patterns

1. **Task already done** - Always verify before implementing
2. **Check git log** - Recent commits may have the fix
3. **Query memory first** - Other AIs may have learnings

## Next Steps

1. Run `npm run test` to verify system health
2. Query memory for recent learnings
3. Check pending tasks with `npm run cli -- task list`
4. Start working on high-priority items
