# Git Incident Report - 2026-03-20

## Summary

On 2026-03-20, an OpenCode AI agent bot attempted to fix "polluted commit messages" using `git filter-branch`, which caused confusion about file status. This document tracks what happened and the current state.

## Files Status

All files reported as "deleted" in system reminders actually **exist and are tracked in git**:

| File | Status | Size | Last Commit |
|------|--------|------|-------------|
| `src/services/ActivityLogService.ts` | ✅ Exists | 7107 bytes | df3cb6b |
| `src/services/BroadcastService.ts` | ✅ Exists | 7151 bytes | df3cb6b |
| `src/cli/BroadcastCommands.ts` | ✅ Exists | 5706 bytes | df3cb6b |
| `src/db/migrations/036_issues_git_context.sql` | ✅ Exists | 2955 bytes | df3cb6b |
| `src/db/migrations/037_tasks_ai_tracking.sql` | ✅ Exists | 1261 bytes | 4bf049c |
| `src/db/migrations/038_fix_suggest_improvements.sql` | ✅ Exists | 2468 bytes | d634d35 |

## Backup Location

All files have been backed up to: `.tmp/backup-20260320/`

## Branch Status

| Branch | Status | Notes |
|--------|--------|-------|
| `glm-5-join-in` (current) | ✅ Usable | Has some "Task completed: Test Task" commits |
| `backup-polluted` | ⚠️ Corrupted | Created by filter-branch, has wrong messages |
| `interacting` | ✅ Clean | Last good commit: "Create Meeting-Participation skill" |

## Root Cause

### GitAutoCommitPlugin Bug
The plugin's `getCommittedMessage()` function scanned ALL diff lines including file headers, picking up conventional prefixes (`feat:`, `fix:`, `docs:`) from modified file content instead of actual commit messages.

### Fix Applied
Commit `7df03c1` fixed this by only parsing code after `@@` hunk markers.

## Timeline

1. **14:40** - OpenCode AI detected polluted commit messages
2. **14:44** - AI asked user to confirm `git filter-branch` operation
3. **User selected "Yes, fix now"** - Operation proceeded
4. **filter-branch created `backup-polluted` branch** as safety
5. **System reported files as "deleted"** - False alarm, files exist
6. **17:16** - Backup created to `.tmp/backup-20260320/`

## How Files Were Reported "Deleted"

### Source of Confusion
The system reminders showed:
```
Note: /Users/jk/gits/hub/nezha/src/services/ActivityLogService.ts was deleted by the user
Note: /Users/jk/gits/hub/nezha/src/services/BroadcastService.ts was deleted by the user
Note: /Users/jk/gits/hub/nezha/src/cli/BroadcastCommands.ts was deleted by the user
```

### Investigation Steps

1. **Checked git status** - Files not in unstaged list
2. **Searched filesystem** - Used `find` command:
   ```bash
   find . -name "ActivityLogService.ts" -o -name "BroadcastService.ts"
   ```
   Result: Files found at their original locations!

3. **Verified git tracking** - Used `git ls-files`:
   ```bash
   git ls-files src/services/ActivityLogService.ts
   ```
   Result: Files ARE tracked by git

4. **Checked git history** - Used `git log --all -- <file>`:
   ```bash
   git log --oneline --all -- src/services/ActivityLogService.ts
   ```
   Result: Files have commit history

### Why System Reported "Deleted"

The system reminders track **git staging area changes**, not actual file existence. When `git filter-branch` rewrites history:
1. It creates new commits with different hashes
2. The staging area comparison shows files as "changed"
3. System interpreted this as "deleted" incorrectly

### Protection Applied

**Backup created at:** `.tmp/backup-20260320/`

```bash
mkdir -p .tmp/backup-$(date +%Y%m%d)
cp src/services/ActivityLogService.ts .tmp/backup-20260320/
cp src/services/BroadcastService.ts .tmp/backup-20260320/
cp src/cli/BroadcastCommands.ts .tmp/backup-20260320/
cp src/db/migrations/036_issues_git_context.sql .tmp/backup-20260320/
cp src/db/migrations/037_tasks_ai_tracking.sql .tmp/backup-20260320/
cp src/db/migrations/038_fix_suggest_improvements.sql .tmp/backup-20260320/
```

**Backup contents:**
```
.tmp/backup-20260320/
├── 036_issues_git_context.sql    (2955 bytes)
├── 037_tasks_ai_tracking.sql     (1261 bytes)
├── 038_fix_suggest_improvements.sql (2468 bytes)
├── ActivityLogService.ts         (7107 bytes)
├── BroadcastCommands.ts          (5706 bytes)
└── BroadcastService.ts           (7151 bytes)
```

## Lessons Learned

1. **Always backup before git operations** - `.tmp/backup-YYYYMMDD/` pattern
2. **Verify file status independently** - Don't trust single source
3. **Test filter-branch on a copy first** - It can corrupt history
4. **Keep Smalltalk-style changes file** - Never lose code

## Deep Investigation Results

