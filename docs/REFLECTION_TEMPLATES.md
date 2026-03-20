# Reflection Templates

> Pre-built reflection templates for common scenarios

## Usage

Use these templates with the `trae-reflect` CLI command:

```bash
node dist/cli/index.js trae-reflect "[LEARN] insight: Your insight context: Context"
```

## Template Categories

### 1. Bug Fix Reflection

```
[LEARN] insight: Fixed bug in <component> - root cause was <cause>
context: <file>:<line> - <description>

[ISSUE] title: Similar bugs may exist in <related area>
type: bug severity: medium
```

### 2. Feature Implementation Reflection

```
[LEARN] insight: Implemented <feature> using <approach>
context: <files changed> - <key decisions>

[PROMPT_UPDATE] current: <old approach>
suggested: <new approach>
reason: <why this is better>
```

### 3. Performance Optimization Reflection

```
[LEARN] insight: Optimized <component> - <metric> improved by <percentage>%
context: Before: <old metric>, After: <new metric>

[LEARN] insight: Key optimization technique: <technique>
context: Applied to <component>
```

### 4. Error Handling Reflection

```
[LEARN] insight: Added error handling for <error type> in <component>
context: <error scenario> - <recovery action>

[ISSUE] title: Need similar error handling in <related components>
type: improvement severity: low
```

### 5. Test Coverage Reflection

```
[LEARN] insight: Added tests for <component> - now at <percentage>% coverage
context: <test scenarios covered>

[ISSUE] title: Missing tests for <edge case>
type: test severity: medium
```

### 6. Documentation Reflection

```
[LEARN] insight: Documented <component/feature> in <file>
context: <what was documented>

[PROMPT_UPDATE] current: <old documentation approach>
suggested: <new documentation approach>
reason: <why this is better>
```

### 7. Refactoring Reflection

```
[LEARN] insight: Refactored <component> - improved <quality metric>
context: <before state> -> <after state>

[LEARN] insight: Refactoring pattern used: <pattern name>
context: <how it was applied>
```

### 8. Security Reflection

```
[LEARN] insight: Fixed security issue in <component> - <vulnerability type>
context: <file>:<line> - <fix applied>

[ISSUE] title: Security review needed for <related components>
type: security severity: high
```

### 9. Dependency Update Reflection

```
[LEARN] insight: Updated <dependency> from <old version> to <new version>
context: <breaking changes> - <migration steps>

[ISSUE] title: Other dependencies may need similar updates
type: maintenance severity: low
```

### 10. Architecture Decision Reflection

```
[LEARN] insight: Chose <approach> for <feature> over <alternatives>
context: <reasoning> - <trade-offs>

[PROMPT_UPDATE] current: <old architectural approach>
suggested: <new architectural approach>
reason: <why this is better>
```

## Quick Reference

| Marker | Purpose | When to Use |
|--------|---------|-------------|
| `[LEARN]` | Save insights | After completing any work |
| `[PROMPT_UPDATE]` | Suggest prompt changes | When you find a better approach |
| `[ISSUE]` | Report issues | When you find problems to fix later |

## Best Practices

1. **Be Specific**: Include file names, line numbers, and concrete details
2. **Include Context**: Explain why something was done
3. **Use Multiple Markers**: Combine learnings, prompt updates, and issues as needed
4. **Save Immediately**: Run trae-reflect right after completing work
5. **Review Trends**: Use `get_reflection_trends()` to see patterns

## Example Session

```bash
# After fixing a bug
node dist/cli/index.js trae-reflect "[LEARN] insight: Fixed null pointer in UserService - added null check before accessing user.profile context: src/services/UserService.ts:142"

# After implementing a feature
node dist/cli/index.js trae-reflect "[LEARN] insight: Implemented caching using Redis with 5min TTL context: src/services/CacheService.ts [PROMPT_UPDATE] current: No caching suggested: Add Redis caching for frequently accessed data reason: Reduces database load by 80%"

# After finding an issue
node dist/cli/index.js trae-reflect "[ISSUE] title: Missing input validation in API endpoints type: bug severity: high description: Need to add validation for all user inputs"
```

---

*These templates help maintain consistency in reflections and ensure valuable knowledge is captured.*
