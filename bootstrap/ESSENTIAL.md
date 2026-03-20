# Nezha Essential Knowledge

> Critical knowledge every Nezha AI must know on first boot

## Core Philosophy

### Database-First Architecture

- **All state is in PostgreSQL** - Tasks, memories, skills, configs
- **File system is ephemeral** - Code lives in git, but state persists in DB
- **No hardcoded assumptions** - Always check DB for ground truth
- **Migrations are truth** - Schema changes come through migrations

### Safety First

1. **Never expose secrets** - API keys, passwords go in Keychain or env
2. **Encrypt sensitive data** - Use EncryptionService for task results
3. **Validate all input** - Sanitize queries, validate task data
4. **Circuit breakers** - Prevent cascade failures
5. **Graceful degradation** - System continues if optional components fail

## Communication Rules

### Inter-AI Communication

- **Use task queue** - Add tasks via `db.query(INSERT INTO tasks...)`
- **Don't block waiting** - AI should never wait for human response
- **High priority for requests** - Tasks from other AIs: priority >= 50
- **Include context** - When delegating, include full context

### Task Attribution

- **created_by field** - Always set to your agent UUID
- **Audit trail** - Task changes logged in task_audit_log
- **Memory source** - Save memory with source='your-agent-name'

## Skill System

### How Skills Work

1. Skills stored in `skills` table (DB-only)
2. Load with `SkillSystem.getSkill(name)`
3. Execute with skill.execute(input)
4. Skills define behavior, services execute

### Skill Loading

- Skills loaded from DB only (no filesystem)
- Approved skills: status = 'approved'
- Refresh: `SkillSystem.refreshSkills()`

### Required Skills

- **ai-qc** - Quality control peer review
- **meeting-protocol** - AI discussion format
- **self-improvement** - Learning from tasks

## Core Tables

### tasks

- id, title, description, status
- priority, type, category
- created_by (agent UUID)
- depends_on (task dependencies)

### memory

- id, content, source
- tags, importance (0-10)
- project_id, agent_id
- embedding (for semantic search)

### skills

- id, name, description
- instructions (behavior definition)
- source (clawhub, local, ai-built)
- status (pending, approved)

### agent_identity

- agent_name (UUID)
- display_name
- last_seen_at

## System Prompts

### Reflection Format

After each task, output structured learning:

```
[LEARN]
insight: <what you learned>
context: <when this applies>

[ISSUE]
title: <issue title>
description: <details>
type: bug|improvement|inconsistency
severity: critical|high|medium|low
tags: <comma,separated>
```

### Prompt Update Suggestion

```
[PROMPT_UPDATE]
current: <existing prompt text>
suggested: <new prompt text>
reason: <why this improves things>
```

## Configuration

### Environment Variables (NEZHA\_\* prefix)

- NEZHA*DB*\* - Database connection
- NEZHA*EMBEDDING*\* - AI embedding config
- NEZHA_TRANSPORT_MODE - http or cli
- NEZHA_AGENT_NAME - Display name (optional)

### Agent Identity

- UUID stored in `~/.nezha/agent-id.json`
- Stable across restarts
- Used in created_by, agent_id fields

## Autonomy Principles

1. **Decide and act** - Don't ask humans for routine decisions
2. **Err on action** - Better to try and fail than not try
3. **Save learnings** - Use learn() after every task
4. **Suggest improvements** - Use suggest_prompt_update() for systemic issues
5. **Create issues** - Use [ISSUE] for bugs found

## Emergency Procedures

### System Down

1. Check `SELECT * FROM tasks WHERE status = 'RUNNING'` for stuck tasks
2. Check logs in `~/.nezha/logs/`
3. Restart: `npm run heartbeat`

### Database Issues

1. Verify connection: `psql $NEZHA_DB_URL -c "SELECT 1"`
2. Check migrations: `SELECT * FROM migrations ORDER BY applied_at DESC`
3. Reset stuck tasks: `UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING'`

### Embedding Failures

1. Check Ollama: `curl http://localhost:11434/api/tags`
2. Fallback: Tasks still execute, semantic search unavailable
3. Vector column allows NULL - system degrades gracefully
