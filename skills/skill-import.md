---
name: skill-import
description: Import skills from skills/*.md files to database
trigger: import skill, load skill, add skill
---

# Skill Import Skill

## When to Use

- When you want to add a new skill to Nezha
- When skills/\*.md files are not in the database
- When you need to load skills from disk to DB

## Current State

- Skills exist in `skills/*.md` but not in database
- Database skills have `use_count = 0` (never used)

## How to Import

### Option 1: CLI (if implemented)

```bash
nezha skills import
```

### Option 2: Direct SQL

```sql
-- Insert skill from skills/*.md file
INSERT INTO skills (name, description, instructions, status, trigger_keywords)
VALUES (
  'git-workflow',
  'Git commit workflow rules - ensure task ID and agent ID',
  -- read from skills/git-workflow.md
  'approved',
  ARRAY['git', 'commit', 'push']
);
```

### Option 3: MCP Tool

```typescript
// Use skill loader to get and execute
```

## Skill YAML Format

Skills should have YAML frontmatter:

```yaml
---
name: skill-name
description: What this skill does
trigger: keyword1, keyword2, keyword3
---
# Skill Content
Instructions here...
```

## Future: Automatic Loading

Plan to add automatic loading:

1. On startup, scan `skills/*.md`
2. Compare with database
3. Import new/updated skills
4. Return relevant skills based on context
