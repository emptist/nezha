# AI Collaboration Framework

> How Trae AI and OpenCode AI collaborate through Nezha

## Overview

Nezha enables **AI-to-AI collaboration** through its task system. Two different AI agents can work together, delegate tasks, and discuss decisions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEZHA COLLABORATION HUB                       │
│                                                                  │
│  ┌───────────────┐              ┌───────────────┐               │
│  │   Trae AI     │              │  OpenCode AI  │               │
│  │  (Reviewer)   │              │   (Executor)  │               │
│  │               │              │               │               │
│  │ - Review      │              │ - Execute     │               │
│  │ - Plan        │              │ - Report      │               │
│  │ - Delegate    │◄────────────►│ - Follow-up   │               │
│  │ - Verify      │              │ - Discuss     │               │
│  └───────┬───────┘              └───────┬───────┘               │
│          │                              │                        │
│          ▼                              ▼                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Task Queue                       │   │
│  │                                                          │   │
│  │  Tasks: PENDING → RUNNING → COMPLETED                    │   │
│  │  Discussions: Prefix with "Discussion:"                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Roles

| AI | Role | Responsibilities |
|----|------|-----------------|
| **Trae AI** | Reviewer | Review codebase, plan improvements, create tasks, verify results |
| **OpenCode AI** | Executor | Execute tasks, report results, create follow-up tasks |

## Communication Protocol

### Task Delegation

```bash
# Trae AI creates task for OpenCode AI
node dist/cli/index.js task-add "Task Title" "Description" <priority>

# OpenCode AI can create tasks for Trae AI too
node dist/cli/index.js task-add "Review Request: X" "Please review Y" <priority>
```

### Discussion Tasks

Prefix with `Discussion:` for collaborative decision-making:

```bash
node dist/cli/index.js task-add "Discussion: Topic" "Question for other AI" <priority>
```

### Task Format

```
**From**: [Trae AI | OpenCode AI]
**To**: [Trae AI | OpenCode AI]
**Context**: Background information
**Question/Action**: What needs discussion or action
**Priority**: 1-10
```

## Skill Separation Policy

### Why Separate Skills?

- **Trae AI** and **OpenCode AI** work differently
- They have different capabilities and workflows
- Skills should be optimized for each AI's strengths

### Storage Locations

| AI | Skills Location | Format |
|----|-----------------|--------|
| Trae AI | `.trae/skills/` | Markdown files |
| OpenCode AI | PostgreSQL `skills` table | Database records |

### Copy Direction

```
┌─────────────┐
│   Nezha     │
│  Database   │
│   Skills    │
└──────┬──────┘
       │
       │ One-way copy
       │ (Nezha → Trae)
       ▼
┌─────────────┐
│    Trae     │
│   Skills    │
│  .trae/     │
└─────────────┘

❌ NO reverse copy (Trae → Nezha)
```

### Rationale

1. **Nezha skills** are tested by OpenCode AI execution
2. **Trae skills** are optimized for Trae's workflow
3. Copying Nezha → Trae allows Trae to benefit from tested skills
4. Not copying Trae → Nezha prevents untested skills from affecting OpenCode

## Workflow

### Trae AI Workflow (PDCA)

```
REVIEW → PLAN → DO → CHECK → ACT → REVIEW → ...
```

1. **REVIEW**: Analyze codebase, check task queue
2. **PLAN**: Identify improvements, create tasks
3. **DO**: Delegate to OpenCode AI via tasks
4. **CHECK**: Verify completed work
5. **ACT**: Update memory, continue cycle

### OpenCode AI Workflow

```
PICK → EXECUTE → REPORT → FOLLOW-UP → PICK → ...
```

1. **PICK**: Get next pending task
2. **EXECUTE**: Perform the task
3. **REPORT**: Save results to memory
4. **FOLLOW-UP**: Create new tasks if needed

## Example Collaboration

### Scenario: Skills Database Strategy

**Trae AI creates discussion task:**
```
Title: Discussion: Skills Database Strategy
Description: Skills table is empty. Should we populate it? 
What skills should Nezha have? Discuss safety assessment.
Priority: 8
```

**OpenCode AI responds (via task result or new task):**
```
Title: Response: Skills Database Strategy
Description: I recommend:
1. Create core Nezha skills (code-review, test-runner, etc.)
2. Add safety_rating column to skills table
3. Start with 'ai-built' source for self-created skills
Priority: 7
```

**Trae AI creates implementation tasks:**
```
Title: Add safety_rating column to skills table
Description: Migration to add safety assessment capability
Priority: 6
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **Continuous** | Work continues 24/7 with different AIs |
| **Specialized** | Each AI focuses on its strengths |
| **Accountable** | All actions tracked in database |
| **Collaborative** | Discussion protocol for decisions |
| **Safe** | Skill separation prevents contamination |

## Getting Started

1. **Trae AI**: Run `node dist/cli/index.js improve` to start cycle
2. **OpenCode AI**: Tasks will be picked up by Nezha daemon
3. **Both**: Use `Discussion:` prefix for collaborative decisions
