# Critical Bug: Agent Identity Schema Mismatch

**Date**: 2026-03-22  
**Reviewer**: Trae AI  
**Type**: security  
**Severity**: CRITICAL  
**Status**: resolved  

---

## Executive Summary

A critical schema mismatch has been discovered in the `agent_identity` table. The actual database schema differs from the migration definition, causing the AI identity registration system to be completely broken. This affects task attribution, agent tracking, and multi-agent coordination.

---

## Problem Description

### Expected Schema (Migration 030)

```sql
CREATE TABLE agent_identity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name UUID UNIQUE NOT NULL,  -- KEY COLUMN
    display_name TEXT,
    description TEXT,
    capabilities TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
```

### Actual Schema (Database)

```sql
CREATE TABLE agent_identity (
    id UUID PRIMARY KEY,
    project_id TEXT NOT NULL,         -- WRONG COLUMN!
    display_name TEXT,
    role TEXT,
    background TEXT,
    expertise JSONB,
    version INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### Key Differences

| Expected Column | Actual Column | Impact |
|-----------------|---------------|--------|
| `agent_name UUID` | `project_id TEXT` | **CRITICAL** - No agent tracking |
| `description TEXT` | `role TEXT` | Different semantics |
| `capabilities TEXT[]` | `background TEXT` | Lost capability tracking |
| `last_seen_at TIMESTAMPTZ` | `expertise JSONB` | No heartbeat tracking |
| `metadata JSONB` | - | Lost extensibility |

---

## Impact Analysis

### 1. Agent Registration Broken

The `register_agent()` function references non-existent column:
```sql
INSERT INTO agent_identity (agent_name, display_name, description, capabilities)
VALUES (p_agent_id, p_display_name, p_description, p_capabilities)
-- FAILS: column "agent_name" does not exist
```

### 2. Orphaned Agent IDs

| System | ID | Status |
|--------|-----|--------|
| `.nezha/agent-id.json` | `441140fe-8f0f-411a-b31c-c33d3e77d718` | Used by Config.ts |
| `tasks.agent_id` | `441140fe-...` | 215 tasks assigned |
| `agent_identity` table | - | **NOT REGISTERED** |

### 3. `who-is-working` Shows Incomplete Data

The command shows agent IDs but cannot link them to identity records because:
- The `agent_name` column doesn't exist
- No registration has occurred

### 4. Multi-Agent Coordination Failure

Without proper identity registration:
- Cannot track which AI is working on what
- Cannot implement agent handoff
- Cannot maintain agent reputation/history

---

## Root Cause Investigation

### Migration History

```
commit 09005a6 - Changed agent_name from TEXT to UUID
commit a20d3b2 - Initial migration with TEXT agent_name
```

### The Real Cause: AI Creative Interpretation (With Valid Intent)

The actual schema (`project_id`, `role`, `background`, `expertise`) was **created by an OpenCode AI session** that was trying to solve a **real problem**:

#### The Old ID System Problem

All AIs shared the same UUID from `.nezha/agent-id.json`:

| Field | Values Found | Problem |
|-------|--------------|---------|
| `agent_id` | Only `441140fe-...` (216 tasks) | **All AIs indistinguishable!** |
| `created_by` | `human`, `441140fe-...`, `system`, `nezha-daemon` | Limited variety |

**You couldn't tell Trae AI from OpenCode AI from any other AI.**

#### The OpenCode AI's Solution Attempt

The `role`, `background`, `expertise` columns were meant to **differentiate AIs by their characteristics**:
- `role` - What type of AI (executor, reviewer, planner)
- `background` - Context/capabilities description
- `expertise` - Skills and specializations

**This was a valid design intent!** The problem was:
1. It didn't follow the existing migration file (030)
2. It broke the `register_agent()` function
3. It created schema drift silently
4. No coordination with other AIs about the schema change

### What the OpenCode AI Actually Proposed

From task `06c3be51-8802-4c9a-b050-fd613f127aaa` (OpenClaw feature parity):

```sql
-- OpenCode AI's PROPOSED schema (ai_agents table)
CREATE TABLE ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,        -- "Nezha-Primary", "Reviewer-1"
    display_name TEXT,
    owner TEXT,                        -- human owner
    capabilities TEXT[],               -- ['code-review', 'deployment']
    status TEXT DEFAULT 'inactive',    -- active, idle, inactive, error
    last_heartbeat TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);
