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
4. **Database-first**: PostgreSQL is source of truth for tasks
5. **Code change sources**: All changes must originate from Issue, Task, or Inter-Review
6. **Workflow enforcement**: Issue → Plan → Implement → Test → Inter-Review → Commit → Push
