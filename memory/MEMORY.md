# System Configuration Memory

**Purpose**: Permanent storage of critical system configuration and environment information  
**Created**: 2026-03-17  
**Last Updated**: 2026-03-17

---

## 🗄️ Database Configuration

### PostgreSQL Installation

**Installation Method**: macOS Application (APP)
- **NOT** Homebrew
- **NOT** Docker
- Installed as a macOS application

**Data Directory**: `/opt/homebrew/var/postgres`

**Authentication Method**: Keychain
- Uses macOS Keychain for authentication
- **NO password required**
- Password field should be EMPTY in `.env`

### Connection Configuration

```bash
# Correct configuration for Keychain authentication
NEZHA_DB_HOST=localhost
NEZHA_DB_PORT=5432
NEZHA_DB_NAME=nezha
NEZHA_DB_USER=postgres
NEZHA_DB_PASSWORD=  # EMPTY for Keychain auth
```

### Binary Locations

PostgreSQL binaries are NOT in PATH by default:
- `postgres`: Not in PATH
- `psql`: Not in PATH
- `pg_isready`: Not in PATH

**To use PostgreSQL tools**:
```bash
# Option 1: Find and add to PATH
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

# Option 2: Use full path
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -U postgres
```

### Database Initialization

If database doesn't exist:
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE nezha;

# Run migrations
\c nezha
\i src/db/migrations/001_initial.sql
```

---

## 🔑 Keychain Authentication

### How It Works

1. PostgreSQL is configured to use `trust` or `peer` authentication for local connections
2. macOS Keychain manages authentication credentials
3. No password is needed in connection string

### pg_hba.conf Configuration

Location: `/opt/homebrew/var/postgres/pg_hba.conf`

Should contain:
```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
```

---

## 📝 Important Lessons Learned

### Lesson 1: Password Validation Bug

**Problem**: `Config.validate()` rejected empty passwords
**Root Cause**: Assumed all PostgreSQL connections require password
**Solution**: Removed password validation to support Keychain/trust auth
**File**: `src/config/Config.ts` line 166-168

### Lesson 2: Memory System Design Flaw

**Problem**: Critical configuration not remembered between sessions
**Root Cause**: Memory system not integrated with system configuration
**Solution**: Create this SYSTEM_MEMORY.md file
**Comparison**: OpenClaw uses HEARTBEAT.md effectively

### Lesson 3: Installation Method Matters

**Problem**: Assumed Homebrew or Docker installation
**Root Cause**: Didn't consider APP installation method
**Solution**: Document all possible installation methods
**Impact**: Affects binary locations, PATH, authentication

### Lesson 4: CI Artifact Naming Mismatch

**Problem**: CI workflow looked for `dist/index.js` but actual output was `dist/NezhaCore.js`
**Root Cause**: Build output filename changed without updating CI workflow
**Solution**: Always verify CI workflow references match actual build outputs
**Impact**: CI passes but verification step fails
**Pattern**: After any build configuration change, audit all CI workflow files for artifact references

---

## 🔄 Memory System Improvements

### Current Issues

1. **No persistent system configuration**
   - Database connection details lost between sessions
   - Environment-specific information not saved
   - Installation methods not documented

2. **No automatic learning**
   - System doesn't learn from past successes
   - Same problems repeated
   - No knowledge accumulation

3. **No integration with HEARTBEAT**
   - HEARTBEAT.md only tracks tasks
   - Doesn't track system state
   - Doesn't track configuration

### Proposed Solutions

1. **SYSTEM_MEMORY.md** (this file)
   - Permanent storage of critical configuration
   - Version controlled
   - Human and AI readable

2. **Database Memory Table**
   - Store configuration in `memory` table
   - Tag with `system-configuration`
   - High importance (10)

3. **HEARTBEAT.md Enhancement**
   - Add "System State" section
   - Track configuration changes
   - Record successful connections

4. **Automatic Configuration Capture**
   - On first successful connection, save config
   - Detect installation method automatically
   - Store in multiple places (file + database)

---

## 🎯 Action Items

- [x] Fix `Config.validate()` to allow empty password
- [x] Update `.env` to use empty password
- [x] Test database connection
- [x] Store this configuration in database memory table
- [ ] Update HEARTBEAT.md with system state
- [ ] Create automatic configuration detection script
- [ ] Update all documentation
- [x] Fix CI artifact reference: `dist/index.js` → `dist/NezhaCore.js`

---

## 📚 Related Files

- `.env` - Environment variables
- `src/config/Config.ts` - Configuration loader
- `src/db/DatabaseClient.ts` - Database connection
- `docs/DATABASE_TROUBLESHOOTING.md` - Troubleshooting guide
- `HEARTBEAT.md` - Task tracking

---

## 🔍 Quick Reference

### Test Database Connection
```bash
# Should work without password
psql -U postgres -d nezha -c "SELECT version();"

# Or with Node.js
node dist/cli/index.js tasks
```

### Start PostgreSQL (if not running)
```bash
# Check if running
ps aux | grep postgres

# Start if needed (APP installation)
open -a Postgres

# Or check with pg_isready (if in PATH)
pg_isready -h localhost -p 5432
```

### Check Configuration
```bash
# View current config
cat .env | grep NEZHA_DB

# Should show empty password
# NEZHA_DB_PASSWORD=
```

---

## 🔄 Inter-Review System

### Overview
AI-powered code review system where agents review each other's work.

### Components
- **InterReviewService**: Core review logic stored in `src/services/InterReviewService.ts`
- **InterReviewCommands**: CLI commands in `src/cli/InterReviewCommands.ts`
- **AutoReviewService**: Auto-triggers reviews on task completion

### CLI Commands
```bash
nezha review-request [commit]      # Request AI review
nezha review-show [id]             # Show review details
nezha review-stats                 # Show statistics
nezha review-respond <id> <msg>    # Respond to review
```

### Integration with ContinuousImprovementLoop
- Reviews auto-trigger after improvement tasks complete
- Learnings extracted and stored in PostgreSQL memory
- Fallback to self-scoring if review service unavailable

### Key Pattern
```
Task → Execute → Review (AI) → Extract Learnings → Store in Memory → Next Cycle
```

---

**Remember**: This file is part of the permanent memory system. Update it whenever system configuration changes!
