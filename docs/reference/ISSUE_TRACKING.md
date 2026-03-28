# Issue Tracking System

> **Purpose**: Track system bugs, inconsistencies, and improvement ideas discovered during operation

## When to Use Issues vs Tasks

| Scenario                 | Use            | Why                 |
| ------------------------ | -------------- | ------------------- |
| Feature to build         | `tasks` table  | Work to be done     |
| Bug discovered in system | `issues` table | Problem found       |
| Doc doesn't match code   | `issues` table | Inconsistency       |
| Improvement idea         | `issues` table | Enhancement request |
| Technical debt           | `issues` table | Maintenance item    |

## Quick Reference

### Create Issue

```sql
SELECT create_issue(
    'learn() function not implemented',
    'Documented in DailyMemory.ts but no implementation exists',
    'bug',           -- issue_type
    'high',          -- severity
    'nezha',         -- discovered_by
    ARRAY['learning', 'documentation'],
    '{"source_file": "DailyMemory.ts", "line": 24}'::jsonb
);
```

### Update Status

```sql
SELECT update_issue_status(
    'uuid-here',
    'resolved',
    'Implemented learn() function in DailyMemory.ts'
);
```

### Query Issues

```sql
-- Open bugs by severity
SELECT * FROM issues_by_severity;

-- Recent issues
SELECT * FROM recent_issues;

-- All open issues
SELECT id, title, issue_type, severity, created_at
FROM issues
WHERE status = 'open'
ORDER BY
    CASE severity
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
        WHEN 'low' THEN 4 WHEN 'cosmetic' THEN 5
    END,
    created_at DESC;

-- Issues by type
SELECT issue_type, COUNT(*) FROM issues GROUP BY issue_type;

-- Statistics
SELECT * FROM issue_stats;
```

### Related Issues

```sql
-- Link two related issues
SELECT link_issues('uuid-primary', 'uuid-related');

-- Find related
SELECT * FROM issues WHERE related_issue_id = 'uuid-here';
```

## Issue Types

| Type            | Use When                             |
| --------------- | ------------------------------------ |
| `bug`           | System functionality is broken       |
| `inconsistency` | Docs/code/prompts don't match        |
| `feature`       | Request for new capability           |
| `improvement`   | Enhancement to existing feature      |
| `question`      | Needs clarification or investigation |
| `debt`          | Technical debt item                  |

## Severity Levels

| Severity   | Meaning                        | SLA       |
| ---------- | ------------------------------ | --------- |
| `critical` | System broken, blocks all work | Immediate |
| `high`     | Major feature impaired         | 24h       |
| `medium`   | Moderate impact                | 1 week    |
| `low`      | Minor impact                   | 2 weeks   |
| `cosmetic` | No functional impact           | Future    |

## Status Flow

```
open → acknowledged → in_progress → resolved
              ↓            ↓
          wont_fix     duplicate
```

## CLI Integration

Add to CLI for easy access:

```bash
# Add to src/cli/index.ts

// List issues
console.log('Issues Summary:');
console.log('  Open:', stats.open_issues);
console.log('  In Progress:', stats.in_progress);
console.log('  Resolved:', stats.resolved);
console.log('  Resolution Rate:', stats.resolution_rate_percent + '%');
```

## Integration Recommendation

**Status**: Recommended for Integration

### Why Integrate

1. **Discovers problems autonomously** - AI finds bugs during operation
2. **Tracks systemic issues** - Patterns in issues reveal tech debt
3. **Separates "work" from "problems"** - Tasks vs Issues clear ownership
4. **Built-in statistics** - Resolution rate, aging, trends

### How to Integrate

1. **Heartbeat checks**: On each cycle, check for new issues
2. **Task completion review**: After tasks, check for new issues discovered
3. **CLI commands**: `nezha issue list`, `nezha issue create`, `nezha issue stats`
4. **Agent prompts**: Add to reflection workflow

### Prompt Integration

Add to agent reflection prompts:

```
After completing a task, check for:
- Bugs discovered
- Documentation inconsistencies
- Missing functionality

If found, create issues using SQL:
INSERT INTO issues (title, description, issue_type, severity)
VALUES ('...', '...', 'bug', 'high');
```

### Alternative: GitHub Issues

If you prefer external tracking:

```bash
# Could integrate with gh cli
gh issue create --title "..." --body "..."
```

**Trade-off**: DB integration is self-contained, GitHub is external but has better UI.

## Example Workflow

### Discovery

```
AI: "I tried to use learn() but it doesn't exist!"
→ Creates issue: type='bug', severity='high'
```

### Triage

```
Human reviews issue, sets status='acknowledged'
→ Creates task to fix: "Implement learn() function"
```

### Resolution

```
Task completes
→ Updates issue status='resolved'
→ Resolution rate improves
```

## Cleanup

```sql
-- Archive old resolved issues (after 90 days)
DELETE FROM issues
WHERE status IN ('resolved', 'wont_fix', 'duplicate')
AND resolved_at < NOW() - INTERVAL '90 days';

-- Export before delete if needed
COPY (SELECT * FROM issues WHERE ...) TO '/tmp/issues_backup.csv';
```

---

## 已知问题

| ID      | 问题                                                       | 类型        | 严重度 | 状态 |
| ------- | ---------------------------------------------------------- | ----------- | ------ | ---- |
| ISS-001 | learn() 函数已实现但未注册为 AI 可调用工具                 | bug         | high   | open |
| ISS-002 | suggest_prompt_update() 函数已实现但未注册为 AI 可调用工具 | bug         | medium | open |
| ISS-003 | AI 无法通过 learn() 保存反思 - 系统设计问题                | improvement | high   | open |

**修复建议**:

1. 研究 opencode 的工具注册机制 (MCP 或其他)
2. 将 `learn()` 和 `suggest_prompt_update()` 暴露给 AI
3. 或使用数据库直接记录反思（作为临时方案）

---

**Last Updated**: 2026-03-20
