# Direct Database Insertion Audit System

Now that we have atmReflect, direct database insertion is not recommended.
Instead, use the methods provided by atmReflect or CLI commands to save data.

## Why Use atmReflect or CLI?

1. **Consistency**: All inserts are tracked with proper source attribution
2. **Audit Trail**: Every insert is logged with who/what made the change
3. **Reminders**: AIs receive notifications when bypassing the system
4. **Better Tracking**: Easier to debug and understand data flow

## Audit System (Migration 056)

The system automatically monitors direct inserts and sends reminders.

### Monitored Tables

| Table | atmReflect Marker | CLI Command |
|-------|-------------------|-------------|
| `memory` | `[LEARN]` | `learn` |
| `tasks` | `[TASK]` | `task-add` |
| `issues` | `[ISSUE]` | `issue create` |
| `prompt_suggestions` | `[PROMPT_UPDATE]` | `prompt-suggest` |
| `project_communications` | `[ANNOUNCE]` | `announce` |
| `scheduled_tasks` | `[SCHEDULE]` | `schedule` |
| `meeting_opinions` | `[OPINION]` | `meeting opinion` |

### Allowed Sources

Direct inserts are allowed when `source` is one of:
- `atmReflect` - From atmReflect tool
- `cli` - From CLI commands
- `heartbeat` - From heartbeat system
- `scheduler` - From scheduler
- `migration` - From database migrations
- `system` - From system processes
- `api` - From API endpoints

### What Happens on Violation

1. **Audit Log**: Insert is logged to `direct_insert_audit` table
2. **Reminder Sent**: Notification sent to `project_communications`
3. **No Blocking**: Insert still succeeds (soft enforcement)

### Viewing Violations

```sql
-- View recent violations
SELECT * FROM v_direct_insert_violations ORDER BY created_at DESC LIMIT 10;

-- Count violations by table
SELECT table_name, COUNT(*) FROM direct_insert_audit GROUP BY table_name;

-- Check if reminders were sent
SELECT table_name, author, reminder_sent, created_at 
FROM direct_insert_audit 
WHERE reminder_sent = TRUE 
ORDER BY created_at DESC;
```

### Disabling Reminders for Specific Tables

```sql
-- Disable reminders for a table
UPDATE insert_reminders SET enabled = FALSE WHERE table_name = 'memory';

-- Re-enable reminders
UPDATE insert_reminders SET enabled = TRUE WHERE table_name = 'memory';
```

### Adding Custom Reminders

```sql
-- Add reminder for a new table
INSERT INTO insert_reminders (table_name, instruction) 
VALUES ('my_table', 'Use proper API endpoint instead of direct INSERT.');
```

## Best Practices for AIs

1. **Always use atmReflect** for reflection-style data
2. **Use CLI commands** for task/issue management
3. **Set proper source** when direct insert is necessary
4. **Check reminders** in project_communications for guidance

## Related Files

- `src/db/migrations/056_direct_insert_audit.sql` - Migration file
- `auto-reflect/src/AtmReflect.ts` - atmReflect implementation
- `src/cli/index.ts` - CLI commands
