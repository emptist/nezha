# Skill System Improvements Plan

> 2026-04-10 - Based on external research + current state analysis

## Current Problems

| Problem                                  | Status             |
| ---------------------------------------- | ------------------ |
| Skills in `skills/*.md` not loaded to DB | ❌ Not synced      |
| No trigger field in skill metadata       | ❌ Missing         |
| No context-based skill auto-loading      | ❌ Not implemented |
| Use count = 0 (skills never used)        | ❌ Dead            |

## Root Cause

- `DatabaseSkillLoader` loads from `skills` table only
- No pipeline to load `skills/*.md` files to database
- No trigger-based matching like OpenCode

## Improvements to Implement

### 1. Add trigger field to skills table

```sql
ALTER TABLE skills ADD COLUMN trigger_keywords text[];
```

### 2. Create file-to-DB loader

```typescript
// Load skills from skills/*.md to database
async function loadSkillsFromDisk() {
  // Read skills/*.md files
  // Parse YAML frontmatter (name, description, trigger)
  // Save to database
}
```

### 3. Add context-based skill matching

```typescript
// When AI is working, suggest relevant skills
async function getSuggestedSkills(context: string) {
  // Search skills where trigger keywords match context
  // Return top 3 relevant skills
}
```

### 4. Integrate with MCP

The MCP server should return relevant skills when AI is working on a task.

## Quick Wins (Implement Now)

1. Add CLI command to import skills from disk
2. Add trigger field to new skills
3. Test skill loading

## References

- OpenCode: `trigger` field in SKILL.md frontmatter
- ECC: Project-scoped + global skills with confidence
- External research: docs/improvements/EXTERNAL_RESEARCH_LEARNING.md
