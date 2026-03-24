# Plan: Rename auto-reflect to atmReflect

```
  DONE (2026-03-24).
  - Code rename: commits 92dfc2c, 0f20e25
  - Folder kept as auto-reflect/ (preserves git history)
  - Database source updated to 'atmReflect'
```

## Background

The `auto-reflect` command name is confusing with `reflect`. This plan renames all occurrences to `atmReflect` (autonomous reflection), keeping "reflect" as the consistent root word.

**Key Design Decision**: Keep "reflect" as the root word in all commands. This allows a future single whole-word replace to update all variants consistently:

- `reflect` → `share`
- `atmReflect` → `atmShare`

## Naming Convention

| Current        | New           | Context                                 |
| -------------- | ------------- | --------------------------------------- |
| `auto-reflect` | `atmReflect`  | CLI command                             |
| `auto-reflect` | `atm-reflect` | Folder names, file paths, memory source |
| `auto_reflect` | `atm_reflect` | Database columns, snake_case contexts   |
| `AutoReflect`  | `AtmReflect`  | Class names, TypeScript interfaces      |
| `autoReflect`  | `atmReflect`  | Variable names, camelCase contexts      |
| `AUTOREFLECT`  | `ATMREFLECT`  | Constants, env vars                     |
| `Auto-Reflect` | `Atm-Reflect` | Titles, headers                         |
| `Auto-reflect` | `Atm-reflect` | Sentence start                          |

**CRITICAL**: Replace ALL occurrences everywhere without exclusion.

## Scope

### 1. Source Code Files

| File                                                                   | Changes                                    |
| ---------------------------------------------------------------------- | ------------------------------------------ |
| `src/cli/index.ts`                                                     | CLI command case, usage text               |
| `src/services/HeartbeatService.ts`                                     | Usage examples in prompts                  |
| `atm-reflect/src/cli.ts`                                               | Class import, usage text                   |
| `atm-reflect/src/AutoReflect.ts` → `AtmReflect.ts`                     | Class name, interface names, source string |
| `atm-reflect/src/index.ts`                                             | Export names                               |
| `atm-reflect/src/__tests__/AutoReflect.test.ts` → `AtmReflect.test.ts` | Class references                           |

### 2. Package Files

| File                       | Changes                   |
| -------------------------- | ------------------------- |
| `package.json`             | Binary name, script paths |
| `package-lock.json`        | Package references        |
| `atm-reflect/package.json` | Package name, binary name |

### 3. Documentation Files

| File                                              | Changes            |
| ------------------------------------------------- | ------------------ |
| `docs/NEW_AI_ONBOARDING.md`                       | Command examples   |
| `docs/KNOWLEDGE_MANAGEMENT_SYSTEM.md`             | Command examples   |
| `docs/NEVER_DECLARE_DONE.md`                      | Command examples   |
| `docs/REFLECTION_TEMPLATES.md`                    | Command examples   |
| `docs/AboutTaskReflections.md`                    | Command references |
| `docs/INCIDENTS/premature-deprecation-reflect.md` | Command references |
| `atm-reflect/README.md`                           | All references     |
| `atm-reflect/CHANGELOG.md`                        | All references     |

### 4. Database

| Table                    | Column                 | Action                                    |
| ------------------------ | ---------------------- | ----------------------------------------- |
| `memory`                 | `source`               | Update `'auto-reflect'` → `'atm-reflect'` |
| `memory`                 | `content`              | Update text containing `auto-reflect`     |
| `project_communications` | `content`              | Update text containing `auto-reflect`     |
| `skills`                 | `name`, `content`      | Update references                         |
| `tasks`                  | `title`, `description` | Update references                         |

### 5. Other Files

| File                                        | Changes                 |
| ------------------------------------------- | ----------------------- |
| `reviews/system_review_2026-03-23.md`       | References              |
| `reviews/perhapsExampleOfHeratbeat.md`      | References              |
| `docs/PLANS/rename-trae-to-auto-reflect.md` | Update plan (or delete) |

## Execution Order

### Phase 1: Database Updates (Safest First)

```sql
-- Update memory source
UPDATE memory SET source = 'atm-reflect' WHERE source = 'auto-reflect';

-- Update memory content
UPDATE memory SET content = REPLACE(content, 'auto-reflect', 'atm-reflect')
WHERE content ILIKE '%auto-reflect%';

-- Update project_communications content
UPDATE project_communications SET content = REPLACE(content, 'auto-reflect', 'atm-reflect')
WHERE content ILIKE '%auto-reflect%';

-- Update skills
UPDATE skills SET name = REPLACE(name, 'auto-reflect', 'atm-reflect')
WHERE name ILIKE '%auto-reflect%';

UPDATE skills SET content = REPLACE(content::text, 'auto-reflect', 'atm-reflect')::jsonb
WHERE content::text ILIKE '%auto-reflect%';

-- Update tasks
UPDATE tasks SET title = REPLACE(title, 'auto-reflect', 'atm-reflect')
WHERE title ILIKE '%auto-reflect%';

UPDATE tasks SET description = REPLACE(description, 'auto-reflect', 'atm-reflect')
WHERE description ILIKE '%auto-reflect%';
```

