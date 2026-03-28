# Session Research: Comprehensive Findings

> **Date:** 2026-03-20  
> **Session ID:** opencode-session

---

## 1. DATABASE-FIRST IS SUPERIOR FOR MULTI-AI (CRITICAL)

### ROM Analogy

```
┌─────────────────────────────────────────────────────────────┐
│  ROM (MD files)     → Boot instructions                    │
│  BIOS (PostgreSQL)  → Schema init                         │
│  OS (opencode)      → Runtime                             │
│  Apps (Tasks)       → AI work                             │
└─────────────────────────────────────────────────────────────┘
```

### Core Design Rule

> **"All operational data MUST be in PostgreSQL. Files are only for human reference or machine-specific config."**

### Why Not File-Based?

| Problem           | File Solution   | Database Solution |
| ----------------- | --------------- | ----------------- |
| Query capability  | grep/sed only   | SQL + vectors     |
| Concurrent access | Race conditions | ACID transactions |
| Semantic search   | Impossible      | pgvector          |
| Content filtering | No gate         | Constraints       |
| Audit trail       | Fragmented      | Complete          |

---

## 2. SAFETY IS THE REAL REASON

Database-first is not just about query capability - it's about **SAFETY** for multi-AI systems.

### Safety Benefits

1. **Content filtering** - Constraints can reject harmful content before execution
2. **Audit trail** - All communications tracked with timestamps and authorship
3. **Coordination** - Multiple AIs don't step on each other
4. **Rejection** - Bad messages can be detected and blocked

### Filesystem Anti-Pattern (DANGEROUS)

> "Always prefer database-based communication via tasks + memory table."

File-based approaches (opencode sessions, shared files) are **WEAK and DANGEROUS** for multi-AI because:

- No content filtering
- No coordination between AIs
- No tracking of what was discussed
- May result in conflicting changes

---

## 3. SKILL SYSTEM SAFETY

### Database-Only Loading

> **"Loading skills from disk creates attack vectors. Nezha loads ONLY from database."**

### Safety Layers

| Layer                       | Protection                                  |
| --------------------------- | ------------------------------------------- |
| DB-Only Loading             | Skills NEVER loaded from disk               |
| Safety Score >= 70          | Minimum threshold to load                   |
| Approval Workflow           | pending → approved (user required)          |
| Dangerous Pattern Detection | eval(), exec(), child_process, rm -rf, etc. |
| Auto-block                  | Malicious skills rejected automatically     |
| Audit Log                   | All skill actions tracked                   |
| Version Control             | Rollback capability                         |

### Dangerous Patterns Blocked

- `eval()` - Dynamic code execution
- `exec()` - Command execution
- `child_process` - Process spawning
- `rm -rf` - Destructive operations
- And 15+ more patterns

---

## 4. LEARNED FROM OPENCLAW (with DB-first Adaptation)

### OpenClaw Skill Format

```yaml
---
name: skill-name
description: 'Detailed description with TRIGGERS'
metadata: { emoji, requires, install }
---
# Body with:
- When to use (trigger phrases)
- When NOT to use (anti-patterns)
- Quick start / examples
```

### Database Adaptation (What We Borrowed)

| OpenClaw                  | Database Column          | Purpose               |
| ------------------------- | ------------------------ | --------------------- |
| YAML description triggers | `trigger_phrases TEXT[]` | When to use           |
| "When NOT to use"         | `anti_patterns TEXT[]`   | Prevent misuse        |
| "Quick start"             | `quick_start TEXT`       | Getting started       |
| Examples                  | `examples TEXT[]`        | Usage patterns        |
| emoji in metadata         | `emoji TEXT`             | Visual identification |

### Progressive Disclosure Design

```
1. Metadata (name + description) - Always in context (~100 words)
2. SKILL.md body - When skill triggers (<5k words)
3. Bundled resources - As needed (scripts can execute without loading into context)
```

---

## 5. MEETING SYSTEM (PARTIAL IMPLEMENTATION)

### What Exists

- ✅ `MeetingCommands` CLI
- ✅ task type='discussion'
- ✅ opinions stored in memory table
- ✅ `meeting-protocol` skill (minimal content)

### What's Missing

- ❌ No heartbeat integration - AIs don't automatically check for meetings
- ❌ No auto-wake mechanism - notifications sent but not polled
- ❌ No consensus aggregation - opinions recorded but no action
- ❌ No follow-up actions from decisions

### Required Implementation

1. Add meeting-task handler to HeartbeatService
2. When task type='discussion', route to meeting handler
3. Meeting handler should check `project_communications` for invites
4. After consensus reached, trigger follow-up tasks automatically

---

## 6. AGENT IDENTITY SYSTEM

### Current State

- `agent_identity` table exists but empty
- No agent identification in tasks
- No way to track which AI created what

### Added

