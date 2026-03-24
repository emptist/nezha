# Plan: Rename Misleading `reflect` Variable

## Problem

The variable name `reflect` in cli.ts misleads AIs into thinking "reflect" is a subcommand:

```typescript
const reflect = new AtmReflect();
await reflect.reflect(text);  // Looks like "reflect reflect" pattern
```

This caused me to incorrectly try commands like:
- `node dist/cli.js reflect --input "..."`
- `node dist/cli.js atmReflect --input "..."`

## Solution

Rename `reflect` to `atmReflect` for clarity:

```typescript
const atmReflect = new AtmReflect();
await atmReflect.reflect(text);  // Clear: instance.method()
```

## Files Changed

| File | Line | Old | New |
|------|------|-----|-----|
| cli.ts | 40 | `const reflect = new AtmReflect()` | `const atmReflect = new AtmReflect()` |
| cli.ts | 43 | `await reflect.connect()` | `await atmReflect.connect()` |
| cli.ts | 46 | `await reflect.checkPendingWork()` | `await atmReflect.checkPendingWork()` |
| cli.ts | 55 | `await reflect.getRecentLearnings(10)` | `await atmReflect.getRecentLearnings(10)` |
| cli.ts | 62 | `await reflect.checkPendingTasks()` | `await atmReflect.checkPendingTasks()` |
| cli.ts | 66 | `await reflect.reflect(text)` | `await atmReflect.reflect(text)` |
| cli.ts | 89 | `await reflect.disconnect()` | `await atmReflect.disconnect()` |

## Additional Fix

Made `checkPendingTasks()` public in `AtmReflect.ts` to fix pre-existing bug where `--post-commit` option called a private method.

## Risk Assessment

- **Risk Level**: LOW
- **Scope**: Local variable only, not exported
- **Dependencies**: None
- **Breaking Changes**: None

## Verification Steps

1. Run TypeScript compiler: `npm run build` ✅
2. Manual test: `atmReflect "[LEARN] insight: test"` ✅

## Status

- [x] PLAN: Complete
- [x] DO: Apply changes
- [x] CHECK: Run tests
- [x] ACT: Commit

---

*Vibe-Author: bot_b17225f3-23e8-48a7-b009-924cfb8bb551*