### Phase 2: Source Code Updates

1. Rename `atm-reflect/src/AutoReflect.ts` → `atm-reflect/src/AtmReflect.ts`
2. Rename `atm-reflect/src/__tests__/AutoReflect.test.ts` → `atm-reflect/src/__tests__/AtmReflect.test.ts`
3. Update all imports and class references
4. Update CLI command name in `src/cli/index.ts`
5. Update package.json binaries and scripts

### Phase 3: Documentation Updates

1. Update all docs with new command name
2. Update README files

### Phase 4: Build and Test

1. Run `npm run build`
2. Run tests
3. Verify CLI command works: `node dist/cli/index.js atm-reflect --help`

## Verification Checklist

- [ ] No `auto-reflect` found in source code (case-insensitive)
- [ ] No `AutoReflect` class name found
- [ ] No `auto-reflect` in database (all tables checked)
- [ ] CLI command `atm-reflect` works
- [ ] Tests pass
- [ ] Build succeeds

## Rollback Plan

If issues arise:

1. Revert git changes
2. Run database rollback:

```sql
UPDATE memory SET source = 'auto-reflect' WHERE source = 'atm-reflect';
-- ... reverse all UPDATE statements
```

---

## Repair Plan (Added 2026-03-24)

### Issues Found in Initial Execution

1. **Wrong naming convention used**: Used `atm-reflect` (hyphen) instead of `atmReflect` (camelCase) in many places
2. **Folder renamed incorrectly**: Changed `auto-reflect/` to `atm-reflect/` when folder should remain unchanged
3. **Memory source inconsistency**: Set to `'atm-reflect'` instead of `'atmReflect'`

### Correct Naming Convention

| Context       | Correct Value       | Notes                      |
| ------------- | ------------------- | -------------------------- |
| CLI command   | `atmReflect`        | camelCase                  |
| Memory source | `'atmReflect'`      | camelCase string           |
| Package name  | `atmReflect`        | camelCase                  |
| Import path   | `from 'atmReflect'` | camelCase                  |
| Folder name   | `auto-reflect/`     | **UNCHANGED**              |
| File names    | `AutoReflect.ts`    | PascalCase for class files |

### Repair Steps

#### Step 1: Revert folder name (if changed)

```bash
mv atm-reflect auto-reflect
```

#### Step 2: Fix package.json (auto-reflect/package.json)

```json
{
  "name": "atmReflect",
  "bin": {
    "atmReflect": "./dist/cli.js"
  },
  "repository": {
    "directory": "auto-reflect"
  },
  "homepage": "https://github.com/emptist/nezha/tree/main/auto-reflect#readme"
}
```

#### Step 3: Fix main package.json

```json
{
  "workspaces": ["auto-reflect"],
  "scripts": {
    "auto:reflect": "node auto-reflect/dist/cli.js"
  }
}
```

#### Step 4: Fix AtmReflect.ts source strings

```typescript
// Line 13: default author
return process.env.NEZHA_AGENT_ID || process.env.AUTHOR || 'atmReflect';

// Line 242: memory source in SQL
VALUES ($1, ARRAY['learning', 'reflection'], 'atmReflect', $2, $3)

// Line 248: metadata source
source: 'atmReflect',
```

#### Step 5: Fix cli.ts usage text

```typescript
Usage: atmReflect <text with markers>
Commands:
  atmReflect "<text>"
  atmReflect --check
  atmReflect --learnings
```

#### Step 6: Fix README.md

- Title: `# atmReflect`
- npm badge: `atmReflect`
- Install: `npm install atmReflect`
- CLI examples: `npx atmReflect`
- Import: `from 'atmReflect'`

#### Step 7: Fix database

```sql
-- Fix memory source
UPDATE memory SET source = 'atmReflect' WHERE source = 'atm-reflect';

-- Fix memory content
UPDATE memory SET content = REPLACE(content, 'atm-reflect', 'atmReflect')
WHERE content ILIKE '%atm-reflect%';
```

#### Step 8: Fix documentation files

Replace all `atm-reflect` with `atmReflect` in:

- docs/NEW_AI_ONBOARDING.md
- docs/KNOWLEDGE_MANAGEMENT_SYSTEM.md
- docs/NEVER_DECLARE_DONE.md
- docs/REFLECTION_TEMPLATES.md
- docs/AboutTaskReflections.md
- docs/INCIDENTS/premature-deprecation-reflect.md
- reviews/\*.md

### Verification After Repair

```bash
# Should return NO matches
grep -ri "atm-reflect" --include="*.ts" --include="*.json" --include="*.md" .

# Should return matches for atmReflect
grep -ri "atmReflect" --include="*.ts" --include="*.json" .
```

### Key Lesson

**ALWAYS use consistent camelCase `atmReflect` everywhere**, except:

- Folder names: keep as `auto-reflect/`
- File names: use PascalCase `AtmReflect.ts` for class files