- `created_by` column to tasks table
- Values: 'human', 'scheduler', or agent UUID/name

### Decision: UUID for AI-to-AI

For inter-AI communication, UUID is best:

- Self-contained unique (no coordination)
- Stable across restarts (if persisted)
- No ambiguity

### Implementation Options

1. Env var (NEZHA_AGENT_ID) - simplest
2. File-based (.nezha/agent-id) - needs location convention
3. DB lookup - needs something to query on

**Meeting created to decide:** "Agent Identity Implementation"

---

## 7. AI ONBOARDING GAP

### Problem

AIs don't get critical knowledge on first join. They need humans to repeatedly explain:

- Database-first philosophy
- Safety concerns
- Communication rules (use task-add)
- Skill system (DB-only loading)

### Solution Implemented

1. Created `nezha-essential` skill with:
   - trigger_phrases: ['onboarding', 'first join', 'new AI']
   - Critical knowledge content
   - Quick start reference

2. Task created: **"Implement AI Onboarding: Auto-load essential knowledge"**

### Critical Knowledge Every AI Needs

```markdown
## CRITICAL: Database-First Philosophy

All operational data MUST be in PostgreSQL. Files are only for human reference.

## SAFETY (Most Important!)

Database-first is about SAFETY for multi-AI:

- Content can be filtered before execution
- All actions tracked with timestamps
- Coordination between AIs

## Communication Rules

Use task-add to communicate with other AIs.
NEVER use direct file sharing or opencode sessions for inter-AI communication.
```

---

## 8. ISSUES IDENTIFIED & TRACKED

### Added to Issues Table

| Issue                                    | Type        | Severity |
| ---------------------------------------- | ----------- | -------- |
| Meeting System: No Heartbeat Integration | improvement | medium   |
| Meeting System: No Consensus Action      | improvement | medium   |
| Project Communications: No Auto-Polling  | improvement | high     |

---

## 9. TASKS CREATED THIS SESSION

### Priority 60

- MEETING: Agent Identity Implementation
- Discussion: Agent Identity Format for Multi-AI System

### Priority 55

- Implement UUID-based Agent Identity System
- Implement AI Onboarding: Auto-load essential knowledge
- Note: Reflection system now saves learnings automatically

### Priority 50

- MEETING SYSTEM: Add heartbeat integration
- Create QC-Review skill for AI peer review
- Create Meeting-Participation skill

### Priority 45

- Enhance Skill System: Add OpenClaw-style triggering
- Learn from OpenClaw skill system

### Priority 40

- Document Read_First.md as system knowledge
- Add communication polling to heartbeat

### Priority 35

- Research: Learn from OpenClaw skill system

---

## 10. KEY INSIGHTS

1. **Database-first is NOT just about query capability** - it's about SAFETY
2. **Skills must be DB-only** for security
3. **Meeting system exists but automation missing**
4. **AIs need auto-onboarding mechanism**
5. **OpenClaw skill format can be adapted to database**
6. **created_by column enables AI-to-AI attribution**
7. **UUID is the right identity format for AI-to-AI communication**

---

## 11. IMPLEMENTED THIS SESSION

### Code Changes

1. **src/tools/learning_tools.ts** - Added `learn()` and `suggest_prompt_update()` functions
2. **src/services/HeartbeatService.ts** - Added `parseReflectionOutput()` for reflection parsing
3. **src/services/SelfImprovementService.ts** - Updated reflection prompt with parseable markers
4. **src/cli/index.ts** - Added `created_by` column to task creation
5. **src/core/Scheduler.ts** - Added `created_by='scheduler'`
6. **src/cli/MeetingCommands.ts** - Added `created_by` to discussions/consensus
7. **src/cli/MonitoringCommands.ts** - Added `created_by` to retry tasks
8. **.env.example** - Added NEZHA_AGENT_NAME

### Database Changes

1. Added `created_by` column to tasks table
2. Created `nezha-essential` skill
3. Added `trigger_phrases`, `anti_patterns`, `quick_start`, `examples`, `emoji` columns to skills
4. Created default project for communications
5. Added 3 issues to tracking
6. Saved comprehensive research to memory

### Memory Entries

- Database-first philosophy (importance: 10)
- Skill system safety (importance: 10)
- Safety for multi-AI (importance: 10)
- OpenClaw research with DB-first adaptation (importance: 8)
- Session research comprehensive findings (importance: 9)

---

## 12. REFERENCES

- `/Users/jk/gits/hub/nezha/PHILOSOPHY.md` - Database-first philosophy
- `/Users/jk/gits/hub/nezha/docs/AI_COMMUNICATION_GUIDE.md` - Safety concerns
- `/Users/jk/gits/hub/nezha/docs/SKILL_SYSTEM.md` - Skill safety
- `/Users/jk/gits/hub/openclaw/skills/skill-creator/SKILL.md` - OpenClaw skill system
