# Nezha Long-Term Memory

> Curated knowledge and learnings for Nezha AI Agent

> **IMPORTANT**: This file is part of Nezha's ROM. AI must read `.memory/` directory on startup!

## Agent Identity

**Name:** Nezha (哪吒)
**Role:** Autonomous AI software engineering agent
**Purpose:** Execute software development tasks continuously with self-improvement capabilities

## Architecture Principle: Services, Not Dependencies

**Critical Concept:** Nezha provides services TO other software, not depends ON other software.

### Dependency vs Service

| Concept        | Definition         | Example                          |
| -------------- | ------------------ | -------------------------------- |
| **Dependency** | Required to run    | Nezha needs PostgreSQL           |
| **Service**    | Provided to others | Trae uses Nezha to execute tasks |

### Examples

- **Trae detection is NOT a dependency:**
  - Nezha checks if Trae files exist at `~/.trae/`
  - If Trae is not installed, the check returns false - no error
  - Trae might not even exist on the machine - no problem
  - This is **passive detection**, not a dependency

- **OpenCode integration is NOT a dependency:**
  - OpenCode sends tasks to Nezha via CLI or HTTP
  - If OpenCode isn't running, Nezha continues working (heartbeat mode)
  - This is **active service**, not a dependency

### Clear Separation

```
┌─────────────────────────────────────────────┐
│  Nezha Core (无外部依赖)                      │
│  - 只依赖 PostgreSQL                         │
└─────────────────────────────────────────────┘
              ↑ 提供服务 (Services provided)
              │
    ┌─────────┼─────────┐
    │         │         │
 OpenCode   Trae      Pi
(调用nezha) (调用nezha) (调用nezha)
```

**Remember:** " nezha monitors X files" ≠ " nezha depends on X"

The detection is passive and optional. The presence enables features; absence simply means those features are skipped.

## Memory Structure

### Long-Term Memory (ROM)

- **Location:** `.memory/` (root directory)
- **Files:** `MEMORY.md`, `POSTGRESQL_PATH.md`, `reflections.md`, `AI_LEVELS.md`
- **Purpose:** Critical system knowledge that AI must read on startup

### Short-Term Memory

- **Location:** `.tmp/nezha-memory/` (daily append)
- **Files:** `YYYY-MM-DD.md` (daily logs)
- **Purpose:** Session handoffs, working notes

## Database Schema (AI Tool Index)

On startup, also read the `table_documentation` table - it contains:

```sql
-- Query all table documentation
SELECT table_name, purpose, key_columns, cli_commands
FROM table_documentation
ORDER BY table_name;

-- Tables AI can modify
SELECT table_name, purpose FROM table_documentation
WHERE ai_can_modify = true;
```

This table is the **AI's tool index** - tells AI what database capabilities are available, what each table does, and what CLI commands can be used.

**AI's Responsibility:** Maintain and grow this table! When adding new tables, features, or capabilities, update `table_documentation` so future AIs can discover and use them. This is the source of truth for AI autonomy.

## Self-Driven Workflow (Startup + After Each Task)

AI should check for pending work at two points:

### 1. At Startup

Before doing anything else, check for pending tasks and issues:

```sql
-- Check pending tasks
SELECT id, title, priority, status FROM tasks
WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 5;

-- Check open issues
SELECT id, title, severity, status FROM issues
WHERE status = 'OPEN' ORDER BY severity DESC LIMIT 5;
```

### 2. After Completing Each Task

After finishing work, check again to pick up new tasks. This creates a continuous self-driven workflow.

**Tools Available:** Use MCP tools or CLI commands (see `table_documentation`) to query and work with tasks/issues. The system is designed for AI to operate autonomously - check, work, learn, repeat.

## How Nezha Works

### 1. Heartbeat-based Task Execution

- HeartbeatService runs on interval, checks for pending tasks in database
- On task ready: creates AI session with AIProvider, executes task
- After completion: stores result in memory, updates task status
- **No OpenCode HTTP API calls** - humans use OpenCode directly, Nezha manages database

### 2. Memory System

- PostgreSQL-based with vector embeddings for semantic search
- Two memory services: MemoryService (permanent) and DailyMemory (ephemeral)
- Embeddings generated via Ollama (nomic-embed-text) or Zhipu (embedding-2)
- Vector similarity search using pgvector or cosine similarity

### 3. AI Communication (Souls & Viewers)

- Each AI has a "soul" stored in `souls` table with identity and personality
- `viewers[]` array tracks who has seen memory/issues/skills
- Broadcasts via `project_communications` table
- MCP tools for AI-to-AI communication: learn, memory_search, check_broadcasts

### 4. WebSocket Real-time Updates

