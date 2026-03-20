# Nezha - Continuous AI Improvement System

> **IMPORTANT**: Think of these MD files as the ROM for Nezha - essential for booting, minimal in size, foundational for everything else.

## READ THIS FIRST

**For new AI sessions, read these files in order:**

### Essential (Must Read)

1. **[Read_First.md](./Read_First.md)** ← (this file) → How to start/restart
2. **[PHILOSOPHY.md](./PHILOSOPHY.md)** → Why we use PostgreSQL, design decisions
3. **[AGENTS.md](./AGENTS.md)** → AI instructions, priorities, and constraints
4. **[README.md](./README.md)** → Full documentation

### Recommended (Deeper Understanding)

5. **[docs/USAGE.md](./docs/USAGE.md)** → Architecture, AI tools, memory/skill systems
6. **[LEARNING_SYSTEM.md](./LEARNING_SYSTEM.md)** → How AI learns autonomously
7. **[docs/SKILL_SYSTEM.md](./docs/SKILL_SYSTEM.md)** → PostgreSQL-first skill loading
8. **[docs/AI_COLLABORATION_GUIDE.md](./docs/AI_COLLABORATION_GUIDE.md)** → Multi-agent patterns
9. **[docs/ISSUE_TRACKING.md](./docs/ISSUE_TRACKING.md)** → Issue tracking for bugs/inconsistencies
10. **[docs/CASE_STUDY_system_discovery.md](./docs/CASE_STUDY_system_discovery.md)** → How to discover and resolve system issues
11. **[docs/PDCA_CYCLE.md](./docs/PDCA_CYCLE.md)** → Continuous improvement methodology
12. **[docs/BROADCAST_SYSTEM.md](./docs/BROADCAST_SYSTEM.md)** → Inter-AI communication

**Total AI onboarding: ~26 minutes**

## ROM Analogy

```
These MD files = ROM (essential boot instructions)
        │
        ├── Read_First.md → Emergency recovery
        ├── PHILOSOPHY.md → Why it works this way
        ├── AGENTS.md     → AI behavior rules
        ├── README.md     → How to start/boot
        ├── docs/OPENCODE_INTEGRATION.md → OpenCode integration approaches (CLI vs REST API)
        └── .env.example  → Default config

PostgreSQL = BIOS (initializes system)
        │
        └── Tables: tasks, skills, memory, etc.

Runtime = OS
        │
        └── opencode serve + Node.js

Apps = Tasks (AI doing work)
```

## Quick Start (For New AI Session)

> **Note**: Commands use the default PostgreSQL path. Set `PSQL_PATH` environment variable if different:
>
> ```bash
> export PSQL_PATH=/usr/local/bin/psql  # Linux/Homebrew
> export PSQL_PATH="/Applications/Postgres.app/Contents/Versions/18/bin/psql"  # macOS Postgres.app
> ```

### 1. Start Required Services

```bash
# Start PostgreSQL (if not running)
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl} \
  -D ~/Library/Application\ Support/Postgres/var-18-2 \
  -l ~/Library/Application\ Support/Postgres/var-18-2/logfile start

# Start opencode serve (REQUIRED for task execution)
nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &
sleep 3

# Start Nezha daemon
cd /Users/jk/gits/hub/nezha
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```

### 2. Check Current Status

```bash
# View task status (most common!)
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha \
  -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"

# View currently running tasks
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha \
  -c "SELECT title, started_at FROM tasks WHERE status = 'RUNNING';"

# View recently completed tasks
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha \
  -c "SELECT title, completed_at FROM tasks WHERE status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 5;"

# View daemon log
tail -20 .nezha.log

# Check if services are running
ps aux | grep "opencode serve"
ps aux | grep "dist/cli/index.js start"
```

### 3. Continue from Where Left Off

The system stores everything in PostgreSQL. To continue:

