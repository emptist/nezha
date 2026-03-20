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
| 2026-03-20 | 2 | Risk assessment | ✅ Done |
| 2026-03-20 | 2 | Find filter-branch trigger | ✅ Done |
| 2026-03-20 | 2 | Document decision chain | ✅ Done |
| 2026-03-20 | 2 | Document safeguards needed | ✅ Done |
| 2026-03-20 | 3 | Implement GitSafetyService | ⏳ Pending |
| 2026-03-20 | 3 | Update OpenCodeClient with safety | ⏳ Pending |
| 2026-03-20 | 3 | Update GitAutoCommitPlugin validation | ⏳ Pending |
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

## Phase 2 Complete Findings

### Decision Chain Reconstruction (from reflog)

| Time | Event | Commit | Details |
|------|-------|--------|---------|
| 13:39:30 | First fix attempt | `6010ed6` | "fix: Improve GitAutoCommitPlugin message detection" - didn't fully work |
| 13:40:21 | Filter-branch attempt | `b15f45b` | AI tried to rewrite history with bash script |
| ~13:40:30 | Abort | - | AI realized filter-branch made things worse |
| ~13:40:30 | Reset | `57fe705` | AI reset to last good commit |
| 14:45:30 | Real fix | `7df03c1` | "fix: GitAutoCommitPlugin - only parse code after hunk markers" |

### Filter-Branch Script Analysis

The AI created a bash script to rewrite commit messages:
```bash
#!/bin/bash
# Filter script for git filter-branch to fix commit messages
# Had a case statement mapping commit hashes to correct messages
```

**Why it failed**: The script was incomplete and the filter-branch operation corrupted history instead of fixing it.

### Root Cause Chain

```
GitAutoCommitPlugin Bug
        ↓
180 polluted commits created
        ↓
AI detected pollution
        ↓
AI attempted first fix (incomplete)
        ↓
AI decided filter-branch was needed
        ↓
Filter-branch made things worse
        ↓
AI aborted and reset
        ↓
AI committed correct fix
```

### Safeguards Recommended

| Safeguard | Priority | Implementation |
|-----------|----------|----------------|
| **Dangerous operations blacklist** | HIGH | Block `filter-branch`, `rebase`, `push --force` in OpenCode context |
| **Pre-operation backup** | HIGH | Auto-backup before any git write operation |
| **Human approval for history rewrite** | HIGH | Require explicit user consent for `filter-branch`, `rebase` |
| **Commit message validation** | MEDIUM | Validate commit messages before accepting |
| **Git operation logging** | MEDIUM | Log all git operations for audit trail |

### Implementation Plan (Phase 3)

1. **Create GitSafetyService.ts**
   - Whitelist safe operations: `add`, `commit`, `push` (normal), `status`, `diff`, `log`
   - Blacklist dangerous operations: `filter-branch`, `rebase`, `push --force`, `reset --hard`
   - Require backup before dangerous operations

2. **Update OpenCodeClient.ts**
   - Add safety check before spawning OpenCode
   - Pass safety context to OpenCode
   - Log all operations

3. **Update GitAutoCommitPlugin.ts**
   - Add pre-commit validation
   - Ensure commit message is meaningful
   - Add fallback for edge cases

---

## Next Session - Continue From Here

### Phase 1 & 2 Complete ✅

All investigation tasks are done. The root cause chain is fully documented:
1. **Root cause**: GitAutoCommitPlugin bug + OpenCode AI's bad decision to use filter-branch
2. **Decision chain**: Reconstructed from reflog
3. **Safeguards**: Documented and prioritized

### Immediate Next Steps (Phase 3 - Implement Safeguards)

1. **Create GitSafetyService.ts**:
   - Implement operation whitelist/blacklist
   - Add backup functionality
   - Add logging

2. **Update OpenCodeClient.ts**:
   - Add safety context
   - Log operations

3. **Update GitAutoCommitPlugin.ts**:
   - Add commit message validation
   - Add fallback mechanisms

### Key Files to Create/Modify (Phase 3)

- `src/services/GitSafetyService.ts` - NEW: Safety service
- `src/core/OpenCodeClient.ts` - MODIFY: Add safety checks
- `src/plugins/GitAutoCommitPlugin.ts` - MODIFY: Add validation

### Git Commands for Phase 3 (Safe - Implementation)

```bash
# Create backup before any changes
mkdir -p .tmp/backup-$(date +%Y%m%d-%H%M%S)
cp src/core/OpenCodeClient.ts .tmp/backup-$(date +%Y%m%d-%H%M%S)/
cp src/plugins/GitAutoCommitPlugin.ts .tmp/backup-$(date +%Y%m%d-%H%M%S)/

# After changes, verify build
npm run build
npm test
```
