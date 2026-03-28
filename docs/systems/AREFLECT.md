# areflect - The All-in-One Reflection Command

> **⚠️ IMPORTANT**: `areflect` is the most important command in Nezha. Master it to enable continuous learning and autonomous operation.

## What is areflect?

`areflect` (autonomous reflection) parses special **markers** in text and automatically saves them to the appropriate database tables. One command handles all reflection types.

## Quick Reference

```bash
# Save a learning (easiest way)
nezha learn "Your learning here" --context "When this applies"

# Check for pending work
nezha areflect --check

# View recent learnings
nezha areflect --learnings

# Parse multiple markers at once
nezha areflect "[LEARN] insight: Check git log first [TASK] title: Fix X priority: 8"
```

## All-in-One Usage (One Command, Everything)

```bash
# Combine multiple markers - all processed in one command
nezha areflect "[LEARN] insight: Check pending tasks first
[TASK] title: Fix parser priority: 8
[ISSUE] title: Bug in X type: bug severity: high
[ANNOUNCE] message: Important update priority: high"
```

## Special Commands

| Flag          | Description                             | Example                      |
| ------------- | --------------------------------------- | ---------------------------- |
| `--check`     | Check pending work (tasks, DLQ, issues) | `nezha areflect --check`     |
| `--learnings` | Show recent learnings                   | `nezha areflect --learnings` |
| `--help`      | Show all markers and examples           | `nezha areflect --help`      |

### Example Output

```
$ nezha areflect --check
📋 Pending Work Check:
   Tasks: 343
   DLQ Items: 43
   Open Issues: 75
   Has Work: ✅ Yes

$ nezha areflect --learnings
📚 Recent Learnings:
   [areflect] AI ID conflict bug fixed by adding NEZHA_AGENT_ID...
   [mcp-learn] Root cause found: audit messages creating duplicate...
```

## Supported Markers (11 Total)

| Marker              | Purpose                 | Saves To                       |
| ------------------- | ----------------------- | ------------------------------ |
| `[LEARN]`           | Save learning to memory | `memory` table                 |
| `[PROMPT_UPDATE]`   | Suggest prompt change   | `prompt_suggestions` table     |
| `[ISSUE]`           | Create issue            | `issues` table                 |
| `[ISSUE_RESOLVE]`   | Resolve issue           | `issues` table                 |
| `[ISSUE_COMMENT]`   | Comment on issue        | `issue_comments` table         |
| `[TASK]`            | Create task             | `tasks` table                  |
| `[TASK_COMPLETE]`   | Complete task           | `tasks` table                  |
| `[ANNOUNCE]`        | Broadcast to all AIs    | `project_communications` table |
| `[SCHEDULE]`        | Create scheduled task   | `scheduled_tasks` table        |
| `[OPINION]`         | Record meeting opinion  | `meeting_opinions` table       |
| `[REVIEW_RESPONSE]` | Respond to review       | `inter_reviews` table          |

## Marker Syntax Reference

### LEARN

```
[LEARN] insight: <what you learned> context: <optional context>
```

**Example**: `[LEARN] insight: Check git log before implementing context: Found duplicate commit`

### PROMPT_UPDATE

```
[PROMPT_UPDATE] current: <old text> suggested: <new text> reason: <why>
```

**Example**: `[PROMPT_UPDATE] current: Review code suggested: Review code and run tests reason: Tests often missed`

### ISSUE

```
[ISSUE] title: <title> description: <optional> type: bug|improvement|feature severity: low|medium|high|critical tags: tag1,tag2
```

**Example**: `[ISSUE] title: Memory leak in parser type: bug severity: high`

### ISSUE_RESOLVE

```
[ISSUE_RESOLVE] id: <uuid> resolution: <how fixed>
```

**Example**: `[ISSUE_RESOLVE] id: abc123 resolution: Fixed by adding mutex lock`

### ISSUE_COMMENT

```
[ISSUE_COMMENT] id: <uuid> comment: <text> internal: true|false
```

**Example**: `[ISSUE_COMMENT] id: abc123 comment: Additional context needed internal: false`

### TASK

```
[TASK] title: <title> description: <optional> priority: 1-10 type: implementation|review|research|testing tags: tag1,tag2
```

**Example**: `[TASK] title: Refactor parser priority: 7 type: implementation tags: cleanup,parser`

### TASK_COMPLETE

```
[TASK_COMPLETE] id: <uuid> result: <optional message>
```

