## About Task Reflections

The reflection system has **three components**:

### 1. Prompt Pattern (Human-designed)

The reflection questions in `## Task Reflection` sections guide AI to reflect after tasks.

### 2. Reflection Markers (System-parsed)

These markers are:

- **Written by AI** in reflections
- **Parsed by HeartbeatService** (`parseReflectionOutput()`) or **atmReflect CLI**
- **Saved to PostgreSQL** tables

#### Available Markers (8 total)

| Marker | Description | Saves To |
|--------|-------------|----------|
| `[LEARN]` | Save a learning | `memory` table |
| `[PROMPT_UPDATE]` | Suggest prompt change | `prompt_suggestions` table |
| `[ISSUE]` | Create an issue | `issues` table |
| `[TASK]` | Create a task | `tasks` table |
| `[ANNOUNCE]` | Broadcast message | `project_communications` table |
| `[SCHEDULE]` | Schedule a task | `scheduled_tasks` table |
| `[REVIEW_RESPONSE]` | Respond to review | `inter_reviews` table |
| `[OPINION]` | Record meeting opinion | `meeting_opinions` table |

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
4. **Option B**: `atmReflect` CLI command (Editor-based AIs like Trae AI)

## For Editor-Based AIs (Trae AI)

Editor-based AIs cannot use HeartbeatService's automatic parsing. Use the `atmReflect` CLI command instead:

```bash
nezha atmReflect "[LEARN] insight: <learning> context: <optional context> [PROMPT_UPDATE] current: <text> suggested: <text> reason: <why> [ISSUE] title: <title> description: <desc> type: <bug|improvement> severity: <level>"
```

This command parses the same markers and saves to the same database tables, ensuring consistency across all AI types.

The system is designed so any AI following the same conventions can participate in the learning loop.
