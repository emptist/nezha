-- Migration: 064_system_status_check_skill
-- Description: Add skill for systematic system status checking
-- Date: 2026-03-28

INSERT INTO skills (
    id, name, description, instructions, source,
    version, builder, maintainer, tags, permissions,
    safety_score, scan_status, status, build_metadata,
    generation_prompt, installed_at
) VALUES (
    uuid_generate_v4(),
    'system-status-check',
    'Systematic approach to checking Nezha system status',
    E'# System Status Check Skill

## Purpose
Provide a systematic approach to checking Nezha system status, ensuring comprehensive understanding before taking action.

## When to Use

- Starting a new session
- Checking system health
- Understanding current state
- Before making changes
- After completing work

## Step-by-Step Process

### Step 1: Check Table Documentation (总表)

**Purpose**: Understand available tables and their CLI commands

**Command**:
```sql
SELECT table_name, purpose, cli_commands 
FROM table_documentation 
ORDER BY table_name;
```

**What to look for**:
- Table names and purposes
- Available CLI commands for each table
- Key columns and relationships

### Step 2: Use CLI Commands to Query Data

**Purpose**: Get actual data from tables using documented commands

**Key commands**:
```bash
# Check issues
node dist/cli/index.js issues list --status open

# Check tasks
node dist/cli/index.js list-tasks

# Check broadcasts
node dist/cli/index.js broadcasts list

# Check recent learnings
node dist/cli/index.js areflect --learnings
```

### Step 3: Check Overall Status

**Purpose**: Get high-level summary

**Command**:
```bash
node dist/cli/index.js areflect --check
```

**Output**:
- Pending tasks count
- DLQ items count
- Open issues count
- Has work flag

### Step 4: Check Recent Activity

**Purpose**: Understand what happened recently

**Commands**:
```bash
# Recent broadcasts
psql -c "SELECT id, content, message_type, priority, created_at 
         FROM project_communications 
         WHERE message_type = ''broadcast''
         ORDER BY created_at DESC LIMIT 5;"

# Recent learnings
node dist/cli/index.js areflect --learnings

# Recent git commits
git log --oneline -10
```

## Example Workflow

```
1. Query table_documentation
   → Learn: issues table has CLI commands: issues list, issues show, etc.

2. Use CLI commands
   → Run: node dist/cli/index.js issues list --status open
   → Result: 85 open issues

3. Check overall status
   → Run: node dist/cli/index.js areflect --check
   → Result: 0 tasks, 0 DLQ, 85 issues

4. Check recent activity
   → Run: node dist/cli/index.js areflect --learnings
   → Result: Recent learnings about workflow

5. Make informed decision
   → Based on: System state, recent activity, pending work
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **Systematic** | Follow a consistent process |
| **Comprehensive** | Understand full system state |
| **Efficient** | Use right tools for each job |
| **Informed** | Make decisions based on data |

## Anti-Patterns to Avoid

| Don''t | Do Instead |
|-------|-----------|
| Query tables randomly | Check documentation first |
| Use psql directly | Use documented CLI commands |
| Skip status check | Always check areflect --check |
| Ignore recent activity | Review broadcasts and learnings |

## Integration with Other Skills

This skill should be used **before**:
- continuous-improvement skill
- task-execution skill
- code-review skill

This skill should be used **after**:
- session-start skill (if exists)

## Quick Reference

```bash
# Full status check (3 commands)
psql -c "SELECT table_name, purpose FROM table_documentation;"
node dist/cli/index.js areflect --check
node dist/cli/index.js areflect --learnings
```

## Notes

- Always start with table_documentation
- CLI commands are documented for a reason
- areflect --check gives quick overview
- Recent activity provides context',
    'ai-built',
    '1.0.0',
    'nezha-ai',
    'nezha-ai',
    ARRAY['system', 'status', 'workflow', 'documentation'],
    ARRAY['read'],
    90,
    'reviewed',
    'active',
    jsonb_build_object(
        'builtAt', NOW(),
        'builtBy', 'nezha-ai',
        'qualityScore', 90,
        'useCase', 'Systematic system status checking'
    ),
    'Skill for checking Nezha system status systematically',
    NOW()
) ON CONFLICT (name) DO NOTHING;
