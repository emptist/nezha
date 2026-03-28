# Case Study: System Inconsistency Discovery and Resolution

> **Session Date**: 2026-03-20  
> **Agent**: opencode (user-facing AI)  
> **Subject**: Discovering and documenting broken learning system

## Executive Summary

During a reflection task, the AI discovered that 3 of 4 documented learning functions didn't exist. This case study documents the investigation, documentation, and resolution process, plus a discovered secondary issue with daemon communication.

## The Problem

The AI completed a task ("Integrate Inter-Review into improvement cycle") and was asked to reflect. During reflection, the AI noted that `learn()` and `suggest_prompt_update()` were mentioned in prompts but didn't seem to exist.

## Investigation Process

### Step 1: Question and Initial Discovery

**User asked**: "do we have a issue system yet?"

**AI's first action**: Searched for existing issue-related files

```
Glob patterns: *issue*, *bug*
Grep for: issue.*track, bug.*track, ticket
```

**Result**: No issue system found

**AI asked**: "No. Would you like me to create one?"

### Step 2: Design and Implement Solution

User requested:

1. Create issue tracking table
2. Document with best practices
3. Comment on system integration
4. Create task to fix the underlying problem

**AI actions**:

1. Reviewed existing migration structure (027_inter_ai_review.sql)
2. Created migration 029_issue_tracking.sql with:
   - `issues` table with proper schema
   - Helper functions (`create_issue`, `update_issue_status`, `link_issues`)
   - Views for statistics and queries
   - Trigger for auto-updating timestamps
3. Created documentation in `docs/ISSUE_TRACKING.md`
4. Ran migration to create table
5. Created first issue for the learning system problem
6. Created task with priority 80
7. Linked issue to task
8. Updated Read_First.md to include new documentation

## The Secondary Problem: Daemon Communication Gap

### Observation

During this session, the user mentioned:

> "the AI in daemon could not find your question so he was not able to find anything in trouble when you were waiting for an answer"

This suggests:

1. The user asked a question
2. The daemon AI (running in background) didn't notice the question was waiting
3. The user had to ask again in a new session

### Root Cause Analysis

**Possible causes**:

1. **Ignorance** - Daemon AI doesn't know to check for pending questions/messages
2. **Missing notification** - No mechanism to alert daemon of new user input
3. **Workflow gap** - System doesn't support async user-to-AI communication

### Investigation Points

Check these files for communication mechanisms:

- `HeartbeatService.ts` - How does daemon check for work?
- `docs/AI_COMMUNICATION_GUIDE.md` - How should AIs communicate?
- `src/cli/index.ts` - How does CLI interact with daemon?

### Likely Root Cause

Based on system design, this appears to be **workflow design gap**:

- Nezha is designed for **task queue** model: tasks → execute → done
- Not designed for **conversational** model: question → response → follow-up
- Daemon runs tasks from queue, doesn't poll for questions

## Lessons Learned

### For AI Agents

1. **Verify before trusting documentation**
   - Just because something is documented doesn't mean it exists
   - Always check implementation, not just comments

2. **Question system inconsistencies**
   - When something doesn't work, investigate why
   - Document findings even if you can't fix immediately

3. **Use issue tracking**
   - Problems found during work should be documented
   - Link issues to tasks for traceability

4. **Check daemon status**
   - If waiting for response, verify daemon is working
   - The "silence" might mean daemon didn't see your input

### For System Design

1. **Implement documented features**
   - Or remove documentation
   - "Broken promises" erode trust

2. **Add communication notification**
   - Daemon should check for pending questions
   - Or add notification mechanism

3. **Distinguish tasks vs issues**
   - Tasks = work to do
   - Issues = problems found

## Process Checklist

When encountering a system problem, follow this process:

```markdown
## Problem Discovery Checklist

- [ ] Identify the symptom
- [ ] Search for existing solutions/issues
- [ ] Investigate root cause
- [ ] Determine if fixable now or needs tracking
- [ ] If needs tracking:
  - [ ] Create issue with type, severity
  - [ ] Create task to fix
  - [ ] Link issue to task
  - [ ] Update documentation if needed
- [ ] Continue current work (don't block on issue)
```

## Key Takeaways

| Aspect               | Lesson                                          |
| -------------------- | ----------------------------------------------- |
| **Documentation**    | Always verify vs implement                      |
| **Issue tracking**   | Document problems found during work             |
| **Task-Issue link**  | Track both work AND problems                    |
| **Daemon awareness** | Verify daemon saw your input                    |
| **Workflow gaps**    | Distinguish task-queue vs conversational models |

## Related Files Created/Modified

| File                                                | Action  | Purpose                           |
| --------------------------------------------------- | ------- | --------------------------------- |
| `src/db/migrations/029_issue_tracking.sql`          | Created | Issue tracking schema             |
| `docs/ISSUE_TRACKING.md`                            | Created | Documentation with best practices |
| `Read_First.md`                                     | Updated | Added issue tracking reference    |
| `.tmp/issues/2026-03-20_unimplemented-functions.md` | Kept    | Fallback for AI without DB access |
| `issues` table                                      | Created | First issue logged                |

## TODO: Secondary Problem

Create issue for daemon communication gap:

```sql
SELECT create_issue(
    'Daemon AI cannot detect user questions in separate sessions',
    'When user asks question in new session, daemon AI doesn''t notice. User must re-ask or explicitly notify daemon. This appears to be a workflow gap - Nezha is task-queue based, not conversational.',
    'bug',
    'medium',
    'nezha',
    ARRAY['workflow', 'communication'],
    '{}'
);
```

---

**Case Study Author**: opencode AI  
**Last Updated**: 2026-03-20
