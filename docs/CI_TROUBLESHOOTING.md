# CI/CD Troubleshooting Guide

> Common issues and solutions for Nezha's GitHub Actions CI workflow

---

## 1. Overview

Nezha uses GitHub Actions for continuous integration. The CI workflow runs on every push to `main` and `develop` branches, and on all pull requests.

### 1.1 CI Workflow Location

```
.github/workflows/ci.yml
```

### 1.2 CI Pipeline Stages

```
┌─────────────────────────────────────────────────────────────┐
│                    CI Pipeline                               │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Checkout  │───►│  Setup Node │───►│   Install   │     │
│  │    Code     │    │    v22      │    │  Dependencies│     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │              │
│         ▼                  ▼                  ▼              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Typecheck   │───►│    Tests    │───►│   Build     │     │
│  │  (tsc)      │    │  (vitest)   │    │  (tsc)      │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Current CI Failures

### 2.1 Issue Summary

| Metric | Value |
|--------|-------|
| Total Errors | 20 |
| Affected Files | 2 test files |
| Error Type | TypeScript strict mode violations |

### 2.2 Failing Files

| File | Error Count | Error Types |
|------|-------------|-------------|
| `src/tests/AlertService.test.ts` | 12 | Possibly undefined |
| `src/tests/DatabaseClient.test.ts` | 8 | Possibly undefined, type mismatch |

### 2.3 Detailed Errors

#### AlertService.test.ts (12 errors)

```typescript
// Line 56: 'alert' is possibly 'undefined'
expect(alert!.alertType).toBe(AlertType.TASK_TIMEOUT);

// Line 63: 'alert2' is possibly 'undefined'
expect(alert2!.alertType).toBe(AlertType.TASK_TIMEOUT);

// Lines 104, 105, 121, 135, 136, 144, 145, 153, 271, 272:
// Object is possibly 'undefined'
expect(alerts[0]!.alertType).toBe(AlertType.REPEATED_FAILURE);
```

**Root Cause**: Array access returns `T | undefined` in strict TypeScript mode, even with non-null assertion operator (`!`).

#### DatabaseClient.test.ts (8 errors)

```typescript
// Line 25: Unknown property 'getAppConfig'
const config: IConfig = {
  getAppConfig: () => ({ ... }),
};

// Lines 117, 118, 119: Type 'undefined' is not assignable to type 'number'
expect(result.rows[0].count).toBe(1);
//                     ^^^^^^^^ TypeScript: possibly undefined

// Lines 229, 230, 231, 273: 'call' is possibly 'undefined'
expect(mock.calls[0]).toEqual(['SELECT * FROM tasks']);
//             ^^^^^ TypeScript: possibly undefined
```

**Root Cause**: Mock objects and database query results need proper type guards.

---

## 3. Why CI Fails

### 3.1 TypeScript Strict Mode

The project uses TypeScript strict mode:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 3.2 CI Workflow Configuration

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck  # This fails
      - run: npm run test
      - run: npm run test:coverage

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

### 3.3 Failure Notification

When CI fails, GitHub sends emails with subject lines like:

```
CI workflow fail for nezha
```

---

## 4. Solutions

### 4.1 Solution 1: Fix Test Files (Recommended)

Add proper null checks and type guards:

```typescript
// Before (failing)
expect(alerts[0]!.alertType).toBe(AlertType.REPEATED_FAILURE);

// After (fixed)
const alert = alerts[0];
if (!alert) {
  throw new Error('Expected alert to exist');
}
expect(alert.alertType).toBe(AlertType.REPEATED_FAILURE);
```

Or use optional chaining with fallback:

```typescript
expect(alerts[0]?.alertType).toBe(AlertType.REPEATED_FAILURE);
```

### 4.2 Solution 2: Exclude Tests from Typecheck

Modify `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true
  },
  "exclude": [
    "node_modules",
    "dist",
    "src/tests"
  ]
}
```

**Pros**: Quick fix
**Cons**: Loses type safety in tests

### 4.3 Solution 3: Separate Test Typecheck

Create separate tsconfig for tests:

```json
// tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": false,
    "noUncheckedIndexedAccess": false
  },
  "include": ["src/tests/**/*.ts"]
}
```

Update package.json:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "typecheck:tests": "tsc --noEmit -p tsconfig.test.json"
  }
}
```

Update CI workflow:

```yaml
- run: npm run typecheck
- run: npm run typecheck:tests
```

---

## 5. Prevention

### 5.1 Pre-commit Hooks

Install husky and lint-staged:

```bash
npm install --save-dev husky lint-staged
npx husky init
```

Configure `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run typecheck
npm run test
```

### 5.2 Local Testing Before Push

Always run locally before pushing:

```bash
# Run typecheck
npm run typecheck

# Run tests
npm run test

# Run full CI pipeline locally
npm run typecheck && npm run test && npm run build
```

### 5.3 GitHub Actions Local Testing

Use act to test GitHub Actions locally:

```bash
# Install act
brew install act

# Run CI workflow locally
act push
```

---

## 6. Troubleshooting Steps

### 6.1 When CI Fails

1. **Check the error log**
   ```bash
   # View GitHub Actions log
   # Repository → Actions → Click failed workflow
   ```

2. **Reproduce locally**
   ```bash
   npm run typecheck
   ```

3. **Fix the errors**
   - Add null checks
   - Update types
   - Fix type mismatches

4. **Test locally**
   ```bash
   npm run typecheck && npm run test
   ```

5. **Push fix**
   ```bash
   git add .
   git commit -m "fix: resolve TypeScript errors in tests"
   git push
   ```

### 6.2 Common Error Patterns

| Error | Solution |
|-------|----------|
| `Object is possibly 'undefined'` | Add null check or use optional chaining |
| `Property does not exist on type` | Update type definition or cast |
| `Type 'undefined' is not assignable` | Provide default value or check for undefined |
| `Argument of type X is not assignable to Y` | Add type assertion or fix type mismatch |

---

## 7. CI Best Practices

### 7.1 Before Pushing

- [ ] Run `npm run typecheck`
- [ ] Run `npm run test`
- [ ] Run `npm run build`
- [ ] Review git diff for test files

### 7.2 Commit Message Guidelines

Use conventional commits:

```
fix: resolve TypeScript errors in AlertService.test.ts
test: add null checks for array access
refactor: improve type safety in DatabaseClient.test.ts
```

### 7.3 Branch Protection Rules

Configure branch protection in GitHub:

```
Settings → Branches → Add rule
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Require pull request reviews
```

---

## 8. Monitoring CI Status

### 8.1 Check CI Status

```bash
# Using GitHub CLI
gh run list

# View specific run
gh run view <run-id>

# Watch logs
gh run view <run-id> --log
```

### 8.2 CI Badges

Add to README.md:

```markdown
![CI](https://github.com/your-org/nezha/actions/workflows/ci.yml/badge.svg)
```

---

## 9. Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vitest Documentation](https://vitest.dev/)
- [Husky Documentation](https://typicode.github.io/husky/)

---

## 10. Quick Reference

```bash
# Run typecheck
npm run typecheck

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Build project
npm run build

# Run full CI pipeline locally
npm run typecheck && npm run test && npm run build

# Check CI status
gh run list

# View CI logs
gh run view <run-id> --log
```

---

_This document is part of the Nezha project documentation._
_Last updated: 2026-03-19_
