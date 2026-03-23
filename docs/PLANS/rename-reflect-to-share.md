# Plan: Rename `reflect` CLI command to `share`

## Background

The `reflect` CLI command is misnamed. It actually **broadcasts and shares** thoughts with all AIs, not performing self-reflection. The name causes confusion with genuine reflection concepts.

**What `reflect` actually does:**
1. Broadcasts text to all AIs via `BroadcastService`
2. Saves to memory

**This is sharing, not reflection.**

## Scope Analysis

### 1. Source Code (4 places)

| File | Line | Current | Change To |
|------|------|---------|-----------|
| `src/cli/index.ts` | 1547 | `case 'reflect':` | `case 'share':` |
| `src/cli/index.ts` | 1550 | `Usage: nezha reflect` | `Usage: nezha share` |
| `src/cli/index.ts` | 1551 | `Example: nezha reflect` | `Example: nezha share` |
| `src/cli/index.ts` | 3115 | `reflect <text> Broadcast` | `share <text> Broadcast` |

### 2. Documentation (10 places)

| File | Line | Current | Change To |
|------|------|---------|-----------|
| `AGENTS.md` | 29 | `nezha reflect <text>` | `nezha share <text>` |
| `skills/reflection-system.md` | 11 | `nezha reflect <text>` | `nezha share <text>` |
| `skills/reflection-system.md` | 21 | `nezha reflect "..."` | `nezha share "..."` |
| `skills/reflection-system.md` | 46 | `nezha reflect "[LEARN]..."` | `nezha share "[LEARN]..."` |
| `skills/ai-communication.md` | 16 | `nezha reflect "..."` | `nezha share "..."` |
| `docs/KNOWLEDGE_MANAGEMENT_SYSTEM.md` | 294 | `node dist/cli/index.js reflect` | `node dist/cli/index.js share` |
| `docs/KNOWLEDGE_MANAGEMENT_SYSTEM.md` | 354 | `Use \`reflect\` for` | `Use \`share\` for` |

### 3. Incident Report (update, not rename)

| File | Action |
|------|--------|
| `docs/INCIDENTS/premature-deprecation-reflect.md` | Add note: command renamed to `share` |

### 4. Database (careful pattern matching)

**Tables to check:**
- `memory.content`
- `skills.content`
- `tasks.title`, `tasks.description`
- `project_communications.content`

**Pattern to find and replace:**
- `nezha reflect` → `nezha share`
- `node dist/cli/index.js reflect` → `node dist/cli/index.js share`

**DO NOT CHANGE:**
- `reflect on` (verb usage)
- `reflection` (noun)
- `reflection-cli` (source identifier)
- `reflection-parser` (source identifier)
- `atmReflect` (different command)
- Any other "reflect" as verb/concept

### 5. Keep Unchanged

| Context | Reason |
|---------|--------|
| `source: 'cli-reflect'` | Metadata identifier, not command name |
| `['reflection', 'broadcast']` tags | Memory tags |
| Verb usage "reflect on" | English verb |
| `reflection-cli`, `reflection-parser` | Source identifiers |
| `atmReflect` | Different command |

## Execution Order

1. **Phase 1: Source Code** - Update `src/cli/index.ts`
2. **Phase 2: Documentation** - Update all `.md` files
3. **Phase 3: Database** - Careful pattern-based updates
4. **Phase 4: Verification** - Test CLI, check for missed occurrences

## Verification Checklist

- [ ] `nezha share "test"` works
- [ ] `nezha reflect` returns "Unknown command"
- [ ] No `nezha reflect` in source code (except incident doc)
- [ ] No `nezha reflect` in database content
- [ ] All verb usages of "reflect" preserved
- [ ] All source identifiers preserved

## SQL for Database Updates

```sql
-- Check before updating
SELECT COUNT(*) FROM memory WHERE content ILIKE '%nezha reflect%';
SELECT COUNT(*) FROM skills WHERE content::text ILIKE '%nezha reflect%';
SELECT COUNT(*) FROM tasks WHERE title ILIKE '%nezha reflect%' OR description ILIKE '%nezha reflect%';
SELECT COUNT(*) FROM project_communications WHERE content ILIKE '%nezha reflect%';

-- Update (run after verification)
UPDATE memory SET content = REPLACE(content, 'nezha reflect', 'nezha share') WHERE content ILIKE '%nezha reflect%';
UPDATE skills SET content = REPLACE(content::text, 'nezha reflect', 'nezha share')::jsonb WHERE content::text ILIKE '%nezha reflect%';
UPDATE tasks SET title = REPLACE(title, 'nezha reflect', 'nezha share'), description = REPLACE(description, 'nezha reflect', 'nezha share') WHERE title ILIKE '%nezha reflect%' OR description ILIKE '%nezha reflect%';
UPDATE project_communications SET content = REPLACE(content, 'nezha reflect', 'nezha share') WHERE content ILIKE '%nezha reflect%';

-- Also check for full path
UPDATE memory SET content = REPLACE(content, 'node dist/cli/index.js reflect', 'node dist/cli/index.js share') WHERE content ILIKE '%node dist/cli/index.js reflect%';
```

## Lesson Learned

This is an example of how one carelessly chosen word can cost significant effort to replace:

- The word "reflect" was chosen to describe a **concept** (self-reflection)
- But the command actually **shares/broadcasts**
- This creates confusion and requires careful, pattern-based replacement
- Cannot use simple global REPLACE due to other "reflect" usages

**Naming principle**: Before naming anything, ask:
1. What does it **actually do**?
2. Is the name **honest** about its function?
3. Will it **conflict** with existing concepts?
4. Can it be **easily changed** later?
