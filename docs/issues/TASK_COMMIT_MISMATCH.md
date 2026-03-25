# Issue: Task/Commit Mismatch Pattern

**Date:** 2026-03-21
**Status:** Partially Resolved (2026-03-25)
**Severity:** Medium

## Problem

AI agents frequently submit commits that don't match the task description, causing:

- Wasted review cycles (10+ duplicate reviews)
- Incorrect code changes (MarkdownKnowledgeLoader cleanup instead of tests)
- Missing deliverables (no tests added despite P1 priority)

## Examples

| Task Description                               | Actual Commit                         |
| ---------------------------------------------- | ------------------------------------- |
| "Add tests for services without coverage"      | MarkdownKnowledgeLoader API cleanup   |
| "Research OpenClaw automation features"        | REFLECTION_TEMPLATES.md doc           |
| "Improve network error handling"               | Parameter removal from importFile()   |
| "DLQ: Add tests for services without coverage" | OpenClaw research (correct this time) |

## Root Cause

When AI can't access required resources or is unsure how to proceed:

1. It makes random unrelated changes instead of escalating
2. It retries without addressing the actual problem
3. It doesn't verify task/commit alignment before submitting

## Impact

- **P1 Test Coverage Goal (80%)** not progressing
- Multiple wasted review cycles
- Task descriptions become meaningless after repeated mismatches
- AI agents appear confused/incompetent

## Recommendations

### For AI Agents

1. **Verify task/commit alignment** before completing any task

   ```
   Task: "Add tests for..."
   Commit should: Add test files in src/tests/
   ```

2. **Escalate when stuck** - don't make random changes

   ```
   If: Cannot access ../openclaw files
   Then: Document limitation, ask for clarification
   Don't: Submit unrelated code
   ```

3. **Check permissions upfront** for research tasks
   ```
   Research tasks should:
   - Verify file access before starting
   - Request permissions if needed
   - Produce documentation matching the task
   ```

### For Task System

1. **Add pre-flight checks**
   - Validate task description matches expected file types
   - Warn if commit doesn't contain expected patterns

2. **Track mismatch rate**
   - Count task/commit mismatches
   - Flag patterns of failure

3. **Kill stuck tasks**
   - After 2+ retries with same wrong commit, escalate/cancel
   - Don't allow 4x retries of same failure

## Action Items

- [x] Implement pre-flight validation via quality control hook (2026-03-25)
- [x] Add mismatch detection via database ID verification
- [ ] Update task descriptions to be more specific
- [ ] Create "how to escalate" documentation

## Resolution Notes (2026-03-25)

The `prepare-commit-msg` hook now enforces that all commits must contain valid task/issue/inter-review IDs. This prevents random commits but does NOT verify that the commit content matches the task description. Additional task-content alignment checks remain as future work.

## Related

- AGENTS.md: "AI 自主决策原则"
- SOP.md: Decision documentation
