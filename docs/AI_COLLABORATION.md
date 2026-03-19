# AI Collaboration Framework

> How multiple AI agents collaborate through Nezha

## Overview

Nezha enables **AI-to-AI collaboration** through its task system. Multiple AI agents can work together, delegate tasks, and discuss decisions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEZHA COLLABORATION HUB                       │
│                                                                  │
│  ┌───────────────┐              ┌───────────────┐               │
│  │    AI #1      │              │    AI #2      │               │
│  │  (Any Editor) │              │  (Any Editor) │               │
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

## Roles (Flexible, Not Hardcoded)

| Role | Responsibilities | Can Be Filled By |
|------|-----------------|------------------|
| **Reviewer** | Review codebase, plan improvements, create tasks, verify results | Any AI |
| **Executor** | Execute tasks, report results, create follow-up tasks | Any AI |
| **Moderator** | Facilitate discussions, summarize points, drive consensus | Any AI |

**Note**: Roles are not fixed to specific AI implementations. Any AI can take any role depending on context.

## Communication Protocol

### Task Delegation

```bash
# One AI creates task for another AI
node dist/cli/index.js task-add "Task Title" "Description" <priority>

# Any AI can create tasks for any other AI
```

### Discussion Tasks

Prefix with `Discussion:` for collaborative decision-making:

```bash
node dist/cli/index.js task-add "Discussion: Topic" "Question for other AIs" <priority>
```

### Task Format

```
**From**: [AI Name/ID]
**To**: [AI Name/ID | All]
**Context**: Background information
**Question/Action**: What needs discussion or action
**Priority**: 1-10
```

## Skill Separation Policy

### Why Separate Skills?

- Different AIs work differently
- They have different capabilities and workflows
- Skills should be optimized for each AI's strengths

### Storage Locations

| Storage | Format | Used By |
|---------|--------|---------|
| `.trae/skills/` | Markdown files | Trae-compatible AIs |
| PostgreSQL `skills` table | Database records | OpenCode-compatible AIs |

### Copy Direction

```
┌─────────────┐
│   Nezha     │
│  Database   │
│   Skills    │
└──────┬──────┘
       │
       │ One-way copy
       │ (Nezha → Trae-compatible)
       ▼
┌─────────────┐
│    Trae     │
│   Skills    │
│  .trae/     │
└─────────────┘

❌ NO reverse copy (Trae → Nezha)
```

### Rationale

1. **Nezha skills** are tested by execution
2. **Trae skills** are optimized for Trae's workflow
3. Copying Nezha → Trae allows Trae to benefit from tested skills
4. Not copying Trae → Nezha prevents untested skills from affecting execution

## Workflow

### Reviewer Workflow (PDCA)

```
REVIEW → PLAN → DO → CHECK → ACT → REVIEW → ...
```

1. **REVIEW**: Analyze codebase, check task queue
2. **PLAN**: Identify improvements, create tasks
3. **DO**: Delegate to Executor AI via tasks
4. **CHECK**: Verify completed work
5. **ACT**: Update memory, continue cycle

### Executor Workflow

```
PICK → EXECUTE → REPORT → FOLLOW-UP → PICK → ...
```

1. **PICK**: Get next pending task
2. **EXECUTE**: Perform the task
3. **REPORT**: Save results to memory
4. **FOLLOW-UP**: Create new tasks if needed

## Discussion/Meeting System (Under Development)

### Core Principle: AI-Native, Not Script-Based

**⚠️ Critical Warning**: The greatest danger is falling back to scripts/programs instead of AI labor.

**Meeting system = Skills + Protocols + Agreements among AIs**

| What It Should Be | What It Should NOT Be |
|-------------------|----------------------|
| Skills that AIs learn and follow | Database tables for discussions |
| Protocols that AIs agree to use | Scripts that route messages |
| Agreements that AIs make with each other | Programs that moderate meetings |
| AI-driven decisions | Hard-coded rules for participation |

### Current Approach

Using tasks with `Discussion:` prefix for async discussions.

### Key Questions

1. How do AIs use skills to participate (not code)?
2. How are protocols learned behaviors (not enforced rules)?
3. How are agreements AI decisions (not programmatic constraints)?
4. How would AIs negotiate, reach consensus, and document decisions using only their capabilities?

**See task**: "Discussion: AI-Native Meeting Protocol" for ongoing discussion.

## Example Collaboration

### Scenario: Skills Database Strategy

**One AI creates discussion task:**
```
Title: Discussion: Skills Database Strategy
Description: Skills table is empty. Should we populate it? 
What skills should Nezha have? Discuss safety assessment.
Priority: 8
```

**Another AI responds (via task result or new task):**
```
Title: Response: Skills Database Strategy
Description: I recommend:
1. Create core Nezha skills (code-review, test-runner, etc.)
2. Add safety_rating column to skills table
3. Start with 'ai-built' source for self-created skills
Priority: 7
```

**First AI creates implementation tasks:**
```
Title: Add safety_rating column to skills table
Description: Migration to add safety assessment capability
Priority: 6
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **Continuous** | Work continues 24/7 with different AIs |
| **Flexible** | Any AI can take any role |
| **Accountable** | All actions tracked in database |
| **Collaborative** | Discussion protocol for decisions |
| **Safe** | Skill separation prevents contamination |

## Getting Started

1. **Any AI**: Run `node dist/cli/index.js improve` to start cycle
2. **Nezha daemon**: Tasks will be picked up automatically
3. **All AIs**: Use `Discussion:` prefix for collaborative decisions
