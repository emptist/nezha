---
name: task-management
description: Manage nezha tasks - create, list, complete tasks via CLI
trigger: task, todo, work, priority
---

# Task Management via Nezha CLI

Use nezha CLI to manage tasks in the nezha system. Tasks are stored in PostgreSQL and tracked across AI sessions.

## Commands

### Create Task

```bash
nezha task-add "Task title" "Optional description"
# Returns: Created task: <uuid>
```

### List Tasks

```bash
# All tasks
nezha tasks

# Filter by status
nezha tasks --status pending
nezha tasks --status completed
nezha tasks --status in_progress

# JSON output (for AI)
nezha tasks next --json
```

### Get Task Details

```bash
# Get next N tasks as JSON
nezha tasks next --json

# Full context with tasks, issues, learnings
nezha context --json
```

## Task Priority

Task priority ranges from 0-100:
- 0-30: Low priority
- 31-70: Medium priority
- 71-100: High priority (critical)

## Notes

- Tasks created via CLI are automatically associated with your agent ID
- Git hooks auto-complete tasks when `[task: <uuid>]` is in commit message
- Use `nezha context --json` for structured context

## Tags

#nezha #tasks #project-management
