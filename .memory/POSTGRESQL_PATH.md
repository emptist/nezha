# PostgreSQL Path for Nezha

## IMPORTANT

PostgreSQL is installed via **Postgres.app**, NOT via Homebrew.

## Correct Usage

```bash
# ✅ CORRECT - Use full path
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha

# ❌ WRONG - Will fail with "command not found"
psql -h 127.0.0.1 -U postgres -d nezha
```

## Why

Postgres.app installs to `/Applications/Postgres.app/Contents/Versions/18/bin/`, which is **NOT** in system PATH.

## Common Queries

```bash
# Check issues
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status FROM issues WHERE status = 'OPEN';"

# Check tasks
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, status FROM tasks WHERE status = 'PENDING' LIMIT 10;"

# Check agent scores
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT agent_id, composite_score FROM agent_scores ORDER BY composite_score DESC LIMIT 5;"

# Close an issue
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE issues SET status = 'resolved', resolution = 'Fixed: description' WHERE id = 'issue_id';"
```

## Remember

Always use the full path. Many AI agents have been confused by this!
