# Nezha Architecture Philosophy

> **IMPORTANT**: Read this to understand Nezha's design decisions

## The Core Question

**Why does Nezha use PostgreSQL instead of pure file-based storage like OpenClaw?**

---

## OpenClaw's Approach (File-Based)

OpenClaw stores everything in files:
- `.openclaw/workspace/TASKS.md` - Task list
- `.openclaw/workspace/SOUL.md` - Agent identity
- `.openclaw/workspace/memory/` - Daily memories
- `.openclaw/bootstrap/` - Skills and prompts

**Pros:**
- Simple - just files and folders
- Human readable
- No database setup needed
- Easy to version control
- Works out of the box

**Cons:**
- Hard to query (grep/sed only)
- No complex filtering/sorting
- Race conditions with concurrent access
- Hard to search semantically
- Not portable across machines

---

## Nezha's Approach (Database-First)

Nezha uses PostgreSQL as the **primary** source of truth:

```
PostgreSQL (Operational) ←→ Files (Human Reference)
```

### What Goes in PostgreSQL:

| Table | Purpose | Why Database? |
|-------|---------|----------------|
| `tasks` | Task queue | Queryable, concurrent, status tracking |
| `scheduled_tasks` | Cron jobs | Time-based queries, reliability |
| `memory` | Knowledge base | Vector search, semantic retrieval |
| `workers` | Worker pool | State management, health tracking |
| `audit_log` | Activity history | Reliable logging |

### What Stays in Files:

| Path | Purpose | Why Files? |
|------|---------|-------------|
| `.tmp/nezha-memory/` | Daily memory | Human readable, append-only |
| `.tmp/nezha-memory/MEMORY.md` | Long-term memory | Curated, human-editable |
| `.env` | Configuration | Security, per-machine |
| `docs/` | Documentation | Human reference |

---

## Why This Hybrid Approach?

### 1. **Query Capability** (Primary Reason)

```sql
-- Find all failed tasks from last week
SELECT * FROM tasks 
WHERE status = 'FAILED' 
AND updated_at > NOW() - INTERVAL '7 days';

-- Find tasks by priority and status
SELECT * FROM tasks 
WHERE status IN ('PENDING', 'RUNNING')
ORDER BY priority DESC, created_at ASC
LIMIT 10;
```

Files can't do this efficiently.

### 2. **Concurrent Access**

Multiple processes can safely:
- Pick up tasks simultaneously
- Update task status
- Query progress

File-based systems have race conditions.

### 3. **Semantic Search**

PostgreSQL with pgvector enables:
```sql
SELECT * FROM memory 
ORDER BY embedding <=> $query_embedding
LIMIT 5;
```

This is impossible with files.

### 4. **Reliability**

- Transactions ensure consistency
- ACID compliance
- Backup/restore with standard tools

### 5. **Universal Portability**

Export entire knowledge base:
```bash
pg_dump nezha > backup.sql
```

Import on any machine with PostgreSQL. No file path dependencies.

---

## Critical Design Rule

> **All operational data MUST be in PostgreSQL. Files are only for human reference or machine-specific config.**

### What This Means:

| Data Type | Database | File Only | Notes |
|-----------|----------|-----------|-------|
| Task queue | ✅ | ❌ | Must be queryable |
| Task results | ✅ | ❌ | Need to search |
| Skill definitions | ✅ | ❌ | Import from files |
| Agent prompts | ✅ | ❌ | Version control via SQL |
| Daily logs | ✅ | ✅ | DB primary, file backup |
| Secrets/keys | ❌ | ✅ | Machine-specific |
| User docs | ❌ | ✅ | Purely human |

---

## How We Compare to OpenClaw

### Similarities:

- Both use daily memory files (`.tmp/nezha-memory/YYYY-MM-DD.md`)
- Both have curated memory (`.tmp/nezha-memory/MEMORY.md`)
- Both can import skills from bootstrap

### Differences:

| Aspect | OpenClaw | Nezha |
|--------|----------|-------|
| Task storage | Markdown files | PostgreSQL |
| Search | grep/ripgrep | SQL + vectors |
| Concurrent | File locks | Database transactions |
| Portability | File copy | pg_dump/sql |
| Setup complexity | Low | Medium |

