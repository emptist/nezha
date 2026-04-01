# System Memory - Environment Configuration

**Created**: 2026-03-17  
**Updated**: 2026-04-01  
**Purpose**: Store critical configuration information to avoid repeated user queries

---

## PostgreSQL Configuration

### Installation Information

| Item               | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Method**         | macOS Application (Postgres.app)                            |
| **Version**        | 18                                                          |
| **Binary Path**    | `/Applications/Postgres.app/Contents/Versions/18/bin/`      |
| **psql Access**    | ✅ Works directly (as of 2026-04-01) - no full path needed  |
| **Data Directory** | `~/Library/Application Support/Postgres/var-18/`            |
| **Config File**    | `~/Library/Application Support/Postgres/var-18/pg_hba.conf` |

### Authentication

| Item         | Value                                          |
| ------------ | ---------------------------------------------- |
| **Current**  | Keychain authentication                        |
| **Issue**    | CLI tools and Node.js don't support it         |
| **Solution** | Modify pg_hba.conf to use trust authentication |

### Connection Configuration

```bash
# .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nezha
DB_USER=postgres
DB_PASSWORD=  # Empty, use trust authentication
```

### How to Fix Authentication

**Step 1**: Update .env file

```bash
NEZHA_DB_PASSWORD=
```

**Step 2**: Verify pg_hba.conf

```bash
# Should have:
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
```

**Step 3**: Test connection

```bash
psql -U postgres -d nezha -c "SELECT version();"
```

---

## OpenCode Configuration

### API Information

| Item            | Value      |
| --------------- | ---------- |
| **Provider ID** | opencode   |
| **Model ID**    | big-pickle |
| **Agent**       | build      |
| **Mode**        | build      |

### Session Files

| Item         | Value                                                 |
| ------------ | ----------------------------------------------------- |
| **Location** | `.tmp/nezha_session_*.json`                           |
| **Format**   | JSON                                                  |
| **Purpose**  | Store conversation history and task execution records |

---

## Project Structure

```
nezha/
├── src/
│   ├── core/
│   │   ├── Agent.ts
│   │   ├── Scheduler.ts
│   │   ├── HeartbeatService.ts
│   │   ├── MemoryService.ts
│   │   ├── ConversationLogger.ts
│   │   └── OpenCodeClient.ts
│   ├── db/
│   │   └── DatabaseClient.ts
│   └── config/
│       └── Config.ts
├── docs/
│   ├── systems/
│   ├── guides/
│   └── ...
├── conversations/
│   ├── YYYY-MM-DD/
│   │   └── session-*.jsonl
│   └── index.json
├── memory/
│   ├── HEARTBEAT.md
│   └── *.md
└── .tmp/
    └── nezha_session_*.json
```

---

## Key Decisions

### 1. Dual Mode Design

| Mode            | Storage       | Reason                                |
| --------------- | ------------- | ------------------------------------- |
| **Development** | File system   | May not connect to database           |
| **Production**  | Database only | Data isolation, multi-project support |

### 2. Continuous Improvement Mode

- **Choice**: Continuous improvement mode
- **Reason**: Best suited for Nezha's autonomous work goal
- **Features**: AI self-identifies, executes, reviews, learns

### 3. Conversation Recording

- **Format**: JSONL
- **Location**: conversations/YYYY-MM-DD/session-\*.jsonl
- **Index**: conversations/index.json

### 4. npm Mirror

- **Recommendation**: Use cnpm to install from mirror
- **Reason**: Slow access to official npm in China
- **Command**: `cnpm install`

---

## Known Issues

| Issue                        | Impact                          | Solution                    | Priority |
| ---------------------------- | ------------------------------- | --------------------------- | -------- |
| PostgreSQL auth config       | Cannot use database             | Modify pg_hba.conf to trust | HIGH     |
| OpenCode API not configured  | Cannot use OpenCode integration | Configure API URL and auth  | HIGH     |
| HeartbeatService not running | Cannot work continuously        | Start after database fix    | HIGH     |

---

## Progress Tracking

### Completed

- [x] Conversation recording system
- [x] OpenCode client
- [x] Dual mode memory design
- [x] Dual mode conversation design
- [x] Continuous improvement system design

### In Progress

- [ ] PostgreSQL configuration modification
- [ ] Database connection test
- [ ] OpenCode API configuration

### Pending

- [ ] Continuous work startup
- [ ] Initial task addition
- [ ] Autonomous learning implementation

---

## Next Steps

1. **User Action**: Modify pg_hba.conf to trust authentication
2. **AI Action**: Test database connection
3. **AI Action**: Configure OpenCode API
4. **AI Action**: Start continuous work mode

---

**Important**: This file records critical information to avoid repeated user queries. Check this file first when encountering issues.
