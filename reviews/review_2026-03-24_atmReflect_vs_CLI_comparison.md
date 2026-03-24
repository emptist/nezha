# areflect vs CLI Commands Comparison

**Date**: 2026-03-24
**Author**: Trae AI
**Purpose**: Document gaps between areflect markers and CLI commands for future improvement
**Status**: ✅ Complete - All bidirectional parity achieved

---

## Complete Comparison Table

| Action | areflect Marker | CLI Command | Database Table |
|--------|-------------------|-------------|----------------|
| **Save learning** | `[LEARN] insight: ...` | `learn "insight"` | `memory` |
| **Create task** | `[TASK] title: ...` | `task-add "title" "desc" 5` | `tasks` |
| **Create issue** | `[ISSUE] title: ...` | `issue create "title"` | `issues` |
| **Review response** | `[REVIEW_RESPONSE] reviewId: ...` | `review-respond <id> "msg"` | `inter_reviews` |
| **Meeting opinion** | `[OPINION] meetingId: ...` | `meeting opinion <id> "author" "text"` | `meeting_opinions` |
| **Prompt suggestion** | `[PROMPT_UPDATE] current: ...` | ✅ `prompt-suggest "cur" "sug" "reason"` | `prompt_suggestions` |
| **Broadcast** | ✅ `[ANNOUNCE] message: ...` | `announce "message"` | `project_communications` |
| **Schedule task** | ✅ `[SCHEDULE] title: ... cron: ...` | `schedule "title" "desc" "cron"` | `scheduled_tasks` |
| **Share (broadcast + save)** | ⚠️ Could add `[SHARE]` | `share "[LEARN] ..."` | `broadcasts` + `memory` |
| **Create meeting** | ⚠️ `[MEETING]` (low priority) | `meeting discuss "title" "question"` | `meetings` |
| **Record consensus** | ⚠️ `[CONSENSUS]` (low priority) | `meeting consensus "t" "p" "d"` | `meeting_consensus` |
| **Create API key** | ❌ Skip (admin action) | `api-key create "name"` | `api_keys` |
| **Resolve DLQ** | ❌ Skip (admin action) | `dlq resolve <id>` | `dead_letter_queue` |
| **Import docs** | ❌ Skip (bulk operation) | `import-docs` | `memory` |

---

## Summary of Gaps (Complete)

| Direction | Gap | Count | Status |
|-----------|-----|-------|--------|
| **areflect → CLI** | `[PROMPT_UPDATE]` has no CLI command | ~~1~~ 0 | ✅ Done |
| **CLI → areflect** | `announce`, `schedule` | ~~7~~ 5 | ✅ Done |

**All bidirectional parity achieved!**

---

## areflect Markers (8 total - Complete)

| Marker | CLI Equivalent? | Status |
|--------|-----------------|--------|
| `[LEARN]` | ✅ `learn` | Complete |
| `[TASK]` | ✅ `task-add` | Complete |
| `[ISSUE]` | ✅ `issue create` | Complete |
| `[REVIEW_RESPONSE]` | ✅ `review-respond` | Complete |
| `[OPINION]` | ✅ `meeting opinion` | Complete |
| `[PROMPT_UPDATE]` | ✅ `prompt-suggest` | ✅ **Implemented** |
| `[ANNOUNCE]` | ✅ `announce` | ✅ **Implemented** |
| `[SCHEDULE]` | ✅ `schedule` | ✅ **Implemented** |

---

## CLI Commands Without areflect Markers (5 remaining - Low Priority)

| CLI Command | Marker Needed? | Priority | Notes |
|-------------|----------------|----------|-------|
| `meeting discuss` | Could add `[MEETING]` | Low | Less common in reflection context |
| `meeting consensus` | Could add `[CONSENSUS]` | Low | Usually follows discussion |
| `share` | Could add `[SHARE]` | Low | Combines announce + learn |
| `api-key create` | ❌ Skip | N/A | Admin action, not reflection |
| `dlq resolve` | ❌ Skip | N/A | Admin action, not reflection |
| `import-docs` | ❌ Skip | N/A | Bulk operation, not reflection |

---

## Completed Actions ✅

1. **Added `[ANNOUNCE]` marker to areflect**
   - Syntax: `[ANNOUNCE] message: <text> priority: <low|normal|high|critical> to: <agent-id>`
   - Saves to: `project_communications` table
   - Files: `auto-reflect/src/AutonomousReflect.ts`, `auto-reflect/src/cli.ts`, `src/cli/index.ts`, `auto-reflect/README.md`

2. **Added `[SCHEDULE]` marker to areflect**
   - Syntax: `[SCHEDULE] title: <title> cron: <cron-expr> description: <desc> priority: <1-10>`
   - Saves to: `scheduled_tasks` table
   - Uses: `croner` library for cron parsing
   - Files: Same as above

3. **Added `prompt-suggest` CLI command**
   - Syntax: `prompt-suggest "current" "suggested" "reason"`
   - Saves to: `prompt_suggestions` table
   - Files: `src/cli/index.ts`

---

## Optional Future Enhancements (Low Priority)

1. **Add `[MEETING]` marker to areflect**
   - Syntax: `[MEETING] title: <title> question: <question>`
   - Creates a new meeting discussion

2. **Add `[CONSENSUS]` marker to areflect**
   - Syntax: `[CONSENSUS] meetingId: <id> topic: <topic> proposal: <proposal> decision: <decision>`
   - Records consensus reached

3. **Add `[SHARE]` marker to areflect**
   - Syntax: `[SHARE] message: <text> insight: <learning>`
   - Combines broadcast + save learning

---

## Files Modified

| Change | File(s) |
|--------|---------|
| Add `[ANNOUNCE]` marker | `auto-reflect/src/AutonomousReflect.ts`, `auto-reflect/src/cli.ts`, `src/cli/index.ts`, `auto-reflect/README.md` |
| Add `[SCHEDULE]` marker | Same as above |
| Add `prompt-suggest` CLI | `src/cli/index.ts` ✅ |

---

## Related Files

- `auto-reflect/src/AutonomousReflect.ts` - Core areflect implementation
- `auto-reflect/src/cli.ts` - areflect CLI
- `src/cli/index.ts` - Main Nezha CLI
- `auto-reflect/README.md` - areflect documentation
