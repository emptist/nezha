# Plan: Rename `trae-reflect*` → `auto-reflect*`

## Background

The `trae-reflect` package and `trae_alone/` folder contain generic reflection tools that are NOT editor-specific. They should be renamed to `auto-reflect*` to avoid confusion with the Trae Editor.

## Scope

### Items TO Rename (Generic Reflection Tools)

| Item            | From             | To               |
| --------------- | ---------------- | ---------------- |
| Package         | `trae-reflect`   | `auto-reflect`   |
| Folder          | `trae_alone/`    | `auto-reflect/`  |
| Class           | `TraeReflect`    | `AutoReflect`    |
| Interfaces      | `Trae*Marker`    | `Auto*Marker`    |
| CLI command     | `trae-reflect`   | `auto-reflect`   |
| npm scripts     | `trae:reflect`   | `auto:reflect`   |
| Memory source   | `'trae-reflect'` | `'auto-reflect'` |
| Memory metadata | `'trae-alone'`   | `'auto-reflect'` |

### Items NOT Renaming (Editor-Specific)

- `.trae/skills/` - Real directory name
- `TraeSkillSyncService` - Syncs to `.trae/skills/`
- `TraeAutoRecoveryService` - Named for Trae project
- `source = 'trae-ai'` - Real AI identifier

## Replacement Strategy: Pattern-Based, Case-Ordered

To avoid partial matches and breaking things like `trae_alone` → `auto_alone` → `auto-alone`, we use exact pattern replacement in ordered steps.

### Phase 1: Exact String Replacements (Safest First)

| Step | Pattern                     | Replace With   | Rationale                             |
| ---- | --------------------------- | -------------- | ------------------------------------- |
| 1.1  | `trae-reflect` (hyphen)     | `auto-reflect` | Exact hyphen match                    |
| 1.2  | `trae_reflect` (underscore) | `auto-reflect` | Underscore → hyphen (matches package) |
| 1.3  | `trae:reflect` (colon)      | `auto-reflect` | Colon → hyphen (matches package)      |
| 1.4  | `trae_alone` (underscore)   | `auto-reflect` | Underscore → hyphen (matches package) |

**Note**: Steps 1.2-1.4 all convert to hyphenated `auto-reflect` to match package naming.

### Phase 2: Class/Interface Replacements

| Step | Pattern                    | Replace With               |
| ---- | -------------------------- | -------------------------- |
| 2.1  | `TraeReflect`              | `AutoReflect`              |
| 2.2  | `TraeReflectConfig`        | `AutoReflectConfig`        |
| 2.3  | `TraeLearnMarker`          | `AutoLearnMarker`          |
| 2.4  | `TraePromptUpdateMarker`   | `AutoPromptUpdateMarker`   |
| 2.5  | `TraeIssueMarker`          | `AutoIssueMarker`          |
| 2.6  | `TraeReviewResponseMarker` | `AutoReviewResponseMarker` |
| 2.7  | `TraeReflectResult`        | `AutoReflectResult`        |

### Phase 3: String Literals in Code

| Step | Pattern          | Replace With     |
| ---- | ---------------- | ---------------- |
| 3.1  | `'trae-reflect'` | `'auto-reflect'` |
| 3.2  | `'trae-alone'`   | `'auto-reflect'` |

### Phase 4: Package.json

| Step | Pattern                  | Replace With             |
| ---- | ------------------------ | ------------------------ |
| 4.1  | `"name": "trae-reflect"` | `"name": "auto-reflect"` |
| 4.2  | `"trae-reflect"` in bin  | `"auto-reflect"`         |
| 4.3  | `trae:reflect` script    | `auto:reflect`           |
| 4.4  | `trae:check` script      | `auto:check`             |
| 4.5  | `trae:learnings` script  | `auto:learnings`         |

### Phase 5: Folder/File Rename (Last)

| Step | Action                                               |
| ---- | ---------------------------------------------------- |
| 5.1  | Rename folder `trae_alone/` → `auto-reflect/`        |
| 5.2  | Rename `TraeReflect.ts` → `AutoReflect.ts`           |
| 5.3  | Rename `TraeReflect.test.ts` → `AutoReflect.test.ts` |

### Phase 6: Database Migration

```sql
-- Step 6.1: Update memory source
UPDATE memory SET source = 'auto-reflect' WHERE source = 'trae-reflect';

-- Step 6.2: Update memory metadata context
UPDATE memory
SET metadata = REPLACE(metadata::text, '"trae-alone"', '"auto-reflect"')::jsonb
WHERE metadata::text LIKE '%trae-alone%';
```

## Verification After Each Phase

| Phase | Check Command                                     | Expected  |
| ----- | ------------------------------------------------- | --------- |
| 1     | `grep -r "trae-reflect" --include="*.ts"`         | 0 matches |
| 2     | `grep -r "TraeReflect" --include="*.ts"`          | 0 matches |
| 3     | `grep -r "'trae-"`                                | 0 matches |
| 4     | `cat package.json \| grep trae`                   | 0 matches |
| 5     | `ls -la \| grep trae_alone`                       | 0 matches |
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
2. **String literals**: Should `'trae-reflect'` strings be handled specially (Phase 3) or are they covered by Phase 1?
3. **Verification approach**: Is the grep-based verification sufficient?
4. **Database migration timing**: Should DB migration happen before or after code changes?

## Status

- [ ] Plan created
- [ ] Awaiting AI review
- [ ] User approval
- [ ] Execution pending