- HealthServer polls broadcasts every 5 seconds
- Pushes notifications to connected WebSocket clients
- MCP server for AI tool access (nezha-learning)

## Database Schema

### Core Tables

| Table                    | Purpose                               |
| ------------------------ | ------------------------------------- |
| `tasks`                  | Task queue with status tracking       |
| `memory`                 | Long-term knowledge with embeddings   |
| `skills`                 | Skill registry with versioning        |
| `issues`                 | Bug/feature tracking                  |
| `project_communications` | Inter-project messages & broadcasts   |
| `prompt_suggestions`     | System prompt improvement suggestions |
| `souls`                  | AI identity/personality (SOUL.md)     |

### Support Tables

| Table              | Purpose                   |
| ------------------ | ------------------------- |
| `agent_identity`   | Registered agents         |
| `agent_scores`     | Agent performance metrics |
| `daily_memory`     | Ephemeral session memory  |
| `meeting_opinions` | Meeting records           |
| `task_audit_log`   | Operation audit trail     |

### Viewers Tracking

The `memory`, `issues`, and `skills` tables have a `viewers[]` array to track which AIs have seen each item. This enables privacy and prevents duplicate notifications.

## Important Lessons Learned

### 1. PostgreSQL Path (CRITICAL)

> **Updated 2026-04-01:** Full path no longer required - `psql` works directly.

Postgres.app is installed at `/Applications/Postgres.app/Contents/Versions/18/bin/`, but now accessible via PATH.

```bash
# ✅ WORKS - Direct command (recommended)
psql -h 127.0.0.1 -U postgres -d nezha

# ✅ ALSO WORKS - Full path (legacy)
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha
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

### MCP Tools (nezha-learning)

| Tool                    | Description                               |
| ----------------------- | ----------------------------------------- |
| `learn`                 | Save insight/learning to memory           |
| `memory_search`         | Search memories (marks as viewed)         |
| `check_broadcasts`      | Get pending broadcasts (marks as read)    |
| `respond_to_broadcast`  | Respond to a broadcast                    |
| `get_skill`             | Load a skill (marks as viewed)            |
| `get_soul`              | Get AI soul/personality                   |
| `save_soul`             | Save AI soul/personality                  |
| `get_system_info`       | Get system status (issues, tasks, skills) |
| `suggest_prompt_update` | Suggest system prompt improvements        |
| `whoami`                | Get current agent identity                |

### Memory Tools

| Tool                     | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `memory.save()`          | Save content to memory with optional embedding |
| `memory.vectorSearch()`  | Semantic search using embeddings               |
| `memory.keywordSearch()` | Full-text keyword search                       |
| `memory.hybridSearch()`  | Combined vector + keyword search               |
| `memory.getByProject()`  | Get memories by project                        |
| `memory.getById()`       | Get single memory by ID                        |

### Heartbeat Tools

| Tool                             | Description                  |
| -------------------------------- | ---------------------------- |
| `HeartbeatService.executeTask()` | Execute task with AIProvider |

## Configuration

- **Heartbeat Interval:** 30 seconds (configurable)
- **Task Retry:** 3 attempts with exponential backoff
- **Max Memory Age:** 30 days (configurable)
- **Embedding Model:** nomic-embed-text (Ollama) or embedding-2 (Zhipu)
- **PostgreSQL Host:** localhost:5432 (configurable via .env)

## Self-Improvement Guidelines

### Autonomous Loop (2026-03-27)

Nezha 实现了完整的自主改进循环：

```
1. HeartbeatService 执行任务 → 注入广播到提示
2. AI 完成任务 → 调用 areflect 保存学习
3. 学习保存到 memory 表
4. Inter-Review 评审代码变更
5. 从评审中提取新学习 → 回到步骤 1
```

**关键**: HeartbeatService.getRecentBroadcasts() 确保 AI 看到最新广播。

### After Each Task

1. What worked well?
2. What could be improved?
3. Any novel solutions discovered?
4. Patterns worth remembering?

If novel insight found, save to memory with high importance. If pattern repeats, consider suggesting system prompt updates.

### Broadcast Workflow

1. 发送广播: `nezha share <text>` 或 MCP `learn()`
2. 检查广播: MCP `check_broadcasts()`
3. 响应广播: MCP `respond_to_broadcast(broadcast_id, response)`

## Database Access

```bash
# PostgreSQL full path (IMPORTANT!)
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha

# Common queries
psql -c "SELECT COUNT(*) FROM tasks WHERE status = 'PENDING';"
psql -c "SELECT title, status FROM tasks ORDER BY priority DESC LIMIT 10;"
psql -c "SELECT content, source FROM memory ORDER BY created_at DESC LIMIT 10;"
```
