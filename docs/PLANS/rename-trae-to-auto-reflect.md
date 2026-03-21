# Plan: Rename `auto-reflect*` → `auto-reflect*`

## Background

The `auto-reflect` package and `auto-reflect/` folder contain generic reflection tools that are NOT editor-specific. They should be renamed to `auto-reflect*` to avoid confusion with the Trae Editor.

## Scope

### Items TO Rename (Generic Reflection Tools)

| Item            | From             | To               |
| --------------- | ---------------- | ---------------- |
| Package         | `auto-reflect`   | `auto-reflect`   |
| Folder          | `auto-reflect/`    | `auto-reflect/`  |
| Class           | `AutoReflect`    | `AutoReflect`    |
| Interfaces      | `Trae*Marker`    | `Auto*Marker`    |
| CLI command     | `auto-reflect`   | `auto-reflect`   |
| npm scripts     | `auto:reflect`   | `auto:reflect`   |
| Memory source   | `'auto-reflect'` | `'auto-reflect'` |
| Memory metadata | `'trae-alone'`   | `'auto-reflect'` |

### Items NOT Renaming (Editor-Specific)

- `.trae/skills/` - Real directory name
- `TraeSkillSyncService` - Syncs to `.trae/skills/`
- `TraeAutoRecoveryService` - Named for Trae project
- `source = 'trae-ai'` - Real AI identifier

## Replacement Strategy: Pattern-Based, Case-Ordered

To avoid partial matches and breaking things like `auto-reflect` → `auto_alone` → `auto-alone`, we use exact pattern replacement in ordered steps.

### Phase 1: Exact String Replacements (Safest First)

| Step | Pattern                     | Replace With   | Rationale                             |
| ---- | --------------------------- | -------------- | ------------------------------------- |
| 1.1  | `auto-reflect` (hyphen)     | `auto-reflect` | Exact hyphen match                    |
| 1.2  | `auto-reflect` (underscore) | `auto-reflect` | Underscore → hyphen (matches package) |
| 1.3  | `auto:reflect` (colon)      | `auto-reflect` | Colon → hyphen (matches package)      |
| 1.4  | `auto-reflect` (underscore)   | `auto-reflect` | Underscore → hyphen (matches package) |

**Note**: Steps 1.2-1.4 all convert to hyphenated `auto-reflect` to match package naming.

### Phase 2: Class/Interface Replacements

| Step | Pattern                    | Replace With               |
| ---- | -------------------------- | -------------------------- |
| 2.1  | `AutoReflect`              | `AutoReflect`              |
| 2.2  | `AutoReflectConfig`        | `AutoReflectConfig`        |
| 2.3  | `AutoLearnMarker`          | `AutoLearnMarker`          |
| 2.4  | `AutoPromptUpdateMarker`   | `AutoPromptUpdateMarker`   |
| 2.5  | `AutoIssueMarker`          | `AutoIssueMarker`          |
| 2.6  | `AutoReviewResponseMarker` | `AutoReviewResponseMarker` |
| 2.7  | `AutoReflectResult`        | `AutoReflectResult`        |

### Phase 3: String Literals in Code

| Step | Pattern          | Replace With     |
| ---- | ---------------- | ---------------- |
| 3.1  | `'auto-reflect'` | `'auto-reflect'` |
| 3.2  | `'trae-alone'`   | `'auto-reflect'` |

### Phase 4: Package.json

| Step | Pattern                  | Replace With             |
| ---- | ------------------------ | ------------------------ |
| 4.1  | `"name": "auto-reflect"` | `"name": "auto-reflect"` |
| 4.2  | `"auto-reflect"` in bin  | `"auto-reflect"`         |
| 4.3  | `auto:reflect` script    | `auto:reflect`           |
| 4.4  | `trae:check` script      | `auto:check`             |
| 4.5  | `trae:learnings` script  | `auto:learnings`         |

### Phase 5: Folder/File Rename (Last)

| Step | Action                                               |
| ---- | ---------------------------------------------------- |
| 5.1  | Rename folder `auto-reflect/` → `auto-reflect/`        |
| 5.2  | Rename `AutoReflect.ts` → `AutoReflect.ts`           |
| 5.3  | Rename `AutoReflect.test.ts` → `AutoReflect.test.ts` |

### Phase 6: Database Migration

```sql
-- Step 6.1: Update memory source
UPDATE memory SET source = 'auto-reflect' WHERE source = 'auto-reflect';

-- Step 6.2: Update memory metadata context
UPDATE memory
SET metadata = REPLACE(metadata::text, '"trae-alone"', '"auto-reflect"')::jsonb
WHERE metadata::text LIKE '%trae-alone%';
```

## Verification After Each Phase

| Phase | Check Command                                     | Expected  |
| ----- | ------------------------------------------------- | --------- |
| 1     | `grep -r "auto-reflect" --include="*.ts"`         | 0 matches |
| 2     | `grep -r "AutoReflect" --include="*.ts"`          | 0 matches |
| 3     | `grep -r "'trae-"`                                | 0 matches |
| 4     | `cat package.json \| grep trae`                   | 0 matches |
| 5     | `ls -la \| grep auto-reflect`                       | 0 matches |
| 6     | `SELECT * FROM memory WHERE source LIKE '%trae%'` | 0 matches |

## Git Workflow

```bash
# 1. Create branch
git checkout -b rename/trae-to-auto

# 2. Execute Phase 1-5 (search & replace)

# 3. Build
npm run build

# 4. Test
npm test

# 5. If all pass → git commit
# 6. If fail → git checkout . and fix
```

## Open Questions (For AI Review)

1. **Phase 1 safety**: Is exact string replacement (Step 1.1-1.4) safer than replacing `trae` alone?
2. **String literals**: Should `'auto-reflect'` strings be handled specially (Phase 3) or are they covered by Phase 1?
3. **Verification approach**: Is the grep-based verification sufficient?
4. **Database migration timing**: Should DB migration happen before or after code changes?

## Status

- [ ] Plan created
- [ ] Awaiting AI review
- [ ] User approval
- [ ] Execution pending
