# Proposal: gitAutoCommitPlugin Workflow Enforcement

## Problem

Code can be committed without going through a traceable workflow:

```
Current:  [random change] → commit
Desired:  [issue] → plan → implement → review → commit
```

## Evidence

The `reported_by` bug (migration 056) was committed without:
- Issue report
- Plan document
- Schema verification

Result: We cannot determine WHY the wrong column name was used.

## Proposed Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     REQUIRED WORKFLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. ISSUE        Create issue describing problem/feature    │
│        ↓                                                     │
│  2. PLAN         Document approach, affected files          │
│        ↓                                                     │
│  3. IMPLEMENT    Write code changes                         │
│        ↓                                                     │
│  4. INTER-REVIEW Self-review or peer review                 │
│        ↓                                                     │
│  5. COMMIT       gitAutoCommitPlugin validates workflow     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## gitAutoCommitPlugin Responsibilities

### Pre-Commit Validation

| Check | Description | Enforcement |
|-------|-------------|-------------|
| Issue exists | Changes linked to an issue | Block if missing |
| Plan exists | Approach documented | Block if missing |
| Review done | Inter-review completed | Block if skipped |
| Vibe-Author | AI identity in commit | Auto-add trailer |

### Commit Message Format

```
<type>: <subject>

<body>

Issue: #<issue-id>
Plan: reviews/plan-xxx.md
Reviewed-by: <reviewer-id>
Vibe-Author: bot_xxx
```

## Implementation Phases

### Phase 1: Detection (Soft)
- Log commits without workflow
- Send reminders
- Don't block

### Phase 2: Warning (Medium)
- Require issue ID in commit message
- Warn if missing plan/review
- Still allow commit

### Phase 3: Enforcement (Hard)
- Block commits without issue
- Block commits without plan
- Block commits without review

## Benefits

| Benefit | Description |
|---------|-------------|
| Traceability | Every change has documented intent |
| Accountability | Know WHO made WHAT and WHY |
| Learning | Future AIs can understand decisions |
| Quality | Review step catches bugs early |

## Related Issues

- `audit_direct_insert.md` - The bug that revealed this gap
- `plan-rename-reflect-variable.md` - Example of proper workflow
- Vibe-Author proposal - AI identity in commits

## Status

- [ ] Proposal documented
- [ ] Implementation planned
- [ ] Phase 1 implemented
- [ ] Phase 2 implemented
- [ ] Phase 3 implemented

---

*Created: 2026-03-24*
*Vibe-Author: bot_b17225f3-23e8-48a7-b009-924cfb8bb551*