```bash
# Reset stuck RUNNING tasks to PENDING
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha \
  -c "UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING';"

# View pending tasks
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha \
  -c "SELECT id, title, status, priority FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 10;"

# View completed tasks
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha \
  -c "SELECT COUNT(*) FROM tasks WHERE status = 'COMPLETED';"
```

### 4. If System Crashed - Recovery Steps

> 📖 **详细命令说明**: 参见 [docs/OPENCODE_INTEGRATION.md](./docs/OPENCODE_INTEGRATION.md)

```bash
# 1. Rebuild if needed (after code changes)
cd /Users/jk/gits/hub/nezha
npm run build

# 2. Run migrations if new tables needed
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha \
  -f src/db/migrations/*.sql

# 3. Restart everything
pkill -f "opencode serve" 2>/dev/null
pkill -f "node dist/cli/index.js start" 2>/dev/null
sleep 2

nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```

---

## Database Schema

The system uses 27 tables for comprehensive task management, memory, and agent configuration.

### Core Tables

| Table             | Purpose                              |
| ----------------- | ------------------------------------ |
| `tasks`           | Main task queue with status tracking |
| `scheduled_tasks` | Cron-based task scheduling           |
| `memory`          | Long-term memory storage             |
| `skills`          | Skill definitions and configurations |
| `task_results`    | Task execution results               |
| `task_templates`  | Reusable task templates              |
| `task_audit_log`  | Task history and audit trail         |

### Agent & Project Tables

| Table                    | Purpose                         |
| ------------------------ | ------------------------------- |
| `agent_configs`          | Agent configuration settings    |
| `agent_identity`         | Agent identity and personality  |
| `agent_soul`             | Agent core behavior definitions |
| `projects`               | Multi-project support           |
| `project_skills`         | Project-specific skills         |
| `project_metrics`        | Project performance metrics     |
| `project_communications` | Inter-project messaging         |
| `project_config_history` | Configuration version history   |

### Security & Monitoring Tables

| Table                  | Purpose                                |
| ---------------------- | -------------------------------------- |
| `api_keys`             | API key management                     |
| `provider_api_keys`    | LLM provider API keys                  |
| `rate_limits`          | Rate limiting configuration            |
| `user_profiles`        | User settings and preferences          |
| `event_log`            | System event logging                   |
| `heartbeat_configs`    | Health monitoring configuration        |
| `process_pids`         | Track spawned process PIDs for cleanup |
| `inter_reviews`        | AI peer review system for code quality |
| `stuck_tasks_tracking` | Watchdog tracking for stuck tasks      |
| `failure_alerts`       | Failure alert management               |

### Utility Tables

| Table                 | Purpose                                 |
| --------------------- | --------------------------------------- |
| `dead_letter_queue`   | Failed message handling                 |
| `archived_memory`     | Compressed old memories                 |
| `auto_category_rules` | Automatic task categorization           |
| `auto_tag_rules`      | Automatic task tagging                  |
| `prompt_suggestions`  | Prompt template library                 |
| `tool_definitions`    | Custom tool definitions                 |
| `issues`              | Issue tracking for bugs/inconsistencies |

### tasks table (Core Schema)

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  priority INTEGER DEFAULT 0,
  result JSONB,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  depends_on UUID[] DEFAULT '{}',
  blocking UUID[] DEFAULT '{}',
  next_retry_at TIMESTAMPTZ,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 300,
  is_long_running BOOLEAN DEFAULT false,
  type TEXT DEFAULT 'implementation',
  assigned_to TEXT,
  category TEXT DEFAULT 'feature',
  tags TEXT[] DEFAULT '{}',
  auto_tagged BOOLEAN DEFAULT false
);
```

**Status Values:**

- `PENDING` - Waiting to be executed
- `RUNNING` - Currently being executed
- `COMPLETED` - Successfully completed
- `FAILED` - Failed (check error column)

**Key Queries:**

```sql
-- All tasks
SELECT * FROM tasks ORDER BY created_at DESC;

-- By status
SELECT * FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC;