---

## Supporting OpenClaw Skills

We want Nezha to work with OpenClaw skills:

1. **Read skills** from `.openclaw/bootstrap/`
2. **Convert** to database format
3. **Store** in `skills` table
4. **Execute** from database

This gives us the best of both:
- OpenClaw's skill ecosystem
- Nezha's queryable database

---

## Implementation Priority

### Phase 1: Core Tables (Done)
- [x] tasks
- [x] scheduled_tasks  
- [x] memory

### Phase 2: Skills System
- [ ] Import skills from files to DB
- [ ] Skill execution from database
- [ ] Skill version tracking

### Phase 3: Full Parity
- [ ] Import all OpenClaw workspace data
- [ ] Convert TASKS.md → tasks table
- [ ] Convert SOUL.md → agent_config table

---

## Why Not Docker?

We don't use Docker unless we have a strong reason:

| Reason to use Docker | Why not needed |
|---------------------|----------------|
| "Easy setup" | PostgreSQL app is simple enough |
| "Everyone uses it" | Not a valid reason |
| "Portable" | pg_dump is portable enough |
| "Isolated" | Local development doesn't need it |

**Our approach:**
- PostgreSQL app (macOS) - just start it
- No container complexity
- Easier debugging

---

## Why PostgreSQL? (Not Because "Everyone Uses It")

We use PostgreSQL because it **solves our exact problems**:

| Problem | PostgreSQL Solution |
|---------|-------------------|
| Skills → Projects (many-to-many) | JOINs via project_skills table |
| Find tasks by status + priority | SQL WHERE + ORDER BY |
| Semantic memory search | pgvector |
| Reliable state | ACID transactions |
| Skills registry | Foreign keys, indexes |
| Multi-project support | project_id column |

**NOT valid reasons:**
- ❌ "Everyone uses it"
- ❌ "It's standard"
- ❌ "Docker makes it easy"

**We choose based on solving problems, not popularity.**

---

## General vs Project-Specific Data

Some data is **global** (reusable), some is **project-specific**:

### Global (scope = 'global')
- `skills` - central skills registry
- `tool_definitions` - available tools
- `agent_soul` - core identity templates
- `agent_identity` - identity patterns

### Project-Specific (scope = 'project')
- `agent_configs` - project agents
- `user_profiles` - project users
- `heartbeat_configs` - project schedules
- `task_results` - project results
- `tasks` - project tasks

**Database advantage:** Easy to query globally or per-project:
```sql
-- All global skills
SELECT * FROM skills WHERE scope = 'global';

-- Skills used by a project
SELECT s.* FROM skills s
JOIN project_skills ps ON s.id = ps.skill_id
WHERE ps.project_id = 'nezha';
```

---

## Skills Registry (Many-to-Many)

**File system problem:** Same skill copied to multiple `.openclaw/bootstrap/` folders

**Database solution:**

```
skills (global) ◄── project_skills (link) ──► projects
    │                    │
    ├── name             ├── project_id
    ├── content          ├── enabled
    ├── version          └── config
    └── source
```

**Benefits:**
- One skill → many projects
- Easy to search/filter
- Version tracking
- Project-specific config
- Source tracking (openclaw, custom, downloaded)

---

## Design Principles

1. **Operational data in PostgreSQL** - queryable, concurrent, reliable
2. **Human reference in files** - daily memory, docs, config
3. **Global tables for reusable** - skills, tools, templates
4. **Project ID for isolation** - multi-project support
5. **No Docker unless strong reason** - keep it simple
6. **Choose tools that solve problems** - not because of popularity

---

## Quick Reference for New Session

### Start Services
```bash
# PostgreSQL
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18-2 -l /Users/jk/Library/Application\ Support/Postgres/var-18-2/logfile start

# opencode serve
nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &

# Nezha
cd /Users/jk/gits/hub/nezha
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```

### Check Status
```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"
```

### Key Tables
- `tasks` - task queue
- `skills` - central skills registry
- `project_skills` - skill → project links
- `agent_configs` - project agents
- `memory` - semantic knowledge base
