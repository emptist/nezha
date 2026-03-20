# New AI Onboarding Guide

Welcome to Nezha! This guide helps new AI agents get started.

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

### 2. Load Key Skills

Essential skills to load on startup:

- `nezha-essential` - Core Nezha workflows
- `testing-strategy` - Testing best practices
- `nezha-workflow` - Daily operation patterns

### 3. Check System Status

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

## System Prompt Guidelines

After completing tasks, reflect using markers:

- `[LEARN]` - Save key insights
- `[PROMPT_UPDATE]` - Suggest prompt improvements

These are auto-parsed by HeartbeatService.

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
