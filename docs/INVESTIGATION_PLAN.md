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
| 2026-03-20 | 1 | Identify AI agents with git access | ✅ Done |
| 2026-03-20 | 1 | Map commit pollution timeline | ✅ Done |
| 2026-03-20 | 1 | Analyze real vs polluted commits | ✅ Done |
| 2026-03-20 | 2 | Risk assessment | ⏳ Pending |
| 2026-03-20 | 2 | Find filter-branch trigger | ⏳ Pending |
| 2026-03-20 | 3 | Implement safeguards | ⏳ Pending |
| 2026-03-20 | 4 | Cleanup (when ready) | ⏳ Pending |

---

## Phase 1 Complete Findings

### AI Agents with Git Access

| Agent | Access Method | Capabilities | Risk |
|-------|---------------|--------------|------|
| **OpenCode AI** | `spawn('opencode', ...)` | Full shell access, can run ANY command | **HIGH** |
| **GitAutoCommitPlugin** | `execSync('git ...')` | add, commit, push only | Medium |
| **HeartbeatService** | `execSync('git rev-parse')` | Read-only | Low |
| **InterReviewService** | `execSync('git diff')` | Read-only | Low |

### Key Insight: OpenCode AI Has Unrestricted Shell Access

The `OpenCodeClient.ts` spawns OpenCode with full shell access:
```typescript
const proc = spawn('opencode', ['run', '--attach', serverUrl, '--format', 'json', prompt], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});
```

This means OpenCode AI can run **ANY** shell command, including:
- `git filter-branch` (what caused the incident)
- `git rebase`
- `git push --force`
- `rm -rf /` (theoretical)

**This is by design** - OpenCode needs shell access to do useful work. The issue is that it made a bad decision to run `git filter-branch`.

### Pollution Timeline

| Event | Commit | Date | Details |
|-------|--------|------|---------|
| First polluted commit | `2f8bb8b` | 2026-03-18 15:44:44 | "Task completed: Test Task" |
| Pollution duration | - | ~2 days | March 18-20 |
| Fix commit | `7df03c1` | 2026-03-20 14:45:30 | "fix: GitAutoCommitPlugin - only parse code after hunk markers" |

### Pollution Statistics

| Metric | Count |
|--------|-------|
| "Task completed: Test Task" commits | 180 |
| Total "Task completed:" commits | 216 |
| Legitimate task commits | ~36 (with actual task names) |

### Real vs Polluted Commits Analysis

**Polluted commits** (180): Generic "Task completed: Test Task" - no useful information
**Legitimate commits** (36): "Task completed: Update docs...", "Task completed: Add structured logging..." - useful context

---

## Next Session - Continue From Here

### Phase 1 Complete ✅

All Phase 1 tasks are done. The investigation has revealed:
1. **Root cause identified**: GitAutoCommitPlugin bug + OpenCode AI's bad decision
2. **Timeline mapped**: March 18-20, 2026
3. **Pollution quantified**: 180 generic commits, 36 legitimate

### Immediate Next Steps (Phase 2 - Risk Assessment)

1. **Find what triggered the AI to run filter-branch**:
   - Check conversation logs in `.tmp/conversations/`
   - Look for the task that led to filter-branch decision
   - Document the decision chain

2. **Understand the decision chain**:
   - What prompt was given to OpenCode?
   - What context did it have?
   - Why did it think filter-branch was the solution?

3. **Document safeguards needed**:
   - How to prevent AI from running dangerous git commands?
   - Should we add a "dangerous operations" blacklist?
   - Should we require human approval for certain operations?

### Key Files to Investigate (Phase 2)

- `.tmp/conversations/` - Conversation logs with OpenCode
- `.tmp/nezha-memory/` - Nezha's memory of the incident
- `src/plugins/GitAutoCommitPlugin.ts` - The fixed code

### Git Commands for Investigation (Safe - Read Only)

```bash
# View conversation logs
ls -la .tmp/conversations/

# View Nezha memory
cat .tmp/nezha-memory/MEMORY.md

# Check reflog for filter-branch evidence
git reflog | grep filter-branch
```
