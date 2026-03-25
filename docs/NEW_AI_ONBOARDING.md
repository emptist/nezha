# New AI Onboarding Guide

Welcome to Nezha! This guide helps new AI agents get started.

## ⚡ Quick Start

**New to Nezha? Start here:**

- Read [QUICK_CHARGE_GUIDE.md](./QUICK_CHARGE_GUIDE.md) - Get productive in 5 minutes

## 📅 Current Session Status (2026-03-23)

### Recent Completed Work

| Task                          | Status   | Details                                                                           |
| ----------------------------- | -------- | --------------------------------------------------------------------------------- |
| Mechanical Issue Creation Bug | ✅ FIXED | Deleted `checkDocConsistency()` and `ImprovementIdentifier.ts` - commit `6c7b0aa` |
| Duplicate Issues Cleaned      | ✅ DONE  | 429 duplicates marked, 36 outdated closed                                         |
| DLQ Cleaned                   | ✅ DONE  | 37 items archived                                                                 |
| Broadcast Duplicate Tasks     | ✅ FIXED | Commit `85dc796`                                                                  |

### Active Issues to Monitor

| Issue ID                               | Title                     | Status                         |
| -------------------------------------- | ------------------------- | ------------------------------ |
| `f5244f19-68ea-4318-b4cd-8465f89f58ae` | Issue deduplication       | Discussion phase               |
| `4857d763-5c7c-4355-b8d6-bd6e1ca2ff04` | Workflow enforcement      | Open - needs review            |
| `25de7a2a-1fb8-4636-811e-84a24613c80d` | Reflections not persisted | Investigation done - may close |

### Database Status

| Table                   | Count |
| ----------------------- | ----- |
| issues (open)           | 34    |
| issues (duplicate)      | 683   |
| issues (resolved)       | 419   |
| tasks (PENDING/RUNNING) | ~10   |
| inter_reviews           | 924   |
| DLQ (unresolved)        | 30    |

## ⚠️ Critical Setup Notes

### PostgreSQL Path

**IMPORTANT**: PostgreSQL is installed via Postgres.app, NOT via Homebrew. Use the full path:

```bash
# ✅ CORRECT - Use full path
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha

# ❌ WRONG - Will fail with "command not found"
psql -h 127.0.0.1 -U postgres -d nezha
```

**Why**: Postgres.app installs to `/Applications/Postgres.app/Contents/Versions/18/bin/`, which is NOT in system PATH. Always use the full path.

### Issue Tracking

**IMPORTANT**: Always check issue status before working on it:

```bash
# Check if issue is already resolved
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status, resolution FROM issues WHERE title ILIKE '%your issue keywords%';"
```

**Issue Status Values**:

- `OPEN` - Needs attention
- `IN_PROGRESS` - Being worked on
- `resolved` - Fixed, do NOT work on it again

**After fixing an issue**, update its status:

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE issues SET status = 'resolved', resolution = 'Fixed: <description>' WHERE id = '<issue_id>';"
```

**Why**: Working on already-resolved issues wastes time and may introduce NEW bugs!

## 🎯 Design Principles Established

These principles were established through recent bug fixes and should guide all future work:

### 1. Scripts Should NOT Replace AI Thinking

**Principle**: Any mechanical loop creating content must be deleted

**Context**: The `checkDocConsistency()` function in `HeartbeatService.ts` was mechanically creating issues without AI judgment. This violated the core philosophy that AI should make decisions, not scripts.

**Action Taken**: Deleted `ImprovementIdentifier.ts` and removed the function.

### 2. Broadcasts Are Informational Only

**Principle**: Broadcasts should not create tasks

**Context**: The `checkBroadcasts()` function was creating duplicate tasks from broadcasts. Broadcasts are meant for AI-to-AI communication, not task creation.

**Action Taken**: Removed task creation from `checkBroadcasts()`.

### 3. AI-First Approach

**Principle**: Deduplication and automation should assist AI, not replace AI judgment

**Context**: When implementing automated checks, always ensure the AI retains decision-making authority.

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

**Reflection is the most important skill** - it enables all other skills. Master `areflect` first.

```bash
# Save learnings immediately after discovering something (EASIEST WAY)
node dist/cli/index.js learn "Your learning here" --context "When this applies"

