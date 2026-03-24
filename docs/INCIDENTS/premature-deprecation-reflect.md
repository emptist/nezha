# Incident Report: Premature Deprecation of `reflect` Command

**Date:** 2026-03-22  
**Severity:** Low (caught before deployment)  
**Type:** Incorrect feature understanding

## Summary

An AI session attempted to deprecate the `reflect` CLI command, suggesting users switch to `announce`. This was incorrect because `reflect` and `announce` have **different features**.

## What Happened

1. User asked about the difference between `reflect` and `atmReflect`
2. AI researched git history and found naming was confusing
3. AI suggested adding `broadcast` as alias for `reflect`
4. User pointed out `broadcast` already exists (as `announce`)
5. AI confused the commands and attempted to add deprecation warning to `reflect`
6. User corrected the AI: `reflect` saves to memory, `announce` doesn't

## Correct Understanding

| Command    | Broadcasts | Saves to Memory | Priority Option | Target Option |
| ---------- | ---------- | --------------- | --------------- | ------------- |
| `share`    | ✅         | ✅              | ❌              | ❌            |
| `announce` | ✅         | ❌              | ✅              | ✅            |

**Key insight:** `reflect` does MORE than `announce` (it saves to memory). Deprecating it would lose functionality.

## Lesson Learned

**Before suggesting deprecation or replacement of any command:**

1. **Read the actual code** - Don't assume based on names
2. **Compare feature sets** - Check what each command actually does
3. **Check for existing aliases** - `announce` already existed
4. **Ask "what will be lost?"** - `reflect` saves to memory

## Checklist for Future Command Changes

- [ ] Read source code of both commands
- [ ] List all features of each command
- [ ] Check if any feature is unique to one command
- [ ] Look for existing aliases
- [ ] Document what would be lost by deprecation
- [ ] Get user confirmation before proceeding

## What To Do If Confused

1. **Don't guess** - Read the code
2. **Ask user** - "What does X command do?"
3. **Check docs** - `docs/AboutTaskReflections.md`
4. **Test locally** - Run the command and observe behavior
5. **Compare outputs** - Check what gets saved to database

## Related

- `share` command: broadcasts + saves to memory (renamed from `reflect`)
- `announce` command: broadcasts with priority/target
- `atmReflect` command: parses structured markers, saves to DB
- Issue: #poorly-named-commands
