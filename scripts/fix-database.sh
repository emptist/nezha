# Database Connection Fix Script

This script will help fix the database connection issue.

## Current Status

- PostgreSQL is running on port 5432
- PostgreSQL is installed as macOS APP
- Data directory: /Users/jk/Library/Application Support/Postgres/var-18
- Password stored in Keychain: "Nezha PostgreSQL"

## Steps to Fix

### Step 1: Check if database exists

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -l
```

### Step 2: Create database if not exists

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -c "CREATE DATABASE nezha;"
```

### Step 3: Run migrations

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -d nezha -f src/db/migrations/001_initial.sql
```

### Step 4: Test connection

```bash
node dist/cli/index.js tasks
```

## Expected Outcome

After these steps, the database connection should work and we can start using the task scheduling system.