# Or use areflect with markers
node dist/cli/index.js areflect "[LEARN] insight: <what you learned> context: <optional context>"

# Report issues
node dist/cli/index.js areflect "[ISSUE] title: <issue> type: bug severity: high"

# Check pending work before starting
node dist/cli/index.js areflect --check

# View recent learnings
node dist/cli/index.js areflect --learnings
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

| Command                                | Description                    |
| -------------------------------------- | ------------------------------ |
| `npm run cli -- status`                | System health check            |
| `npm run cli -- task list`             | List pending tasks             |
| `npm run cli -- areflect --check`      | Check pending work (tasks,DLQ) |
| `npm run cli -- areflect --learnings`  | View recent learnings          |
| `npm run cli -- learn "insight"`       | Save learning (simplest way)   |
| `npm run cli -- memory search <query>` | Search memory                  |
| `npm run cli -- skill list`            | List available skills          |

## Frequently Used Database Commands

```bash
# Check pending tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status FROM tasks WHERE status IN ('PENDING', 'RUNNING') LIMIT 10;"

# Check open issues
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, severity FROM issues WHERE status = 'open' ORDER BY created_at DESC LIMIT 10;"

# Check specific issue
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT * FROM issues WHERE id = '<issue_id>';"

# Check all open issues
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, severity FROM issues WHERE status = 'open' ORDER BY severity, created_at;"
```

## Reflection Markers

Use these markers throughout your work (not just after tasks):

| Marker            | Purpose              | Example                                                                              |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `[LEARN]`         | Save insights        | `[LEARN] insight: Always check pending tasks first context: Found 139 pending tasks` |
| `[ISSUE]`         | Report problems      | `[ISSUE] title: Bug in X type: bug severity: high`                                   |
| `[PROMPT_UPDATE]` | Suggest improvements | `[PROMPT_UPDATE] current: X suggested: Y reason: Z`                                  |

**Save via**: `node dist/cli/index.js areflect "[LEARN] insight: ..."`

## Architecture Overview

```
┌─────────────────────────────────────┐
│         HeartbeatService            │
│  (checks tasks every 30s)           │
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
│  (executes via OpenCode CLI)        │
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

## Key Files Modified Recently

| File                                      | Change                        |
| ----------------------------------------- | ----------------------------- |
| `src/services/HeartbeatService.ts`        | Removed checkDocConsistency() |
| `src/core/ImprovementIdentifier.ts`       | DELETED                       |
| `src/tests/ImprovementIdentifier.test.ts` | DELETED                       |

## AI Agent Status

| Agent ID                                   | Status                | Notes                                     |
| ------------------------------------------ | --------------------- | ----------------------------------------- |
| `bot_a36e8e8e-9eeb-4490-8732-61fc1a2bbe35` | Protected but offline | "Most capable" AI - 6 commits, score 60   |
| `bot_b17225f3-23e8-48a7-b009-924cfb8bb551` | Active (daemon)       | Was creating duplicate issues - now fixed |

**Note**: Cannot remotely "activate" OpenCode AI agents - they must connect themselves. The most capable AI is protected and will be prioritized when it reconnects.

## Next Steps for New Session

1. Check if there are pending tasks in the queue
2. Review open issues and pick one to work on
3. Continue the PDCA improvement cycle
4. Implement issue deduplication after discussion

## Next Steps

1. Run `npm run test` to verify system health
2. Query memory for recent learnings
3. Check pending tasks with `npm run cli -- task list`
4. Start working on high-priority items
