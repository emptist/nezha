# PostgreSQL Path for Nezha

> **Updated (2026-04-01):** Full path no longer required - `psql` works directly in PATH.

## IMPORTANT

PostgreSQL is installed via **Postgres.app**, NOT via Homebrew.

## Correct Usage

```bash
# ✅ WORKS - Direct command (recommended)
psql -h 127.0.0.1 -U postgres -d nezha

# ✅ ALSO WORKS - Full path (legacy, still supported)
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha

# ❌ OLD WAY - Was required before 2026-04-01
# psql -h 127.0.0.1 -U postgres -d nezha  # Would fail before
```

## Why (Historical Context)

Previously, Postgres.app installed to `/Applications/Postgres.app/Contents/Versions/18/bin/`, which was **NOT** in system PATH.
As of 2026-04-01, `psql` is now accessible directly without full path.

## Common Queries

```bash
# Check issues
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status FROM issues WHERE status = 'OPEN';"

# Check tasks
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, status FROM tasks WHERE status = 'PENDING' LIMIT 10;"

# Check agent scores
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT agent_id, composite_score FROM agent_scores ORDER BY composite_score DESC LIMIT 5;"

# Close an issue
psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE issues SET status = 'resolved', resolution = 'Fixed: description' WHERE id = 'issue_id';"
```

## Remember

Always use the full path. Many AI agents have been confused by this!
