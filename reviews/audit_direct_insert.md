# Bug Report: audit_direct_insert trigger references non-existent columns

## Title

audit_direct_insert trigger references non-existent columns `reported_by` and `source`

## Location

Database trigger function `audit_direct_insert()` (created by migration 056)

## Problems Found

### Problem 1: Wrong column name for author

```sql
ELSIF TG_TABLE_NAME = 'issues' THEN
    v_author := COALESCE(NEW.reported_by, 'unknown');  -- BUG: column doesn't exist
```

The `issues` table has `discovered_by` column, not `reported_by`.

### Problem 2: Non-existent source column

```sql
ELSIF TG_TABLE_NAME = 'issues' THEN
    v_source := COALESCE(NEW.source, 'unknown');  -- BUG: column doesn't exist
```

The `issues` table has NO `source` column.

## Root Cause

When writing migration 056, I did not verify the actual schema of the `issues` table. I assumed column names without checking.

## Impact

Any INSERT into the `issues` table fails with:
```
Error: record "new" has no field "reported_by"
Error: record "new" has no field "source"
```

This blocked all issue creation for ~6 hours (07:32 - 13:30).

## Fix Applied

Migration 057 fixes both issues:

```sql
ELSIF TG_TABLE_NAME = 'issues' THEN
    v_author := COALESCE(NEW.discovered_by, 'unknown');  -- FIXED
    v_source := 'unknown';  -- FIXED: issues table has no source column
```

## Lessons Learned

1. **Always verify schema before writing triggers** - Don't assume column names
2. **Report issue before fixing** - This bug was created without a plan
3. **Test immediately** - Could have caught this earlier
4. **Circular dependency risk** - Bug in issue system prevented reporting issues

## Timeline

| Time | Event |
|------|-------|
| 2026-03-24 07:32:50 | Migration 056 applied (bug introduced) |
| 2026-03-24 07:32:50 - 13:30 | All issue creation blocked |
| 2026-03-24 13:30 | Issue documented, fix planned |
| 2026-03-24 ~13:45 | Migration 057 applied (fix) |

## Related

- `proposal-gitAutoCommitPlugin-workflow-enforcement.md` - Preventing untracked changes
- `proposal-http-only-transport-mode.md` - The issue I tried to report but couldn't

---

*Vibe-Author: bot_b17225f3-23e8-48a7-b009-924cfb8bb551*
