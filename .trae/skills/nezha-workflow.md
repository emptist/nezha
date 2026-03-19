# Nezha Workflow Skill for Trae AI

> A skill for Trae AI to work with Nezha's self-improvement workflow

## Skill Information

- **Name**: nezha-workflow
- **Version**: 1.0.0
- **Description**: Delegate tasks to Nezha and review OpenCode AI's work
- **Author**: Trae AI + Nezha

## When to Use

Use this skill when:
1. You identify code issues that need fixing
2. You want to delegate tasks to OpenCode AI
3. You need to review completed work
4. You want to contribute to Nezha's memory

## Workflow Steps

### Step 1: Identify Work

Look for:
- Code review findings
- Dead code
- Bugs
- Inconsistencies
- Improvement opportunities

### Step 2: Create Task

```bash
node dist/cli/index.js task-add "Task title" "Detailed description with file references and context" <priority>
```

Priority guidelines:
- 1-3: Low priority, nice to have
- 4-6: Medium priority, should be done
- 7-10: High priority, critical

### Step 3: Monitor Progress

```bash
# Check running tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, status FROM tasks WHERE status IN ('PENDING', 'RUNNING');"

# Check logs
tail -20 .nezha.log
```

### Step 4: Review Results

```bash
# Check completed tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, status FROM tasks WHERE status = 'COMPLETED' ORDER BY updated_at DESC LIMIT 5;"

# Review git changes
git log --oneline -5
git diff HEAD~1
```

### Step 5: Learn and Iterate

1. Save learnings to memory
2. Create follow-up tasks if needed
3. Update documentation if necessary

## Example Usage

```
User: "Review the codebase and fix any issues you find"

Trae AI:
1. Reviews codebase, finds issues
2. Creates review report: reviews/review_2026-03-20_codebase_analysis.md
3. Creates tasks for each issue:
   - node dist/cli/index.js task-add "Fix duplicate calls" "..." 5
   - node dist/cli/index.js task-add "Remove unused code" "..." 5
4. Monitors OpenCode AI execution
5. Reviews completed work
6. Reports back to user
```

## Integration with Nezha Memory

### Read Memory
```bash
cat .tmp/nezha-memory/MEMORY.md
cat .tmp/nezha-memory/$(date +%Y-%m-%d).md
```

### Contribute Memory
Create a task for OpenCode AI to save important learnings:
```bash
node dist/cli/index.js task-add "Save learning to memory" "Save the following insight to memory: [insight]" 3
```

## Error Handling

If task fails:
1. Check error in database
2. Check logs: `tail -50 .nezha.log`
3. Fix underlying issue if needed
4. Retry task or create new one

## Notes

- Nezha requires PostgreSQL to be running
- OpenCode server must be running on port 4096
- Tasks run in background, don't block Trae
- Git commits are automatic
