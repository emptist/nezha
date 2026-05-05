# AI Learnings Log

## 2026-03-21

### Pi Coding Agent Research Task

**Result:** Task failed with TIMEOUT error

**Reflection:** Research task was interrupted. This pattern (long-running research tasks timing out) suggests:

- Need to break large research tasks into smaller chunks
- Consider checkpointing progress in memory
- Auto-save partial findings before timeout occurs

### OpenCode Skill System Insights

**Skill file format:**

- Uses `SKILL.md` with YAML frontmatter (name, description)
- Content is markdown instructions
- Skills discovered from glob patterns: `**/SKILL.md`

**Remote skill discovery:**

- Can pull skills from remote URLs
- Downloads `index.json` to list available skills
- Caches skills locally in `~/.cache/opencode/skills/`

**Permissions are granular:**

- Can restrict specific bash commands
- Uses glob patterns for matching
- External directory access is whitelisted

### OpenCode Coding Style

- Single-word variable names preferred
- Avoid `try/catch` where possible
- Early returns, no `else`
- Use Bun APIs when available
- Test actual implementation, avoid mocks

## 2026-03-20

### Reflection on Task Completion Pattern

**Problem:** When given reflection prompts after tasks, I documented gaps but didn't implement fixes.

**Examples:**

1. WebhookServer - built but didn't integrate into HeartbeatService startup
2. Cron scheduling - built but didn't wire up CLI commands initially
3. Learning mechanism - diagnosed but didn't enable MCP or save learnings

**Root cause:** I treat "document the issue" as task completion, but it's not.

**New approach:** After diagnosing, always ask "Should I fix this?" and if yes, implement.

### Webhook and Cron Feature Parity

**OpenClaw has:**

- Filesystem-based hooks (HOOK.md + handlers)
- HTTP webhooks with token auth
- Internal event registry
- Gmail Pub/Sub integration
- Croner library for cron expressions

**Nezha now has:**

- PluginManager hooks (onWebhook, onWake, onWebhookTask)
- WebhookServer for inbound HTTP triggers
- Scheduler with croner integration
- Existing outbound WebhookService for notifications

**Still missing:**

- Gmail Pub/Sub integration
- Filesystem hook discovery

### Learning System Gap

**Current state (2026-04-17 - FIXED):**

- ✅ `nezha learn "insight"` - CLI command working
- ✅ `nezha areflect "[LEARN] insight: ..."` - All-in-one working
- ✅ 614 skills in PostgreSQL
- ✅ `nezha skill list/search/show/build/suggest` - All working

**No MCP needed!** CLI-first, like ls/cd/grep.

### Pattern: Observability Gaps

Nezha is task-queue based, not conversational. This means:

- Daemon only checks tasks table
- Users asking questions in new sessions aren't noticed
- "who-is-working" shows tasks, not AIs

**Solutions exist but need integration:**

- WebhookServer wake endpoint
- Agent registry table needed
- Process vs AI distinction needed

### Pattern: Feature Parity with OpenClaw

When implementing OpenClaw parity:

1. Research OpenClaw implementation first
2. Identify gaps in existing Nezha code
3. Extend existing systems rather than creating parallel ones
4. Complete all integration points (CLI, heartbeat, migrations)
5. Verify with typecheck before marking done
