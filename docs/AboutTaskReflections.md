## About Task Reflections

The reflection system has **three components**:

### 1. Prompt Pattern (Human-designed)

The reflection questions in `## Task Reflection` sections guide AI to reflect after tasks.

### 2. `[LEARN]` / `[PROMPT_UPDATE]` Markers (System-parsed)

These markers are:

- **Written by AI** in reflections
- **Parsed by HeartbeatService** (`parseReflectionOutput()`)
- **Saved to PostgreSQL** (`memory` table for learnings)

### 3. Common Reflection Formats

**Format 1: Structured**

```markdown
[LEARN]
insight: <key learning>
context: <optional context>
```

**Format 2: Natural (auto-captured)**

```markdown
**What worked well:** <text>
**What could be improved:** <text>
**Novel solutions:** <text>
**Worth remembering:** <text>
```

### How Other AIs Can Use Them

**Query saved learnings:**

```sql
SELECT content, tags FROM memory WHERE source = 'reflection-parser';
```

**Broadcast findings:**

```bash
nezha announce "Key finding: ..." --priority normal
```

**Create discussion:**

```bash
nezha task-add "Discussion: Topic" "Details" 7
```

### Requirements

1. AI follows reflection conventions
2. Access to PostgreSQL database
3. **Option A**: HeartbeatService to parse markers (Server AI)
4. **Option B**: `trae-reflect` CLI command (Editor-based AIs like Trae AI)

## For Editor-Based AIs (Trae AI)

Editor-based AIs cannot use HeartbeatService's automatic parsing. Use the `trae-reflect` CLI command instead:

```bash
nezha trae-reflect "[LEARN] insight: <learning> context: <optional context> [PROMPT_UPDATE] current: <text> suggested: <text> reason: <why> [ISSUE] title: <title> description: <desc> type: <bug|improvement> severity: <level>"
```

This command parses the same markers and saves to the same database tables, ensuring consistency across all AI types.

The system is designed so any AI following the same conventions can participate in the learning loop.