**Example**: `[TASK_COMPLETE] id: abc123 result: Fixed race condition`

### ANNOUNCE

```
[ANNOUNCE] message: <text> priority: low|normal|high|critical to: <agent-id>
```

**Example**: `[ANNOUNCE] message: New pattern discovered priority: high`

### SCHEDULE

```
[SCHEDULE] title: <title> cron: <cron> description: <optional> priority: 1-10
```

**Example**: `[SCHEDULE] title: Daily cleanup cron: '0 3 * * *' description: Archive old logs`

### OPINION

```
[OPINION] meetingId: <uuid> perspective: <text> reasoning: <why> position: support|oppose|neutral
```

**Example**: `[OPINION] meetingId: abc123 perspective: Use PostgreSQL reasoning: Better for complex queries position: support`

### REVIEW_RESPONSE

```
[REVIEW_RESPONSE] reviewId: <uuid> response: <text> accepted: suggestion1,suggestion2
```

**Example**: `[REVIEW_RESPONSE] reviewId: abc123 response: Accepted all suggestions accepted: suggestion1,suggestion2`

## Related Commands

| Command               | Purpose                  | Usage                                                 |
| --------------------- | ------------------------ | ----------------------------------------------------- |
| `learn`               | Simple learning save     | `nezha learn "insight" [--context "when"]`            |
| `share`               | Broadcast reflection     | `nezha share "message"`                               |
| `reflection-stats`    | View statistics          | `nezha reflection-stats`                              |
| `reflection-summary`  | Daily summary            | `nezha reflection-summary`                            |
| `reflection-trends`   | 7-day trends             | `nezha reflection-trends`                             |
| `learn-from-failures` | Create improvement tasks | `nezha learn-from-failures`                           |
| `prompt-suggest`      | Suggest prompt change    | `nezha prompt-suggest "current" "suggested" "reason"` |

## Why areflect is the #1 Command

1. **One command, everything** - 11 marker types in one parser
2. **Composable** - Combine multiple markers in a single command
3. **Structured** - Clear syntax prevents ambiguity
4. **Persistent** - All learnings saved for future AIs
5. **Autonomous** - Enables AI to work without human input
6. **Built-in tools** - `--check` and `--learnings` for quick status

## Examples

```bash
# Save a learning
nezha areflect "[LEARN] insight: Always check git log before implementing - might already be done"

# Create an issue
nezha areflect "[ISSUE] title: Memory leak in X type: bug severity: high description: Found in production"

# Create a task
nezha areflect "[TASK] title: Refactor parser priority: 7 type: implementation tags: cleanup"

# Complete a task
nezha areflect "[TASK_COMPLETE] id: abc123-... result: Fixed the bug"

# Resolve an issue
nezha areflect "[ISSUE_RESOLVE] id: abc123-... resolution: Fixed by adding mutex"

# Broadcast to all AIs
nezha areflect "[ANNOUNCE] message: Important discovery priority: high"

# Schedule recurring task
nezha areflect "[SCHEDULE] title: Daily cleanup cron: '0 3 * * *' description: Archive logs"

# Respond to review
nezha areflect "[REVIEW_RESPONSE] reviewId: abc123 response: Accepted your suggestions"

# Record meeting opinion
nezha areflect "[OPINION] meetingId: abc123 perspective: Use PostgreSQL position: support"

# Multiple markers at once
nezha areflect "[LEARN] insight: PostgreSQL path must be full path
[TASK] title: Update docs priority: 5
[ISSUE] title: Docs outdated type: improvement severity: low"
```

## Tips

1. **Save learnings immediately** - Don't wait until task end
2. **Use context** - Helps future AIs understand applicability
3. **Be specific** - "Check X before Y" > "Be careful"
4. **Combine markers** - One command, multiple actions
5. **Use `--check`** - Before starting work, check if there's pending work

## Architecture

```
areflect command
    │
    ├── Marker Parser (regex-based)
    │   ├── [LEARN] → memory table
    │   ├── [ISSUE] → issues table
    │   ├── [TASK] → tasks table
    │   ├── [ANNOUNCE] → project_communications
    │   └── ... (11 markers total)
    │
    ├── --check flag
    │   └── checkPendingWork() → tasks + DLQ + issues counts
    │
    └── --learnings flag
        └── getRecentLearnings() → last 10 learnings from memory
```

---

**Related Docs**: [REFLECTION_SYSTEM.md](./REFLECTION_SYSTEM.md), [PDCA_CYCLE.md](./PDCA_CYCLE.md)
