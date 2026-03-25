# Nezha Long-Term Memory

> Curated knowledge and learnings for Nezha AI Agent

> **IMPORTANT**: This file is part of Nezha's ROM. AI must read `.memory/` directory on startup!

## Agent Identity

**Name:** Nezha (哪吒)
**Role:** Autonomous AI software engineering agent
**Purpose:** Execute software development tasks continuously with self-improvement capabilities

## Memory Structure

### Long-Term Memory (ROM)

- **Location:** `.memory/` (root directory)
- **Files:** `MEMORY.md`, `POSTGRESQL_PATH.md`, `reflections.md`
- **Purpose:** Critical system knowledge that AI must read on startup

### Short-Term Memory

- **Location:** `.tmp/nezha-memory/` (daily append)
- **Files:** `YYYY-MM-DD.md` (daily logs)
- **Purpose:** Session handoffs, working notes

## How Nezha Works

### 1. Heartbeat-based Task Execution

- Scheduler runs on interval, checks for pending tasks in database
- On task ready: calls Agent.executeTask() which sends task to opencode CLI
- After completion: stores result in memory, updates task status

### 2. Memory System

- PostgreSQL-based with vector embeddings for semantic search
- Two memory services: MemoryService (permanent) and DailyMemory (ephemeral)
- Embeddings generated via Ollama (nomic-embed-text) or Zhipu (embedding-2)
- Vector similarity search using pgvector or cosine similarity

### 3. Agent Communication

- Agent.ts communicates with opencode CLI via HTTP (port 4096)
- Session-based communication: create session, send message, get response
- Retry logic with exponential backoff

## Database Schema

### Core Tables

| Table                    | Purpose                               |
| ------------------------ | ------------------------------------- |
| `tasks`                  | Task queue with status tracking       |
| `memory`                 | Long-term knowledge with embeddings   |
| `skills`                 | Skill registry with versioning        |
| `issues`                 | Bug/feature tracking                  |
| `project_communications` | Inter-project messages                |
| `prompt_suggestions`     | System prompt improvement suggestions |

### Support Tables

| Table              | Purpose                   |
| ------------------ | ------------------------- |
| `agent_identity`   | Registered agents         |
| `agent_scores`     | Agent performance metrics |
| `daily_memory`     | Ephemeral session memory  |
| `meeting_opinions` | Meeting records           |
| `task_audit_log`   | Operation audit trail     |

## Important Lessons Learned

### 1. PostgreSQL Path (CRITICAL)

Postgres.app is installed at `/Applications/Postgres.app/Contents/Versions/18/bin/`, which is NOT in system PATH.

```bash
# ✅ CORRECT - Use full path
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha

# ❌ WRONG - Will fail
psql -h 127.0.0.1 -U postgres -d nezha
```

### 2. Code Change Sources (Workflow Triggers)

All code changes must originate from one of these three sources:

1. **Issue** - Bug report or feature request (`issues` table)
2. **Task** - Planned work item (`tasks` table)
3. **Inter-Review** - Review feedback requiring changes

**Issue Types** (like GitHub):

- `bug`, `inconsistency`, `feature`, `improvement`, `question`, `debt`, `proposal`

**Issue Severity**:

- `critical`, `high`, `medium`, `low`, `cosmetic`

**Required Workflow**: Issue/Task/Review → Plan → Implement → Test → Inter-Review → Commit → Push

### 3. CLI Commands

| Command                                               | Description                                         |
| ----------------------------------------------------- | --------------------------------------------------- |
| `nezha share <text>`                                  | Save reflection and broadcast to all AIs            |
| `nezha areflect <text>`                               | Parse [LEARN] markers and save structured learnings |
| `nezha tasks`                                         | List pending tasks                                  |
| `nezha start`                                         | Start daemon                                        |
| `nezha prompt-suggest <current> <suggested> <reason>` | Suggest system prompt updates                       |

### 3. Embedding Column Already Exists

- Migration 003_embedding_support.sql adds `embedding vector(768)` to memory table
- Uses pgvector extension for similarity search
- Index: `idx_memory_embedding` using ivfflat with vector_cosine_ops

### 4. Search Methods Available

- `vectorSearch()` - Semantic search using embeddings
- `keywordSearch()` - Full-text search using PostgreSQL tsvector
- `hybridSearch()` - Combines vector + keyword with weighted scoring

### 5. Task Execution Flow

- Task added to database → Scheduler picks it up → Agent executes → Result stored in memory
- Task status: PENDING → RUNNING → COMPLETED/FAILED

## Available Tools

### Memory Tools

| Tool                     | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `memory.save()`          | Save content to memory with optional embedding |
| `memory.vectorSearch()`  | Semantic search using embeddings               |
| `memory.keywordSearch()` | Full-text keyword search                       |
| `memory.hybridSearch()`  | Combined vector + keyword search               |
| `memory.getByProject()`  | Get memories by project                        |
| `memory.getById()`       | Get single memory by ID                        |

### Agent Tools

| Tool                             | Description                   |
| -------------------------------- | ----------------------------- |
| `Agent.executeTask()`            | Execute task via opencode CLI |
| `AgentSystem.registerAgent()`    | Register agent with system    |
| `HeartbeatService.executeTask()` | Execute task with retry logic |

## Configuration

- **Heartbeat Interval:** 30 seconds (configurable)
- **Task Retry:** 3 attempts with exponential backoff
- **Max Memory Age:** 30 days (configurable)
- **Embedding Model:** nomic-embed-text (Ollama) or embedding-2 (Zhipu)
- **PostgreSQL Host:** localhost:5432 (configurable via .env)

## Self-Improvement Guidelines

After each task, reflect on:

1. What worked well?
2. What could be improved?
3. Any novel solutions discovered?
4. Patterns worth remembering?

If novel insight found, save to memory with high importance. If pattern repeats, consider suggesting system prompt updates.

## Database Access

```bash
# PostgreSQL full path (IMPORTANT!)
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha

# Common queries
psql -c "SELECT COUNT(*) FROM tasks WHERE status = 'PENDING';"
psql -c "SELECT title, status FROM tasks ORDER BY priority DESC LIMIT 10;"
psql -c "SELECT content, source FROM memory ORDER BY created_at DESC LIMIT 10;"
```
