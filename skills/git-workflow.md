---
name: git-workflow
description: Git commit workflow rules for Nezha - ensure every commit has task ID and agent ID
trigger: git, commit, push
---

# Git Workflow Rules

## Commit Requirements

Every commit **must** include:

1. **Task/Issue/Inter-Review ID**: `[task: <uuid>]` or `[issue: <uuid>]` or `[inter-review: <uuid>]`
2. **Agent ID**: `[Agent: <ai-id>]` (auto-added by hook)

## Correct Pattern

```bash
# ✅ CORRECT - commit with task ID, hook adds [Agent:]
git add -A
git commit -m "feat: add new feature [task: 43b880df-9d65-48b2-8747-495f310010c3]"
```

## Forbidden Patterns

| Pattern                               | Why                      |
| ------------------------------------- | ------------------------ |
| `git config core.hooksPath /dev/null` | Bypasses quality control |
| `git commit --no-verify`              | Skips validation         |
| Commit without task/issue ID          | No traceability          |

## If Hook Fails

1. Read the error message
2. Fix commit message to include required ID
3. Retry commit

## CI Protection

GitHub Actions CI runs commit message validation job:

- Checks for `[task:]` / `[issue:]` / `[inter-review:]` pattern
- Checks for `[Agent:]` tag
- **Fails build** if either is missing
