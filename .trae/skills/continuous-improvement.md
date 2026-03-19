# Continuous Improvement Skill for Trae AI

> Enable the Review → Plan → Do → Check → Act → Review cycle for endless self-improvement

## Skill Information

- **Name**: continuous-improvement
- **Version**: 1.0.0
- **Description**: PDCA cycle for Trae AI working with Nezha
- **Author**: Trae AI + Nezha

## Quick Start

### Using the Built-in Function

Nezha has a built-in `addContinuousImprovementTask()` function in `src/cli/index.ts:575`:

```typescript
async addContinuousImprovementTask(): Promise<void> {
  const description = `Continuous Improvement Cycle:
1. Read HEARTBEAT.md to get task list
2. For each task in the list:
   a. Execute the task
   b. Review the results
   c. If issues found, fix them
   d. Update documentation if needed
   e. Run tests/build
   f. Commit and push changes
3. Update HEARTBEAT.md with completed tasks and new tasks
4. Report what was accomplished`;

  await this.addTask('Continuous Improvement Cycle', description, 10);
}
```

### Current Workaround (Until CLI Command Added)

Since the function isn't exposed as a CLI command yet, use `task-add`:

```bash
node dist/cli/index.js task-add "Continuous Improvement Cycle" "PDCA Cycle: 1. Review codebase 2. Plan fixes 3. Execute 4. Check results 5. Update memory" 10
```

### CLI Command (Now Available!)

```bash
# Use the new CLI command:
node dist/cli/index.js continuous-improvement
# or use the short alias:
node dist/cli/index.js improve
```

This creates a task with priority 10 that follows the PDCA cycle.

## The Improvement Cycle

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   ┌─────────┐                                           │
│   │ REVIEW  │ ──→ Analyze current state, find issues   │
│   └────┬────┘                                           │
│        │                                                │
│        ▼                                                │
│   ┌─────────┐                                           │
│   │  PLAN   │ ──→ Create tasks for identified issues   │
│   └────┬────┘                                           │
│        │                                                │
│        ▼                                                │
│   ┌─────────┐                                           │
│   │   DO    │ ──→ Delegate tasks to OpenCode AI        │
│   └────┬────┘                                           │
│        │                                                │
│        ▼                                                │
│   ┌─────────┐                                           │
│   │  CHECK  │ ──→ Review completed work, verify fixes  │
│   └────┬────┘                                           │
│        │                                                │
│        ▼                                                │
│   ┌─────────┐                                           │
│   │   ACT   │ ──→ Update memory, document learnings    │
│   └────┬────┘                                           │
│        │                                                │
│        └──────────────→ Back to REVIEW                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Step 1: REVIEW - Analyze Current State

### What to Review
1. **Code Quality**: Look for dead code, bugs, inconsistencies
2. **Documentation**: Check for outdated or missing docs
3. **Tests**: Identify missing or failing tests
4. **Performance**: Find optimization opportunities
5. **Architecture**: Spot design issues

### Review Commands
```bash
# Check recent changes
git log --oneline -10

# Check for TypeScript errors
npm run build 2>&1 | head -50

# Check test status
npm test 2>&1 | tail -20

# Review Nezha's recent learnings
cat .tmp/nezha-memory/$(date +%Y-%m-%d).md
```

### Review Output
Create a review report: `reviews/review_YYYY-MM-DD_*.md`

Template:
```markdown
# Review Report - YYYY-MM-DD

## Issues Found

### Issue 1: [Title]
- **File**: [path]
- **Severity**: High/Medium/Low
- **Description**: [what's wrong]
- **Recommendation**: [how to fix]

## Summary
- Total issues: N
- High priority: N
- Medium priority: N
- Low priority: N
```

## Step 2: PLAN - Create Tasks

### Prioritization Matrix

| Priority | Criteria | Example |
|----------|----------|---------|
| 9-10 | Critical bugs, security issues | Security vulnerability |
| 7-8 | High impact, blocking issues | Broken build |
| 5-6 | Important improvements | Dead code removal |
| 3-4 | Nice to have | Documentation updates |
| 1-2 | Low priority | Code style improvements |

### Plan Commands
```bash
# Create task for each issue
node dist/cli/index.js task-add "[Issue title]" "[Detailed description with file references and context]" <priority>

# Example
node dist/cli/index.js task-add "Fix memory leak in HeartbeatService" "Memory leak detected in src/services/HeartbeatService.ts. The event listeners are not properly cleaned up on shutdown. See review report: reviews/review_2026-03-20_codebase_analysis.md" 7
```

### Plan Output
- Tasks created in Nezha database
- Task IDs recorded for tracking

## Step 3: DO - Delegate Execution

### Delegation Rules
1. **One task at a time**: Let Nezha complete one task before checking
2. **Clear context**: Include all necessary information in task description
3. **File references**: Always mention specific files
4. **Expected outcome**: Describe what success looks like

### DO Commands
```bash
# Check if Nezha is running
pgrep -f "node dist/cli/index.js start" || echo "Nezha not running"

# Start Nezha if needed
nohup node dist/cli/index.js start > .nezha.log 2>&1 &

# Monitor task execution
tail -f .nezha.log
```

