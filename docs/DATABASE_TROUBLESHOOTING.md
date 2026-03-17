# Database Troubleshooting Guide

**Created**: 2026-03-17  
**Issue**: Database connection failure during testing  
**Error**: `password authentication failed for user "postgres"`

---

## 🚨 Problem Description

When attempting to test the Nezha system, the following error occurred:

```
error: password authentication failed for user "postgres"
    at /Users/jk/gits/hub/nezha/node_modules/pg-pool/index.js:45:11
```

**Root Cause Analysis**:
1. PostgreSQL data directory exists at `/opt/homebrew/var/postgres`
2. PostgreSQL binaries (postgres, psql) are NOT in PATH
3. PostgreSQL service is not running
4. Database may not be properly installed or configured

---

## 🔧 Solutions

### Solution 1: Install PostgreSQL via Homebrew (Recommended)

**Step 1: Install PostgreSQL**
```bash
brew install postgresql@15
```

**Step 2: Start PostgreSQL service**
```bash
brew services start postgresql@15
```

**Step 3: Create database and user**
```bash
# Connect to PostgreSQL
psql postgres

# In psql shell:
CREATE DATABASE nezha;
CREATE USER postgres WITH PASSWORD 'Podbmima.jigm';
GRANT ALL PRIVILEGES ON DATABASE nezha TO postgres;
\q
```

**Step 4: Verify connection**
```bash
node dist/cli/index.js tasks
```

---

### Solution 2: Use Docker (Alternative)

**Step 1: Create Docker Compose file**

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: nezha-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: Podbmima.jigm
      POSTGRES_DB: nezha
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./src/db/migrations:/docker-entrypoint-initdb.d
    restart: unless-stopped

volumes:
  postgres_data:
```

**Step 2: Start PostgreSQL**
```bash
docker-compose up -d
```

**Step 3: Verify connection**
```bash
docker-compose ps
node dist/cli/index.js tasks
```

**Step 4: Stop when done**
```bash
docker-compose down
```

---

### Solution 3: Use Existing PostgreSQL Installation

If PostgreSQL is already installed but not in PATH:

**Step 1: Find PostgreSQL binaries**
```bash
# Try common locations
ls -la /usr/local/bin/postgres
ls -la /usr/local/bin/psql
ls -la /opt/homebrew/bin/postgres
ls -la /opt/homebrew/bin/psql

# Or search for them
find /usr/local -name "psql" 2>/dev/null
find /opt/homebrew -name "psql" 2>/dev/null
```

**Step 2: Add to PATH (if found)**
```bash
# Add to ~/.zshrc or ~/.bash_profile
export PATH="/path/to/postgresql/bin:$PATH"

# Reload shell
source ~/.zshrc
```

**Step 3: Start PostgreSQL**
```bash
# Using pg_ctl
pg_ctl -D /opt/homebrew/var/postgres start

# Or using postgres directly
postgres -D /opt/homebrew/var/postgres
```

---

## 📋 Verification Steps

After applying any solution:

1. **Check PostgreSQL is running**:
   ```bash
   # Method 1: Using pg_isready
   pg_isready -h localhost -p 5432
   
   # Method 2: Using psql
   psql -U postgres -c "SELECT version();"
   
   # Method 3: Using lsof
   lsof -i :5432
   ```

2. **Check database exists**:
   ```bash
   psql -U postgres -l | grep nezha
   ```

3. **Test Nezha CLI**:
   ```bash
   node dist/cli/index.js tasks
   ```

4. **Add a test task**:
   ```bash
   node dist/cli/index.js task-add "Test task" "This is a test" 5
   ```

---

## 🎯 Recommended Approach

**For Development**: Use Docker (Solution 2)
- ✅ Easy to set up
- ✅ Isolated environment
- ✅ Easy to reset
- ✅ Consistent across machines

**For Production**: Use Homebrew installation (Solution 1)
- ✅ Native performance
- ✅ System integration
- ✅ Automatic updates
- ✅ Better resource management

---

## 🔄 Next Steps

After fixing database connection:

1. **Initialize database schema**:
   ```bash
   # Run migrations
   psql -U postgres -d nezha -f src/db/migrations/001_initial.sql
   ```

2. **Add test tasks**:
   ```bash
   node dist/cli/index.js task-add "Test basic functionality" "Simple test" 5
   ```

3. **Start continuous work service**:
   ```bash
   node dist/cli/index.js start
   ```

4. **Monitor execution**:
   ```bash
   node dist/cli/index.js status
   node dist/cli/index.js health
   ```

---

## 📚 Related Documentation

- [README.md](../README.md) - Main project documentation
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Developer guide
- [USER_GUIDE.md](./USER_GUIDE.md) - User guide
- [DATABASE_SCHEMA_DESIGN.md](./DATABASE_SCHEMA_DESIGN.md) - Database schema

---

## 🐛 Common Issues

### Issue 1: Port 5432 already in use

**Error**: `port 5432 is already in use`

**Solution**:
```bash
# Find what's using the port
lsof -i :5432

# Kill the process
kill -9 <PID>

# Or change port in .env
NEZHA_DB_PORT=5433
```

### Issue 2: Permission denied

**Error**: `permission denied for table tasks`

**Solution**:
```bash
# Grant permissions
psql -U postgres -d nezha -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;"
psql -U postgres -d nezha -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;"
```

### Issue 3: Database does not exist

**Error**: `database "nezha" does not exist`

**Solution**:
```bash
# Create database
psql -U postgres -c "CREATE DATABASE nezha;"

# Run migrations
psql -U postgres -d nezha -f src/db/migrations/001_initial.sql
```

---

**Status**: Awaiting database setup  
**Priority**: High  
**Assignee**: User (requires manual setup)
