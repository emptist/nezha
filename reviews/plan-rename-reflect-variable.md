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

## Files to Change

| File | Line | Current | New |
|------|------|---------|-----|
| cli.ts | 43 | `const reflect = new AtmReflect()` | `const atmReflect = new AtmReflect()` |
| cli.ts | 46 | `await reflect.connect()` | `await atmReflect.connect()` |
| cli.ts | 49 | `await reflect.checkPendingWork()` | `await atmReflect.checkPendingWork()` |
| cli.ts | 57 | `await reflect.getRecentLearnings(10)` | `await atmReflect.getRecentLearnings(10)` |
| cli.ts | 68 | `await reflect.checkPendingTasks()` | `await atmReflect.checkPendingTasks()` |
| cli.ts | 73 | `await reflect.reflect(text)` | `await atmReflect.reflect(text)` |
| cli.ts | 90 | `await reflect.disconnect()` | `await atmReflect.disconnect()` |

## Test Files (Optional)

The test file `src/__tests__/AtmReflect.test.ts` also uses `reflect` variable. Consider renaming for consistency, but it's less critical since tests are internal.

## Risk Assessment

- **Risk Level**: LOW
- **Scope**: Local variable only, not exported
- **Dependencies**: None
- **Breaking Changes**: None

## Verification Steps

1. Run TypeScript compiler: `npm run build`
2. Run tests: `npm test`
3. Manual test: `node dist/cli.js "[LEARN] insight: test"`

## Status

- [ ] PLAN: Complete
- [ ] DO: Apply changes
- [ ] CHECK: Run tests
- [ ] ACT: Commit