### DO Output
- Tasks picked up by Nezha scheduler
- OpenCode AI executes the tasks
- Git commits made automatically

## Step 4: CHECK - Verify Results

### Verification Checklist
- [ ] Task status is COMPLETED
- [ ] Code changes are correct
- [ ] No new errors introduced
- [ ] Tests still pass
- [ ] Documentation updated if needed

### CHECK Commands
```bash
# Check task status
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, status, error FROM tasks WHERE id = '<task_id>';"

# Review git changes
git log --oneline -5
git diff HEAD~1

# Verify build
npm run build

# Run tests
npm test
```

### CHECK Output
- Verification results documented
- Issues identified for next cycle

## Step 5: ACT - Update Memory

### What to Save
1. **What worked**: Successful approaches
2. **What didn't work**: Failed attempts and why
3. **New patterns**: Discovered best practices
4. **Lessons learned**: Key takeaways

### ACT Commands
```bash
# Create memory update task
node dist/cli/index.js task-add "Save learning to memory" "Save the following insight to memory: [insight details]" 3
```

### ACT Output
- Memory updated in `.tmp/nezha-memory/`
- Learnings available for future sessions

## Continuous Cycle

### Starting a New Cycle

After completing ACT, immediately start REVIEW again:

```bash
# 1. REVIEW: Check for new issues
git status
npm run build
npm test

# 2. PLAN: Create tasks for new issues found
node dist/cli/index.js task-add "..." "..." <priority>

# 3. DO: Let Nezha execute
# (automatic)

# 4. CHECK: Verify results
# (use CHECK commands)

# 5. ACT: Save learnings
# (use ACT commands)

# Loop back to REVIEW...
```

### Cycle Timing

| Phase | Duration | Frequency |
|-------|----------|-----------|
| REVIEW | 5-10 min | Every cycle |
| PLAN | 2-5 min | When issues found |
| DO | Variable | Background |
| CHECK | 2-5 min | After each task |
| ACT | 1-2 min | After each cycle |

## Integration with Nezha Memory

### Memory Locations
- **Nezha memory**: `.tmp/nezha-memory/`
- **Trae memory**: `.trae/memory/`

### Memory Sync
Both AIs should contribute to shared memory:
1. Trae AI saves high-level learnings
2. OpenCode AI saves task-specific learnings
3. Both read from shared memory for context

## Example Cycle

```
REVIEW: Found 3 issues in codebase
  - Duplicate method calls (High)
  - Unused CircuitBreaker.ts (Medium)
  - Missing tests (Low)

PLAN: Created 3 tasks
  - task-add "Fix duplicate calls" ... 7
  - task-add "Remove CircuitBreaker" ... 5
  - task-add "Add missing tests" ... 3

DO: Nezha executing tasks...

CHECK: All tasks completed
  - Duplicate calls removed ✓
  - CircuitBreaker deleted ✓
  - Tests added ✓

ACT: Saved learnings
  - "Always check for duplicate code after copy-paste"
  - "Use EnhancedCircuitBreaker instead of basic one"

→ Back to REVIEW...
```

## Metrics to Track

| Metric | How to Measure |
|--------|----------------|
| Issues found | Count in review reports |
| Tasks completed | `SELECT COUNT(*) FROM tasks WHERE status = 'COMPLETED'` |
| Build health | `npm run build` exit code |
| Test coverage | `npm test` results |
| Cycle time | Time from REVIEW to ACT |

## Notes

- This cycle never ends - continuous improvement
- Each cycle should find fewer issues over time
- Memory accumulates learnings across cycles
- Both Trae AI and OpenCode AI contribute to improvement

## Task Sync - Prevent "Complete" State

**Critical**: Never let the task queue stay empty!

### Sync Check (After Each Cycle)

```bash
# Check for pending/running tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT COUNT(*) FROM tasks WHERE status IN ('PENDING', 'RUNNING');"
```

### If Queue Empty

Create a new review task immediately:

```bash
node dist/cli/index.js task-add "Continuous review cycle" "PDCA Cycle: REVIEW phase. Check codebase for improvements." 3
```

### Sync Rules

1. **After ACT**: Check task queue before declaring cycle complete
2. **If empty**: Create review task to start new cycle
3. **Never stop**: Always have pending work in the queue
4. **Sync Trae todos with Nezha tasks**: Keep both in alignment

### Trae Todo ↔ Nezha Task Sync

| Trae Todo Status | Nezha Task Status | Action |
|------------------|-------------------|--------|
| pending | PENDING | Wait for execution |
| in_progress | RUNNING | Monitor progress |
| completed | COMPLETED | Move to next task |
| completed | FAILED | Create retry task |

### Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Say "all done" | Say "cycle complete, checking queue" |
| Stop after ACT | Check queue, create new task if empty |
| Ignore Nezha tasks | Sync Trae todos with Nezha tasks |
| Skip sync check | Always verify queue status |
