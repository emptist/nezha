# Git Commit Message Pollution - Known Issue

**Date:** 2026-03-20
**Status:** Documented - Plugin Fixed

## Problem

Git history contains 228 duplicate commit messages due to `GitAutoCommitPlugin` bug.

Example duplicate messages:

- "docs: Add database-first principle for AI communication in PHILOSOPHY.md" (19 times)
- "fix: Auto-fix some lint errors with --fix" (multiple times)
- "Task completed: Test Task" (multiple times)

## Root Cause

In `src/plugins/GitAutoCommitPlugin.ts`, the `getCommittedMessage()` method incorrectly reads the **last commit's** message instead of extracting a conventional commit message from the **staged diff**.

Original buggy code (lines 76-99):

```typescript
private getCommittedMessage(): string | null {
  // ...
  const lastCommit = execSync('git log -1 --format=%B', ...); // BUG: reads LAST commit
  // ...
}
```

## Fix Applied

Changed `getCommittedMessage()` to extract conventional commit messages from the staged diff instead:

```typescript
private getCommittedMessage(): string | null {
  const stagedDiff = execSync('git diff --cached', ...);
  const conventionalPrefixes = ['feat:', 'fix:', 'docs:', ...];

  for (const line of stagedDiff.split('\n')) {
    for (const prefix of conventionalPrefixes) {
      if (line.trim().startsWith(prefix)) {
        return line.trim();
      }
    }
  }
  return null;
}
```

## History Rewrite

**NOT done** - Git history rewrite was not performed because:

1. `git filter-branch` times out on this repo
2. `git-filter-repo` requires system installation
3. Risk of losing work if something goes wrong

**Alternative approach:** Document as known issue, accept current history.

## Prevention

Plugin fix ensures future commits will have unique messages when changes actually contain conventional commit comments.

## Verification

After plugin fix:

```bash
git log --oneline | head -20
```

Should show unique messages for future commits.
