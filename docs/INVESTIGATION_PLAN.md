# Git Incident Investigation Plan

## Current State

**Branch:** `git-incident`
**Status:** ✅ Commit exists - `1dcee3a` with the incident report
**File:** `docs/GIT_INCIDENT_2026-03-20.md` is committed

---

## Proposed 4-Phase Plan

### Phase 1: Investigation (Safe - Read Only)

- [ ] Document all git operations in the codebase
- [ ] Identify all AI agents that can run git commands
- [ ] Map out the commit history pollution timeline
- [ ] Analyze which commits are "real" vs "polluted"

### Phase 2: Risk Assessment (Safe)

- [ ] Identify which operations are dangerous (filter-branch, rebase, force-push)
- [ ] Find what triggered the AI to run filter-branch
- [ ] Understand the decision chain that led to the disaster
- [ ] Document the root cause chain

### Phase 3: Safeguards (Safe - No Git Write)

- [ ] Add safety checks to GitAutoCommitPlugin
- [ ] Implement git operation whitelisting
- [ ] Add confirmation prompts for dangerous operations
- [ ] Create backup before any history-modifying operation
- [ ] Add circuit breaker for AI-initiated git operations

### Phase 4: Cleanup (When Ready - With Full Backup)

- [ ] Create full backup of repository (local + remote)
- [ ] Test cleanup on a copy first
- [ ] Execute carefully with user approval
- [ ] Document the cleanup process for future reference

---

## Investigation Principles

1. **No dangerous git operations** - No filter-branch, rebase, or force-push during investigation
2. **Read-only analysis** - Use git log, diff, reflog only
3. **Document everything** - All findings go into the incident report
4. **User approval required** - Any write operations need explicit approval

---

## Progress Log

| Date | Phase | Task | Status |
|------|-------|------|--------|
| 2026-03-20 | 1 | Initial investigation | ✅ Done |
| 2026-03-20 | 1 | Document all git operations | ⏳ Pending |
| 2026-03-20 | 1 | Identify AI agents with git access | ⏳ Pending |
| 2026-03-20 | 2 | Risk assessment | ⏳ Pending |
| 2026-03-20 | 3 | Implement safeguards | ⏳ Pending |
| 2026-03-20 | 4 | Cleanup (when ready) | ⏳ Pending |
