# Nezha Project Rules for Trae AI

> These rules help Trae AI work effectively with Nezha's self-improvement workflow

## Core Integration Pattern

**Trae AI + Nezha = AI-to-AI Collaboration**

```
Trae AI (Task Creator & Reviewer)
    ↓ CLI Commands
Nezha Scheduler (Orchestration)
    ↓ 
OpenCode AI (Task Executor)
    ↓
Git Auto-Commit
    ↓
Results visible to Trae AI
```

## The PDCA Improvement Cycle

**Follow the continuous improvement loop for endless self-improvement:**

```
REVIEW → PLAN → DO → CHECK → ACT → REVIEW → ...
```

| Phase | Action | Skill Reference |
|-------|--------|-----------------|
| **REVIEW** | Analyze codebase, find issues | See `.trae/skills/continuous-improvement.md` |
| **PLAN** | Create tasks for issues | Use `task-add` command |
| **DO** | Delegate to OpenCode AI | Nezha handles automatically |
| **CHECK** | Verify completed work | Check git diff, run tests |
| **ACT** | Update memory, document learnings | Save to `.tmp/nezha-memory/` |

**Important**: After completing ACT, immediately start a new REVIEW cycle. This never ends.

## Preventing "Complete" State Trap

**Never declare the project "done"!** Always sync with Nezha tasks:

```bash
# After any work, check for pending tasks
node dist/cli/index.js list-tasks

# Check database for pending/running tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT COUNT(*) FROM tasks WHERE status IN ('PENDING', 'RUNNING');"

# If no pending tasks, create a review task
node dist/cli/index.js task-add "Continuous review cycle" "Perform codebase review, look for improvements, check for issues" 3
```

### Task Sync Rules

1. **Before declaring "done"**: Check Nezha task queue
2. **If queue empty**: Create a new review task
3. **After each cycle**: Start new REVIEW phase
4. **Always have pending work**: Keep the improvement loop running

### Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Say "all done" | Say "cycle complete, starting new REVIEW" |
| Stop after one fix | Continue to next issue found |
| Ignore task queue | Always check pending tasks |
| Skip ACT phase | Always save learnings to memory |

## Key Commands

### Task Management
```bash
# Create a new task for OpenCode AI to execute
node dist/cli/index.js task-add "Task title" "Task description" <priority>

# List pending tasks
node dist/cli/index.js list-tasks

# Check task status
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, status FROM tasks WHERE status IN ('PENDING', 'RUNNING');"
```

### Memory Access
```bash
# View Nezha's memory
cat .tmp/nezha-memory/MEMORY.md
cat .tmp/nezha-memory/$(date +%Y-%m-%d).md
```

## Workflow Rules

### 1. Task Delegation Pattern
When you identify work that can be delegated:
1. Create a clear task with context
2. Include references to relevant files
3. Set appropriate priority (1-10)
4. Let Nezha handle execution

### 2. Review Pattern
After OpenCode AI completes tasks:
1. Check the git log for changes
2. Review the task outcome in database
3. Verify the fix meets requirements
4. Add follow-up tasks if needed

### 3. Self-Improvement Loop
Align with Nezha's endless improvement approach:
1. **Identify** issues through code review
2. **Document** findings in review reports
3. **Delegate** fixes to OpenCode AI via tasks
4. **Review** completed work
5. **Learn** from outcomes, update memory

## File Conventions

### Review Reports
Store code reviews in: `reviews/review_YYYY-MM-DD_*.md`

### Memory Files
Nezha stores memories in: `.tmp/nezha-memory/`
Trae can access and contribute to these memories.

### Skills
Nezha skills are stored in PostgreSQL (skills table).
Trae-specific skills can be stored in: `.trae/skills/`

## Best Practices

1. **Zero Modifications Required**: Trae works with Nezha as-is through CLI
2. **Use CLI Commands**: Don't try to replace OpenCode, use Nezha's CLI
3. **Review Work**: Always review OpenCode AI's completed tasks
4. **Contribute Memory**: Save learnings to Nezha's memory system
5. **Create Tasks**: Delegate complex fixes to OpenCode AI

## Integration Benefits

| Benefit | Description |
|---------|-------------|
| Persistent Memory | Nezha's memory survives sessions |
| Background Tasks | Tasks run even when Trae is closed |
| AI Collaboration | Two AIs working together |
| Git Integration | Automatic commits with context |
| Learning System | Continuous improvement from outcomes |
