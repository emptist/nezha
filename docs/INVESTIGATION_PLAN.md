# Git Incident Investigation Plan

## Related Documents

- [GIT_INCIDENT_2026-03-20.md](./GIT_INCIDENT_2026-03-20.md) - Main incident report

## Current State

**Branch:** `git-incident`
**Status:** ✅ Committed - pushed to remote
**File:** `docs/GIT_INCIDENT_2026-03-20.md` - Main incident documentation

---

## Phase 1 Findings (Investigation - Read Only)

### Git Operations Found in Codebase

| File | Operations | Risk Level |
|------|------------|------------|
| `GitAutoCommitPlugin.ts` | `git add`, `git commit`, `git push` | Medium (commit message bug found & fixed) |
| `HeartbeatService.ts` | `git rev-parse` | Low (read-only) |
| `InterReviewService.ts` | `git diff` | Low (read-only) |
| `BroadcastService.ts` | `git rev-parse` | Low (read-only) |
| `ActivityLogService.ts` | `git rev-parse` | Low (read-only) |
| `Scheduler.ts` | `git rev-parse` | Low (read-only) |
| `InterReviewCommands.ts` | `git log`, `git diff` | Low (read-only) |
| `AutoReviewService.ts` | `git rev-parse`, `git diff` | Low (read-only) |
| `ClawHubClient.ts` | `git clone` | Low (read-only) |

### Dangerous Operations NOT in Code

| Operation | Status |
|-----------|--------|
| `git filter-branch` | ❌ NOT in code - run by AI externally |
| `git rebase` | ❌ NOT in code |
| `git push --force` | ❌ NOT in code |
| `git reset --hard` | ❌ NOT in code |

### Key Findings

1. **GitAutoCommitPlugin Bug (FIXED)**: The `getCommittedMessage()` method was extracting commit messages from file content instead of actual commit messages. This caused commit message pollution.

2. **Filter-Branch (EXTERNAL)**: The AI ran `git filter-branch` externally - NOT from Nezha code. This was a manual intervention by the AI that went wrong.

3. **All files are SAFE**: The files reported as "deleted" actually exist and are tracked in git. System reminders were misleading.

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
| 2026-03-20 | 1 | Document all git operations | ✅ Done |
| 2026-03-20 | 1 | Identify AI agents with git access | ⏳ Pending |
| 2026-03-20 | 1 | Map commit pollution timeline | ⏳ Pending |
| 2026-03-20 | 1 | Analyze real vs polluted commits | ⏳ Pending |
| 2026-03-20 | 2 | Risk assessment | ⏳ Pending |
| 2026-03-20 | 2 | Find filter-branch trigger | ⏳ Pending |
| 2026-03-20 | 3 | Implement safeguards | ⏳ Pending |
| 2026-03-20 | 4 | Cleanup (when ready) | ⏳ Pending |

---

## Next Session - Continue From Here

### Immediate Next Steps (Phase 1.3 - 1.4)

1. **Identify AI agents with git access**:
   - Search for OpenCode client integration
   - Check task execution flow
   - Find where AI can run shell commands

2. **Map commit pollution timeline**:
   - Find first polluted commit
   - Track the pattern of pollution
   - Identify the fix commit (7df03c1)

3. **Analyze real vs polluted commits**:
   - Find commits with actual work (not "Task completed:")
   - Document real feature commits
   - Count pollution severity

### Key Files to Investigate

- `src/core/OpenCodeClient.ts` - How AI executes tasks
- `src/core/UnifiedAgent.ts` - Agent communication
- `src/core/Scheduler.ts` - Task scheduling
- `src/services/HeartbeatService.ts` - Task execution

### Git Commands for Investigation (Safe - Read Only)

```bash
# Find first polluted commit
git log --oneline --all | grep "Task completed:" | tail -1

# Count pollution
git log --oneline --all | grep -c "Task completed:"

# Show timeline
git log --oneline --all --reverse --date-order | head -50
```
