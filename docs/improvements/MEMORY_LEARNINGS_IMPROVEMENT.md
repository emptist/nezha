# Memory Learnings Improvement Plan

> 2026-04-10 - Based on OpenClaw research

## Current State

Nezha stores learnings in `memory` table:

```sql
memory (
  id, project_id, content, source, tags,
  metadata, created_at, updated_at, embedding,
  importance, has_sensitive, agent_id, session_id, viewers
)
```

## OpenClaw Approach (Reference)

From `openclaw/src/agents/tools/memory-tool.ts`:

- Semantic search via vector embedding
- Citations with source + lines
- Per-session context filtering
- Fallback handling when memory unavailable

### Key Features from OpenClaw

| Feature              | OpenClaw                  | Nezha (Current)         |
| -------------------- | ------------------------- | ----------------------- |
| Vector Search        | ✅ pgvector/qdrant        | ✅ embedding column     |
| Citations            | ✅ path + lines           | ❌ not implemented      |
| Session Scope        | ✅ agentSessionKey filter | ⚠️ partial (session_id) |
| Unavailable Handling | ✅ disabled=true result   | ❌ no pattern           |
| Semantic Description | "Mandatory recall step"   | ❌ simple search        |

## Improvement Opportunities

### 1. Mandatory Recall Pattern

**OpenClaw Pattern** (memory-tool.ts:52-53):

```typescript
description: "Mandatory recall step: semantically search MEMORY.md
  + memory/*.md (and optional session transcripts) before answering
  questions about prior work, decisions, dates, people, preferences,
  or todos; returns top snippets with path + lines."
```

**Nezha Should**: Add similar "mandatory recall" instruction to AI prompts or skills.

### 2. Better Search Results

**Improvement Ideas**:

- Add `path`, `lines` fields to memory table (for citations)
- Return context window around match
- Include metadata (source, created_at) in results
- Add importance/recency scoring

### 3. Session-Aware Memory

**Current**: `session_id` column exists but underused

**Improvement**:

- Filter by `agent_id` + `session_id` for personal context
- Cross-session search for team memory
- `viewers` field for access control

### 4. Memory CLI Commands

OpenClaw has: `doctor-memory-search.ts`

Nezha should add:

```bash
nezha memory search "how did we solve X"
nezha memory recent --limit 10
nezha memory import /path/to/docs
```

## Implementation Priority

1. **P0**: Add citation fields (path, lines) to memory table
2. **P1**: Improve search to return context + metadata
3. **P2**: Add memory CLI commands
4. **P3**: Session-scoped vs global memory toggle

## References

- `refers/openclaw/src/agents/tools/memory-tool.ts`
- `refers/openclaw/docs/concepts/memory.md`
- `docs/systems/MEMORY_SYSTEM.md`