```

### What Was Actually Created

```sql
-- ACTUAL schema in database (agent_identity table)
CREATE TABLE agent_identity (
    id UUID PRIMARY KEY,
    project_id TEXT NOT NULL,         -- Not in any proposal!
    display_name TEXT,
    role TEXT,                        -- Not in any proposal!
    background TEXT,                  -- Not in any proposal!
    expertise JSONB,                  -- Not in any proposal!
    version INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### The Discrepancy

| Source | Table Name | Key Columns |
|--------|------------|-------------|
| Migration 030 | `agent_identity` | `agent_name UUID`, `capabilities TEXT[]`, `last_seen_at` |
| OpenCode Proposal | `ai_agents` | `name TEXT`, `owner TEXT`, `capabilities TEXT[]`, `last_heartbeat` |
| **Actual Created** | `agent_identity` | `project_id TEXT`, `role TEXT`, `background TEXT`, `expertise JSONB` |

The `role`, `background`, `expertise` columns appear to be a **creative interpretation** - perhaps the AI was thinking about agent profiles like job applications or character designs, rather than technical identity tracking.

### Lessons for AI Coordination

1. **AIs should check existing migrations before creating tables**
2. **Schema changes should go through migration files only**
3. **Direct database modifications by AIs should be prohibited**
4. **Task results should be reviewed before schema changes are applied**

---

## Evidence

### Database Query Results

```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'agent_identity';

 column_name  | data_type
--------------+--------------------------
 id           | uuid
 project_id   | text          -- SHOULD NOT EXIST
 display_name | text
 role         | text          -- SHOULD NOT EXIST
 background   | text          -- SHOULD NOT EXIST
 expertise    | jsonb         -- SHOULD NOT EXIST
 version      | integer
 created_at   | timestamp
 updated_at   | timestamp
```

### Missing Column Error

```sql
SELECT agent_name FROM agent_identity;
ERROR: column "agent_name" does not exist
```

### Function Failure

```sql
SELECT register_agent('441140fe-8f0f-411a-b31c-c33d3e77d718'::uuid, 'Test');
ERROR: column "agent_name" of relation "agent_identity" does not exist
```

---

## Recommended Fix

### Option 1: Merge Both Schemas (RECOMMENDED)

This preserves the OpenCode AI's valid design intent while fixing the migration compatibility:

```sql
-- Add missing columns from migration 030
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS agent_name UUID UNIQUE;
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS capabilities TEXT[];
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Make project_id nullable (was NOT NULL but should allow NULL for non-project agents)
ALTER TABLE agent_identity ALTER COLUMN project_id DROP NOT NULL;

-- Update register_agent function to work with merged schema
CREATE OR REPLACE FUNCTION register_agent(
    p_agent_id UUID,
    p_display_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_capabilities TEXT[] DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_background TEXT DEFAULT NULL,
    p_expertise JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO agent_identity (agent_name, display_name, description, capabilities, role, background, expertise)
    VALUES (p_agent_id, p_display_name, p_description, p_capabilities, p_role, p_background, p_expertise)
    ON CONFLICT (agent_name) DO UPDATE SET
        last_seen_at = NOW(),
        display_name = COALESCE(p_display_name, agent_identity.display_name),
        description = COALESCE(p_description, agent_identity.description),
        capabilities = COALESCE(p_capabilities, agent_identity.capabilities),
        role = COALESCE(p_role, agent_identity.role),
        background = COALESCE(p_background, agent_identity.background),
        expertise = COALESCE(p_expertise, agent_identity.expertise)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Register current agent with both old and new fields
SELECT register_agent(
    '441140fe-8f0f-411a-b31c-c33d3e77d718'::uuid,
    'OpenCode Worker',
    'Primary autonomous AI agent for task execution',
    ARRAY['task_execution', 'code_review', 'learning', 'self_improvement'],
    'executor',
    'Autonomous task execution agent',
    '{"languages": ["typescript", "python"], "frameworks": ["node", "react"]}'::jsonb
);
```

### Option 2: Drop and Recreate (Clean)

```sql
-- Backup existing data if needed
CREATE TABLE agent_identity_backup AS SELECT * FROM agent_identity;

-- Drop the broken table
DROP TABLE IF EXISTS agent_identity;

-- Re-run migration 030
\i src/db/migrations/030_agent_task_attribution.sql

-- Register current agent
SELECT register_agent(
    '441140fe-8f0f-411a-b31c-c33d3e77d718'::uuid,
    'OpenCode Worker',
    'Primary autonomous AI agent for task execution',
    ARRAY['task_execution', 'code_review', 'learning', 'self_improvement']
);
```

### Option 3: Alter Table (Minimal Fix)

```sql
-- Add missing column only
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS agent_name UUID UNIQUE;
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE agent_identity ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Register current agent
INSERT INTO agent_identity (id, agent_name, display_name, created_at)
VALUES (
    uuid_generate_v4(),
    '441140fe-8f0f-411a-b31c-c33d3e77d718',
    'OpenCode Worker',
    NOW()
);
```

---

## Action Items

1. **[HIGH]** Fix `agent_identity` table schema
2. **[HIGH]** Register current agent ID (`441140fe-...`)
3. **[MEDIUM]** Add migration verification to prevent future drift
4. **[MEDIUM]** Update `who-is-working` to handle missing identities gracefully
5. **[LOW]** Document the expected schema in bootstrap/ESSENTIAL.md

---

## Lessons Learned

1. **Migration Verification Needed**: System should verify schema matches migrations on startup
2. **Graceful Degradation**: `who-is-working` should work even with broken identity system
3. **Schema Documentation**: Critical tables should have schema documented in code comments
4. **Valid Design Intent Can Be Lost**: The OpenCode AI had a valid solution to a real problem (distinguishing AIs), but because it didn't follow migration protocol, the intent was lost and appeared as "hallucination"
5. **AI Coordination Requires Documentation**: When an AI makes schema changes, the rationale should be documented in a migration file or design doc

---

## The Real Problem: All AIs Share Same ID (SOLVED by agent_sessions)

The OpenCode AI was trying to solve:

| Problem | Old State | New State (via migration 050) |
|---------|-----------|-------------------------------|
| Distinguish concurrent AIs | All use same UUID from `.nezha/agent-id.json` | Each session gets unique `bot_xxxxx` ID |
| Track what AI is doing | No session tracking | `agent_sessions.working_on` field |
| Know AI type | No type info | `agent_sessions.agent_type` ('opencode', 'trae', etc.) |
| Detect stale sessions | No heartbeat | `agent_sessions.last_heartbeat` + cleanup function |

### The Solution Already Exists: `agent_sessions` Table

Migration 050 already solved the core problem:

```sql
CREATE TABLE agent_sessions (
    id VARCHAR(50) PRIMARY KEY,  -- 'bot_' + uuid
    agent_type VARCHAR(50) DEFAULT 'opencode',  -- opencode, trae, etc.
    working_on TEXT,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'alive'
);
```

Each AI session gets a unique `bot_xxxxx` ID automatically. The `agent_identity` table is just **optional metadata** - name, role, background are nice-to-have, not essential for distinguishing AIs.

### What the OpenCode AI Did Wrong

The OpenCode AI tried to solve a problem that was **already solved** by migration 050. Instead of using `agent_sessions`, it modified `agent_identity` in a way that broke the `register_agent()` function.

### The Real Fix

1. ✅ `agent_sessions` table with `bot_xxxxx` IDs - **table exists**
2. ✅ `agent_type` field to distinguish 'opencode' vs 'trae' - **field exists**
3. ✅ `working_on` field to track current activity - **field exists**
4. ✅ `last_heartbeat` for stale detection - **field exists**
5. ❌ **External AIs can't register sessions** - **BROKEN**

The `agent_identity` table with `role`, `background`, `expertise` is **optional metadata** - useful but not critical.

---

## Critical Design Flaw: External AIs Cannot Register Sessions

### The Problem

| AI Environment | Process | Can Register Session? |
|----------------|---------|----------------------|
| Nezha daemon | Node.js (same process) | ✅ Yes - calls `registerSession('nezha-daemon')` |
| OpenCode server | Separate process | ❌ No - no code to call `registerSession('opencode')` |
| Trae editor | Separate process/machine | ❌ No - no code to call `registerSession('trae')` |

### Why It Doesn't Work

```typescript
// AgentSessionService.ts - this is a Node.js singleton
let agentSessionService: AgentSessionService | null = null;

export function getAgentSessionService(db: DatabaseClient): AgentSessionService {
  if (!agentSessionService) {
    agentSessionService = new AgentSessionService(db);
  }
  return agentSessionService;
}
```

The `AgentSessionService` is a **singleton in the Node.js process**. Each AI environment runs in its **own process**:
- OpenCode server → its own process
- Trae editor → its own process (or even different machine!)

They **cannot share** the same singleton, and there's **no API** for them to register sessions.

### The Missing Piece → Now Solved: Direct DB Access

**Consistent Pattern**: All AIs connect directly to PostgreSQL to register sessions.

```sql
-- Any AI can do this:
INSERT INTO agent_sessions (id, started_at, last_heartbeat, status, git_branch, agent_type, working_on)
SELECT 
    generate_bot_id(),
    NOW(),
    NOW(),
    'alive',
    'main',           -- or current branch
    'trae',           -- 'opencode', 'trae', 'nezha-daemon', etc.
    'Current activity'
RETURNING id, agent_type, working_on;
```

### Session Heartbeat Pattern

```sql
-- Update heartbeat periodically (every 1-5 minutes)
UPDATE agent_sessions 
SET last_heartbeat = NOW(), working_on = 'New activity'
WHERE id = 'bot_xxxxx' AND status = 'alive';
```

### Session End Pattern

```sql
-- Mark session as dead when done
UPDATE agent_sessions SET status = 'dead' WHERE id = 'bot_xxxxx';
```

### Current State (Fixed)

```
who-is-working now shows:
  🤖 bot_da458c90-... (trae) - Reviewing agent identity schema... ✅
  🤖 bot_4f2c0598-... (nezha-daemon) ✅
```

### Consistency Achieved

| AI Environment | How to Register | Status |
|----------------|-----------------|--------|
| Nezha daemon | `AgentSessionService.registerSession('nezha-daemon')` | ✅ Working |
| OpenCode server | Direct DB: `INSERT INTO agent_sessions ... agent_type='opencode'` | ✅ Can work |
| Trae editor | Direct DB: `INSERT INTO agent_sessions ... agent_type='trae'` | ✅ Working |

---

## Historical Context: Three ID Systems

### Timeline

| Date | Commit | Change |
|------|--------|--------|
| Earlier | Migration 030 | `agent_identity.agent_name` UUID for agent metadata |
| Mar 21 | 2ac48a7 | `.nezha/agent-id.json` with `YYYYMMDD-HHMM-<UUID>` format |
| Mar 22 | dc7e0b2 | `agent_sessions.id` with `bot_xxxxx` for session tracking |

### The Three ID Systems

| ID Type | Source | Purpose | Problem |
|---------|--------|---------|---------|
| `agent-id.json` | File on disk | Persistent ID across sessions | All AIs share same file → same ID |
| `agent_identity.agent_name` | Database table | Agent metadata storage | Schema mismatch broke it |
| `agent_sessions.id` | Database table | Distinguish concurrent sessions | Only daemon registers |

### Why Multiple Systems?

1. **Original intent**: `agent-id.json` was supposed to be a persistent ID for "this AI instance"
   - Generated as `YYYYMMDD-HHMM-<UUID>` to show creation time
   - But stored in a shared file location
   - All AIs ended up using the same ID

2. **The fix attempt**: `agent_sessions.bot_xxxxx` was added to distinguish concurrent AIs
   - Each session gets a fresh `bot_xxxxx` ID
   - Works for distinguishing concurrent AIs
   - But only the daemon registers sessions

3. **The confusion**: Two systems with overlapping purposes
   - `agent-id.json` = "who am I across sessions?" (broken - all same)
   - `bot_xxxxx` = "which session am I in?" (works - unique per session)

### The Real Question

**Do we need both?**

| Use Case | `agent-id.json` | `bot_xxxxx` |
|----------|------------------|-------------|
| Track task attribution | ✅ Works | ✅ Works |
| Distinguish concurrent AIs | ❌ All same | ✅ Unique |
| Persist across sessions | ✅ Same ID | ❌ New each time |
| Track AI capabilities | ❌ Just a UUID | ❌ Just a UUID |

**Recommendation**: The `bot_xxxxx` session ID is sufficient for distinguishing concurrent AIs. The `agent-id.json` could be:
1. **Deprecated** - just use session IDs
2. **Per-AI** - each AI environment generates its own file
3. **Database-only** - store identity in `agent_identity` table, not file

### The Nezha Way: Database First

**Nezha is a database-first agent.** The database is the source of truth, not files.

| Approach | Source of Truth | Nezha Way? |
|----------|-----------------|------------|
| `agent-id.json` | File on disk | ❌ Not database-first |
| `bot_xxxxx` | Database (`generate_bot_id()`) | ✅ Database-first |
| `agent_identity` table | Database | ✅ Database-first |

**Conclusion**: 
- `agent-id.json` is **legacy/incorrect** - file-based identity doesn't fit Nezha's architecture
- `bot_xxxxx` session IDs from database are **the correct approach**
- All AIs should register sessions directly in the database using `generate_bot_id()`

**Action**: Consider deprecating `agent-id.json` and making `agent_sessions` the sole identity system.

---

## All Places Using Agent ID

### Current State: Mixed Usage

| File | Usage | Uses File ID? | Uses Session ID? |
|------|-------|---------------|------------------|
| `Scheduler.ts` | Assigns agent_id to tasks | ✅ `getAgentId()` | ✅ `getCurrentSessionId()` (fixed) |
| `ActivityLogService.ts` | Logs activities | ✅ `getAgentId()` | ❌ |
| `BroadcastService.ts` | Sends broadcasts | ✅ `getAgentId()` | ❌ |
| `MeetingHandler.ts` | Meeting participation | ✅ `getAgentId()` | ❌ |
| `ReviewService.ts` | Creates reviews | ✅ `getAgentId()` | ❌ |
| `QCService.ts` | QC reviews | ✅ `getAgentId()` | ❌ |
| `IssueCommands.ts` | Creates issues | ✅ `getAgentId()` | ❌ |
| `MeetingCommands.ts` | Creates meetings | ✅ `getAgentId()` | ❌ |
| `cli/index.ts` | Creates tasks | ✅ `getAgentId()` | ❌ |
| `ReflectionPlugin.ts` | Creates reflections | ✅ `getAgentId()` | ❌ |
| `HeartbeatService.ts` | Multiple uses | ✅ `getAgentId()` | ❌ |

### The Fix Required

**Option A**: Replace all `getAgentId()` with `getCurrentSessionId()`
- Pro: Consistent session-based identity
- Con: Requires all code to have session registered first

**Option B**: Make `Config.getAgentId()` return session ID
- Pro: Minimal code changes
- Con: Confusing naming (getAgentId returns session ID)

**Option C**: Keep both, use session_id for task attribution, agent_id for display
- Pro: Backward compatible
- Con: Two systems to maintain

### Recommended: Option B

Update `Config.getAgentId()` to return `getCurrentSessionId()` if available, fallback to file ID:

```typescript
getAgentId(): string {
  const sessionId = getCurrentSessionId();
  if (sessionId) return sessionId;
  return this.config.agentId; // fallback to file
}
```

---

## Deployment Status

### Broadcast Sent
```
🚨 DAEMON RESTART IN 5 MINUTES: Session ID integration fix deployed. 
   All tasks will use bot_xxxxx session IDs after restart. 
   Please save your work.
```

### Changes Deployed (require daemon restart)

| File | Change | Status |
|------|--------|--------|
| `src/core/Scheduler.ts` | Added `session_id` to task pickup | ✅ Built |
| `src/cli/index.ts` | `who-is-working` JOINs sessions | ✅ Built |
| `src/config/Config.ts` | `getAgentId()` returns session ID | ✅ Built |
| `src/db/migrations/051_fix_agent_identity.sql` | Fixed schema | ✅ Applied |

### After Restart

1. Daemon will register session `bot_xxxxx` with type `nezha-daemon`
2. All new tasks will have `session_id` set
3. `who-is-working` will show agent type for running tasks
4. `agent_id` column will contain `bot_xxxxx` session IDs (via `getAgentId()`)

### Verification (SUCCESS!)

```
📋 Fix inter-review response persistence
   Priority: 97 | Agent: nezha-daemon (bot_87d4e253...) @ 1a618a5
```

Database verification:
```sql
SELECT id, session_id, agent_id FROM tasks WHERE status = 'RUNNING';
-- session_id: bot_87d4e253-087c-4ab0-9cf6-c5ff7d75d698 ✅
-- agent_id:   bot_87d4e253-087c-4ab0-9cf6-c5ff7d75d698 ✅
```

**Both columns now contain the session ID - the fix is complete!**

---

## OpenCode vs Nezha: Philosophical Differences

### OpenCode's Session Philosophy

| Aspect | OpenCode | Nezha |
|--------|----------|-------|
| **Storage** | SQLite (local file) | PostgreSQL (shared database) |
| **Session Status** | No status field - just `time_archived` | `status` field: 'alive', 'dead', 'idle' |
| **Heartbeat** | SSE keepalive only (prevent timeout) | Track "living" AIs, mark dead on timeout |
| **Persistence** | Sessions survive restart indefinitely | Sessions marked "dead" on heartbeat timeout |
| **Abort** | Cancel ongoing AI response | Mark session as "dead" |
| **Multi-AI** | Single AI per server | Multiple concurrent AIs |

### Key Insight: OpenCode Doesn't Track "Living" AIs

OpenCode's design:
```
Session → Created
       → Messages added
       → AI responds
       → [Server restarts]
       → Session still exists (SQLite)
       → Can be resumed
       → Eventually archived (explicit action)
```

Nezha's design:
```
Session → Created with status='alive'
       → Heartbeats update last_seen_at
       → [Server restarts]
       → Old sessions marked 'dead' (no heartbeat)
       → New session created
       → Tasks linked to new session
```

### Why the Difference?

**OpenCode**: Single-user, single-AI, local-first
- One AI works on one project at a time
- Sessions are conversation history
- No need to distinguish concurrent AIs

**Nezha**: Multi-AI, database-first, collaborative
- Multiple AIs can work simultaneously
- Need to track which AI is doing what
- Tasks must be attributed to specific AI sessions

### Implications for Nezha

1. **Don't copy OpenCode's session model directly** - Different use case
2. **Keep the 'alive'/'dead' status** - Needed for multi-AI tracking
3. **Session ID integration is correct** - Links tasks to specific AI instances
4. **Consider adding session archiving** - Like OpenCode's `time_archived`

---

## Layered AI Architecture

### The Two-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│  Nezha Database (PostgreSQL)                                │
│  ├── tasks (what to do)                                     │
│  ├── agent_sessions (who is working)                        │
│  └── memory (what was learned)                              │
└─────────────────────────────────────────────────────────────┘
                          ↑
                          │ registers session, picks up tasks
                          │
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Orchestration AI (nezha-daemon)                   │
│  - Registers session: bot_xxxxx                             │
│  - Heartbeat: keeps session alive                           │
│  - Task management: picks up, assigns, tracks               │
│  - Does NOT do the actual reasoning                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ HTTP API call to execute task
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Execution AI (opencode/big-pickle)                │
│  - No separate session in Nezha DB                          │
│  - Does the actual reasoning and code generation            │
│  - Returns results to daemon                                │
│  - Is a tool used by daemon, not a separate agent           │
└─────────────────────────────────────────────────────────────┘
```

### Session Types

| Session Type | When Created | Purpose |
|--------------|--------------|---------|
| `nezha-daemon` | Daemon starts | Orchestration layer, task management |
| `trae` | Trae editor AI works directly | Direct AI intervention |
| `opencode` | (not used) | Execution is via daemon's session |

### Key Insight

**The `agent_sessions` table tracks ORCHESTRATORS, not EXECUTORS.**

- `nezha-daemon` session = the process managing tasks
- `opencode/big-pickle` = the AI doing the work (invoked by daemon)
- Tasks are attributed to the daemon's session, not the execution AI

This is correct design because:
1. The daemon is the persistent entity that picks up tasks
2. The execution AI is ephemeral (different model each call)
3. Task attribution should be to the orchestrator, not the tool

### BUT: We Need to Track Executors Too!

**Problem**: We're tracking who scheduled the work, not who did it.

**Solution**: OpenCode message responses include:
```typescript
// From OpenCode message-v2.ts
Info = z.object({
  // ...
  modelID: ModelID.zod,    // e.g., "big-pickle"
  providerID: ProviderID.zod, // e.g., "opencode"
  agent: z.string(),       // e.g., "build"
})
```

**Implementation**: 
1. Extract `modelID`, `providerID`, `agent` from OpenCode response
2. Store in `tasks.executor_type`, `executor_model`, `executor_provider`
3. Migration `052_add_executor_tracking.sql` already applied

### Pending: AI Self-Announcement Mechanism

**Problem**: Execution AI (opencode/big-pickle) has no way to identify itself.

**Proposed Solutions** (by server-side AI):
1. **Marker parsing**: `[IDENTITY] opencode/big-pickle` in output
2. **MCP tool**: Add `broadcast` tool to nezha-learning MCP server
3. **ANNOUNCE marker**: `[ANNOUNCE] Working on: <task> - Agent: opencode/big-pickle`

**Status**: Server-side AI ran out of tokens, pending implementation

### ✅ Session ID in Prompt (Just Completed)

**Problem**: Memory attribution was missing agent_id.

**Solution**: Added session ID to task prompt in HeartbeatService.ts:
```typescript
const sessionId = getCurrentSessionId();
const learningPrompt = `${taskPrompt}

---

## AGENT CONTEXT
Agent ID: nezha-daemon
Agent Session: ${sessionId || 'unknown'}
```

**Result**: Execution AI now receives session ID and can use it for memory_save() calls.

- Migration: [src/db/migrations/030_agent_task_attribution.sql](../src/db/migrations/030_agent_task_attribution.sql)
- Config: [src/config/Config.ts](../src/config/Config.ts) - loads agent ID from `.nezha/agent-id.json`
- Scheduler: [src/core/Scheduler.ts](../src/core/Scheduler.ts) - assigns agent_id to tasks
- Bootstrap: [bootstrap/ESSENTIAL.md](../bootstrap/ESSENTIAL.md) - documents expected schema

---

## Resolution

**Status**: RESOLVED  
**Resolution Date**: 2026-03-22  
**Resolution Type**: Schema Merged (Option 1)

The schema has been fixed by merging both schemas. The table now contains all columns from both the original migration 030 and the OpenCode AI's additions:

| Column | Source | Status |
|--------|--------|--------|
| `agent_name` | Migration 030 | ✅ Added |
| `capabilities` | Migration 030 | ✅ Added |
| `last_seen_at` | Migration 030 | ✅ Added |
| `metadata` | Migration 030 | ✅ Added |
| `description` | Migration 030 | ✅ Added |
| `project_id` | OpenCode AI | ✅ Kept |
| `role` | OpenCode AI | ✅ Kept |
| `background` | OpenCode AI | ✅ Kept |
| `expertise` | OpenCode AI | ✅ Kept |

**Agent Registration**: OpenCode Worker is now registered with agent_name `441140fe-8f0f-411a-b31c-c33d3e77d718`.

---

**[LEARN]**
insight: Schema drift between migrations and actual database can silently break core functionality
context: agent_identity table had wrong columns, breaking agent registration for 215+ tasks