-- Failed tasks
SELECT * FROM tasks WHERE status = 'FAILED';

-- Recent completed
SELECT id, title, completed_at FROM tasks WHERE status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 10;
```

---

## File Locations

- **Daily Memory**: `.tmp/nezha-memory/YYYY-MM-DD.md`
- **Long-term Memory**: `.tmp/nezha-memory/MEMORY.md`
- **Checkpoint**: `.tmp/nezha-state.json`
- **Logs**: `.nezha.log`

---

## Common Issues & Solutions

### Problem: Tasks stuck in RUNNING

```sql
UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING';
```

### Problem: opencode serve not responding

```bash
pkill -f "opencode serve"
nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &
```

### Problem: Build errors

```bash
cd /Users/jk/gits/hub/nezha
rm -rf dist
npm run build
```

### Problem: Database connection issues

```bash
# Check PostgreSQL is running
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha -c "SELECT 1;"
```

### Problem: Scheduler fails with "column does not exist"

```sql
-- If you see errors like "column started_at does not exist" or "column age_boost does not exist"
-- The schema may be outdated. Add missing columns:
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- If age_boost error appears, it's a SQL bug in Scheduler.ts - the CTE alias cannot be used in ORDER BY
-- Fix: Use a subquery layer (see src/core/Scheduler.ts line 222-254)
```

### Problem: Task fails with "fetch failed"

- Check if opencode server is running: `ps aux | grep "opencode serve"`
- Restart if needed: `pkill -f "opencode serve" && nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &`

### Problem: OpenCodeClient API mismatch (FIXED)

- Was: OpenCodeClient tried to use `/chat/completions` REST API which doesn't exist
- Fix: Changed to use `opencode run --attach` CLI command via child_process
- Code: src/core/OpenCodeClient.ts - uses spawn() to run opencode commands

---

## Running Occasional Tasks (without queue)

```bash
# Run a one-off task directly via opencode (bypasses Nezha task queue)
opencode run --attach http://localhost:4096 "Your prompt here"

# Or start a new session each time
opencode run "Your prompt here"
```

---

## Adding New Tasks

```bash
cd /Users/jk/gits/hub/nezha
node dist/cli/index.js task-add "Task Title" "Task description" priority
```

---

## Monitoring & Review Commands

### Dead Letter Queue (DLQ)

```bash
# List failed tasks in DLQ
node dist/cli/index.js dlq list

# List all (including resolved)
node dist/cli/index.js dlq list --all

# Resolve a DLQ item
node dist/cli/index.js dlq resolve <id> --notes "Fixed the issue"

# Retry a failed task
node dist/cli/index.js dlq retry <id>

# Delete a DLQ item
node dist/cli/index.js dlq delete <id>
```

### Failure Alerts

```bash
# List active alerts
node dist/cli/index.js alerts list

# Acknowledge an alert
node dist/cli/index.js alerts ack <id> --by "username"

# View alert statistics
node dist/cli/index.js alerts stats
```

### Watchdog (Process Monitoring)

```bash
# View watchdog statistics
node dist/cli/index.js watchdog stats

# Cleanup orphaned processes (older than 60 minutes)
node dist/cli/index.js watchdog cleanup --threshold 60
```

### AI Code Review

```bash
# Request a review of current changes
node dist/cli/index.js review request

# View pending reviews
node dist/cli/index.js review show

# View review statistics
node dist/cli/index.js review stats

# Respond to a review
node dist/cli/index.js review respond <review-id> "Response text"
```

---

## Current Status

Run this command to check current system status:

```bash
# Quick status check
${PSQL_PATH:-/Applications/Postgres.app/Contents/Versions/18/bin/psql} \
  -h 127.0.0.1 -U postgres -d nezha -c "
SELECT
  status,
  COUNT(*) as count
FROM tasks
GROUP BY status
ORDER BY count DESC;
"

# Check services
echo "=== Services ===" && \
ps aux | grep -E "(opencode serve|dist/cli/index.js)" | grep -v grep
```
