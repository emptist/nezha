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

## Summary

**Nezha uses PostgreSQL because:**

1. ✅ **Queryable** - Find anything instantly
2. ✅ **Concurrent** - Multiple workers safely
3. ✅ **Searchable** - Semantic similarity search
4. ✅ **Portable** - Export/import entire system
5. ✅ **Reliable** - ACID transactions

**Files still exist for:**
- Human-readable daily memory
- Machine-specific configuration
- Documentation

**This makes Nezha a universal toolset** that can be deployed anywhere with just PostgreSQL.