### Git Pollution Statistics
- **Total "Task completed: Test Task" commits**: 180
- **Total "Task completed:" commits**: 216
- **Branches affected**: `glm-5-join-in`, `interacting`, `backup-polluted`

### Root Cause Analysis

#### 1. GitAutoCommitPlugin Bug (Primary Cause)
The `getCommittedMessage()` method in [GitAutoCommitPlugin.ts](file:///Users/jk/gits/hub/nezha/src/plugins/GitAutoCommitPlugin.ts) had a critical bug:

**Before Fix:**
```typescript
// Scanned ALL diff lines including file headers
for (const line of diffLines) {
  const trimmed = line.trim();
  // Picked up 'docs:' from file content like "# PHILOSOPHY.md"
  for (const prefix of conventionalPrefixes) {
    if (content.startsWith(prefix)) {
      return content; // WRONG: returned content from file, not commit message
    }
  }
}
```

**After Fix (commit 7df03c1):**
```typescript
// Only parse code AFTER @@ hunk markers
let inHunkHeader = false;
for (const line of diffLines) {
  if (trimmed.startsWith('@@')) {
    inHunkHeader = true;
    continue;
  }
  // Skip diff metadata lines
  if (trimmed.startsWith('diff ') || trimmed.startsWith('index ') || 
      trimmed.startsWith('---') || trimmed.startsWith('+++')) {
    continue;
  }
  // Now only scan actual code changes
}
```

#### 2. Filter-Branch Disaster (Secondary Cause)
The OpenCode AI attempted to fix the pollution with `git filter-branch`, but:
- It **made things worse** - replaced many commits with wrong messages
- Created `backup-polluted` branch with corrupted history
- The filter-branch operation was aborted mid-way

**Evidence from reflog:**
```
b15f45b HEAD@{5}: filter-branch: rewrite
effa1ad HEAD@{6}: commit: Task completed: Test Task
```

#### 3. Dangerous Operations Found in Codebase

| Operation | Location | Risk Level | Status |
|-----------|----------|------------|--------|
| `git commit` | GitAutoCommitPlugin.ts | Medium | ✅ Fixed |
| `git push` | GitAutoCommitPlugin.ts | Medium | ✅ Has fallback |
| `git add -A` | GitAutoCommitPlugin.ts | Low | ✅ Normal |
| `git filter-branch` | NOT IN CODE | Critical | ⚠️ Run by AI |
| `git rebase` | NOT IN CODE | High | ✅ Not used |
| `git push --force` | NOT IN CODE | Critical | ✅ Not used |

### Timeline of Events

```
14:40 - OpenCode AI detected polluted commit messages
14:44 - AI asked user to confirm git filter-branch operation
       - User selected "Yes, fix now"
14:44 - filter-branch started, created backup-polluted branch
14:44 - filter-branch CORRUPTED history (wrong messages)
14:44 - AI aborted and reset to 57fe705
14:44 - AI committed fix (7df03c1) for GitAutoCommitPlugin
17:16 - Trae AI created backup of files
17:30 - Trae AI committed pending changes (39d1a47)
```

### Code Analysis: Git Operations in Nezha

**Safe Operations (Read-only):**
- `git status --porcelain` - Check for changes
- `git diff --cached` - Get staged changes
- `git rev-parse HEAD` - Get current commit hash
- `git branch --show-current` - Get current branch name
- `git log` - View history

**Potentially Dangerous Operations:**
- `git add -A` - Stages ALL changes (could include secrets)
- `git commit` - Creates commits (message pollution risk)
- `git push` - Pushes to remote (could expose sensitive data)

**NOT Present (Good):**
- No `git filter-branch`
- No `git rebase`
- No `git push --force`
- No `git reset --hard`

## Recommendations

1. Delete `backup-polluted` branch (corrupted)
2. Push current branch to remote
3. Consider implementing a "changes.log" file for critical code
4. Add pre-operation backup to GitAutoCommitPlugin

## Files Content Summary

### ActivityLogService.ts
- Purpose: Logs AI activities for tracking and analysis
- Key functions: `logActivity()`, `getRecentActivities()`, `getActivityStats()`
- Dependencies: DatabaseClient

### BroadcastService.ts
- Purpose: Broadcasts messages to all AIs in the system
- Key functions: `broadcast()`, `getUnreadBroadcasts()`, `markAsRead()`
- Features: Priority levels (low, normal, high, critical)

### BroadcastCommands.ts
- Purpose: CLI commands for broadcast system
- Commands: `broadcasts list`, `broadcasts unread`, `broadcasts read`
- Integration: Uses BroadcastService

### Migration 036 - issues_git_context.sql
- Adds git context columns to issues table
- Columns: git_hash, git_branch, environment

### Migration 037 - tasks_ai_tracking.sql
- Adds AI tracking columns to tasks table
- Columns: agent_id, agent_name, git_hash, git_branch, environment

### Migration 038 - fix_suggest_improvements.sql
- Fixes ambiguous column reference in suggest_improvements_from_failures function
- Qualifies column names with table aliases
