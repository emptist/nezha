# AI Decision-Making Framework

> Decision rules for autonomous AI agents based on ReAct pattern

## Core Decision Loop (ReAct)

```
Thought → Action → Observation → Decision → Repeat
```

Every decision follows this cycle to avoid hallucination and ensure grounded reasoning.

## Decision Questions

For every potential action, answer these questions:

### 1. Utility Check (Is it useful?)

- Does this solve a real problem?
- Does it add measurable value?
- Is it aligned with current goals (from AGENTS.md)?

### 2. Risk Check (Will it cause problems?)

- Pre-mortem: What could go wrong?
- Does it break existing tests?
- Does it violate established patterns?
- Are there side effects?

### 3. Dependency Check (Should B be done after A?)

- What must be completed first?
- What blocks this change?
- Are prerequisites met?

### 4. Priority Check (When to do it?)

- Check AGENTS.md for P0/P1/P2 priority
- P0 blocks P1, P1 blocks P2
- Critical bugs > features > nice-to-haves

## Decision Rules

### Rule 1: Check OpenClaw First

```
Before implementing any feature, ask:
"Does OpenClaw do this? How?"
```

- If OpenClaw does it → follow their pattern
- If OpenClaw doesn't → lower priority, use AI judgment

### Rule 2: Verify Before Implementing

```
1. Read existing code patterns
2. Check tests for expected behavior
3. Run typecheck/lint
4. Then implement
```

### Rule 3: Small, Reversible Changes

```
- Prefer small PRs over large ones
- Can we rollback if it breaks?
- Is it backward compatible?
```

### Rule 4: Test Before Commit

```
1. Make change
2. Run typecheck
3. Run relevant tests
4. If all pass → commit
5. If any fail → fix or revert
```

### Rule 5: Learn from Outcomes

```
After every significant decision:
1. What worked?
2. What didn't?
3. What would I do differently?
4. Save to memory (memory_save)
```

## Decision Matrix

| Situation       | Action                                      |
| --------------- | ------------------------------------------- |
| Feature request | Check OpenClaw → Check priority → Implement |
| Bug report      | Check severity → Fix → Test → Commit        |
| Code review     | Check patterns → Suggest → Learn            |
| Refactoring     | Check test coverage → Refactor → Verify     |
| Unknown         | Search memory → Search codebase → Ask user  |

## Pre-Mortem Template

Before major decisions, complete this:

```
## Pre-Mortem Analysis

**Action:** [What we're considering]

**If it fails, what goes wrong?**
- [Side effect 1]
- [Side effect 2]

**How to prevent failure?**
- [Prevention 1]
- [Prevention 2]

**Contingency plan if it breaks:**
- [Plan A]
- [Plan B: Revert]

**Decision:** [Proceed / Modify / Skip]
```

## Examples

### Example 1: Adding new feature

```
Thought: User wants to add vector search (pgvector)
Utility: Yes, enables semantic memory search
Risk: Requires DB migration, adds dependency
Dependency: Migration must run first
Priority: P2 (from AGENTS.md)
Decision: Defer to after P0/P1 complete
```

### Example 2: Fixing a bug

```
Thought: Type errors in test files
Utility: Yes, improves type safety
Risk: Low, isolated to test files
Dependency: None
Priority: P1 (medium)
Decision: Fix in same session, run tests afterward
```

### Example 3: Code refactor

```
Thought: Improve error handling
Utility: Yes, reduces crashes
Risk: Medium, could break working code
Dependency: Need test coverage first
Priority: P1
Decision: Add tests first, then refactor incrementally
```

## Integration with Memory System

Save decision rationales:

```typescript
memory_save({
  content: 'Decision: Fixed ConversationLogger to pass dbClient to PostgreSQL',
  context: 'Needed for dual storage (JSONL + DB) to work',
  tags: ['architecture', 'database', 'conversation-logger'],
  source: 'decision',
  importance: 4,
});
```

## Summary

1. **Always use ReAct loop** - Think before acting
2. **Check utility, risk, dependencies** - Three questions rule
3. **Follow OpenClaw precedent** - Don't reinvent
4. **Test before commit** - Verify works
5. **Learn from outcomes** - Save decisions to memory

---

**Version:** 1.0  
**Based on:** ReAct Pattern (Yao et al., 2022), Chain of Thought, Reflexion
