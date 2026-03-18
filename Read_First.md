# Nezha - Continuous AI Improvement System

> **IMPORTANT**: Think of these MD files as the ROM for Nezha - essential for booting, minimal in size, foundational for everything else.

## ROM Analogy

```
These MD files = ROM (essential boot instructions)
        │
        ├── README.md     → How to start/boot
        ├── PHILOSOPHY.md → Why it works this way  
        ├── Read_First.md → Emergency recovery
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

## Quick Start (For New AI Session)

### 1. Start Required Services

```bash
# Start PostgreSQL (if not running)
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18-2 -l /Users/jk/Library/Application\ Support/Postgres/var-18-2/logfile start

# Start opencode serve (REQUIRED for task execution)
nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &
sleep 3

# Start Nezha daemon
cd /Users/jk/gits/hub/nezha
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```

### 2. Check Current Status

```bash
# Check task status
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"

# Check daemon logs
tail -20 .nezha.log

# Check if services are running
ps aux | grep "opencode serve"
ps aux | grep "dist/cli/index.js start"
```

### 3. Continue from Where Left Off

The system stores everything in PostgreSQL. To continue:

```bash
# Reset stuck RUNNING tasks to PENDING
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING';"

# View pending tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status, priority FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 10;"

# View completed tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT COUNT(*) FROM tasks WHERE status = 'COMPLETED';"
```

### 4. If System Crashed - Recovery Steps

```bash
# 1. Rebuild if needed (after code changes)
cd /Users/jk/gits/hub/nezha
npm run build

# 2. Run migrations if new tables needed
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -f src/db/migrations/*.sql

# 3. Restart everything
pkill -f "opencode serve" 2>/dev/null
pkill -f "node dist/cli/index.js start" 2>/dev/null
sleep 2

nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```

---

## Database Schema

### tasks table

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
  depends_on UUID[] DEFAULT '{}',
  blocking UUID[] DEFAULT '{}'
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

### scheduled_tasks table

```sql
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  cron_expression TEXT,
  interval_ms BIGINT,
  next_run TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### memory table

```sql
CREATE TABLE memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id TEXT,
  content TEXT NOT NULL,
  metadata JSONB,
  tags TEXT[],
  importance INTEGER DEFAULT 0,
  source TEXT,
  embedding JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
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
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT 1;"
```

---

## Adding New Tasks

```bash
cd /Users/jk/gits/hub/nezha
node dist/cli/index.js task-add "Task Title" "Task description" priority
```

---

## Current Status (Update this on each handoff)

- Last checked: [UPDATE_TIMESTAMP]
- Completed tasks: [COUNT]
- Pending tasks: [COUNT]
- Running tasks: [COUNT]

Run this to update:
```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"
```
