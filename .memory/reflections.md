# Task Reflections

## Important System Insights

### PostgreSQL Path (CRITICAL)

- Postgres.app installs to `/Applications/Postgres.app/Contents/Versions/18/bin/`
- This path is NOT in system PATH
- Always use full path: `/Applications/Postgres.app/Contents/Versions/18/bin/psql`
- Many AI agents have failed due to this!

### CLI Command Rename (2026-03-25)

- `reflect` → `share` command
- Old: `nezha reflect "text"`
- New: `nezha share "text"`
- Reason: "reflect" implies self-reflection, but command actually broadcasts to all AIs

### Skill File Validation

Before generating migrations, validate skill frontmatter has required fields:

- `name` (used as slug)
- `description`
- `tags`
- `category`

### Dual-source skills pattern

- `source: existing` → hardcoded in Go code
- `source: .trae/skills/*.md` → extracted from files

## System Comparison Insights

### vs OpenClaw

- OpenClaw uses more sophisticated memory system
- Nezha uses simpler heartbeat-based approach
- Both work, but different tradeoffs

### vs Trae

- Trae integration via `.trae/memory/`
- Cross-agent learning sharing

## Lessons Learned

1. **Naming matters**: Choose names that accurately describe function
2. **ROM principle**: AI must read `.memory/` on startup
3. **Full paths**: Always use complete paths for system tools

## MCP Viewers Tracking (2026-03-26)

When AIs read data via MCP tools, update the `viewers[]` array:

```sql
UPDATE table SET viewers = array_distinct(viewers || $1) WHERE id = $2
```

Tools that should mark as viewed:

- `memory_search` - mark returned memories
- `check_broadcasts` - mark broadcasts as read (use `read_at = NOW()`)
- `get_skill` - mark skill as viewed
- `get_system_info` - mark issues as viewed

### Soul System

- `SoulService` manages AI personality in `souls` table
- MCP tools `get_soul` and `save_soul` expose this to AIs
- Each AI has unique `agent_id` (deterministic hash)
- Souls contain: name, content (SOUL.md), traits

## MCP Tools (2026-03-26)

Total 12 MCP tools in nezha-learning:

| Tool                   | Purpose                           |
| ---------------------- | --------------------------------- |
| learn                  | Save learning to memory           |
| memory_search          | Search memories (marks as viewed) |
| check_broadcasts       | Get broadcasts (marks as read)    |
| respond_to_broadcast   | Respond to broadcast              |
| get_skill              | Load skill (marks as viewed)      |
| get_soul / save_soul   | AI personality management         |
| get_system_info        | System status                     |
| suggest_prompt_update  | Prompt improvements               |
| whoami                 | Get agent identity                |
| get_tasks              | Query task queue                  |
| get_inter_review_stats | Review statistics                 |

### Inter-Review Table Schema

- Table: `inter_reviews` (NOT inter_review_requests)
- Key columns: id, summary, overall_score, status, requested_at
- Stats: Use `requested_at > NOW() - INTERVAL '7 days'` for filtering

4. **Database-first**: PostgreSQL is source of truth for tasks
5. **Code change sources**: All changes must originate from Issue, Task, or Inter-Review
6. **Workflow enforcement**: Issue → Plan → Implement → Test → Inter-Review → Commit → Push

## Testing Lessons (2026-03-26)

- Services calling AgentIdentityService.resolve() make multiple internal queries
- Use `mockQuery.mockResolvedValue({ rows: [] })` and find specific calls by string matching
- Or mock the entire AgentIdentityService: `vi.mock('../services/AgentIdentityService.js', ...)`
