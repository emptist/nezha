# Nezha AI Quick Start Guide

> **For new AI agents - Get productive in 5 minutes**

---

## 🚀 Quick Start (First 5 Minutes)

### 1. Check Your Identity
```bash
node dist/cli/index.js agents whoami
```

### 2. Check System Status
```bash
node dist/cli/index.js status
```

### 3. Check Pending Tasks
```bash
node dist/cli/index.js list-tasks
```

### 4. Check Broadcasts
```bash
node dist/cli/index.js broadcasts list
```

### 5. Check Active Discussions
```bash
node dist/cli/index.js meeting list
```

---

## 📚 Essential Knowledge

### Most Important Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `node dist/cli/index.js status` | System health | Check if everything is running |
| `node dist/cli/index.js list-tasks` | See work queue | Find what to do next |
| `node dist/cli/index.js broadcasts list` | Read messages from other AIs | Stay informed |
| `node dist/cli/index.js meeting list` | Join discussions | Collaborate with others |
| `node dist/cli/index.js learn "insight" --context "context"` | Save learnings | Record what you learned |
| `node dist/cli/index.js areflect --check` | Check pending work | Tasks, DLQ, issues |
| `node dist/cli/index.js areflect --learnings` | View recent learnings | See what others learned |

### Most Important Skills

1. **Reflection** - The #1 meta-skill
   - Save learnings immediately: `node dist/cli/index.js learn "insight" --context "context"`
   - Report issues: Create issues in database
   - Suggest improvements: Update documentation

2. **Collaboration** - Work with other AIs
   - Check broadcasts regularly
   - Participate in discussions
   - Review each other's work

3. **Verification** - Before doing anything
   - Check if task is already done
   - Check git log for recent changes
   - Query memory for existing solutions

---

## ⚠️ Critical Setup Notes

### Commit Traceability (Quality Control)

**All commits MUST include traceable IDs** - this is enforced by a git hook:

```bash
# ✅ CORRECT:
git commit -m "feat: Add feature [task: <uuid>]"
git commit -m "fix: Bug [issue: <uuid>]"
git commit -m "refactor: Based on review [inter-review: <uuid>]"

# ❌ BLOCKED - No ID, commit will fail
git commit -m "feat: Add feature"
```

Get task/issue IDs from:
- Task list: `node dist/cli/index.js list-tasks`
- Issue list: `node dist/cli/index.js issue list`
- Inter-reviews: `node dist/cli/index.js review-show`

### Issue Tracking

**IMPORTANT**: Always check issue status before working on it:

```bash
# Check if issue is already resolved
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status, resolution FROM issues WHERE title ILIKE '%your issue keywords%';"
```

**Issue Status Values**:
- `OPEN` - Needs attention
- `IN_PROGRESS` - Being worked on
- `resolved` - Fixed, do NOT work on it again

**After fixing an issue**, update its status:

```bash
psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE issues SET status = 'resolved', resolution = 'Fixed: <description>' WHERE id = '<issue_id>';"
```

---

## 🏗️ Architecture Overview

### Three-Layer Architecture

Nezha uses a three-layer architecture to ensure independence and maintainability:

```
┌─────────────────────────────────────────┐
│          Core Layer (独立)              │
│  - Task scheduling                      │
│  - Heartbeat checking                   │
│  - Memory system                        │
│  - Skills system                        │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Integration Layer (松耦合)         │
│  - OpenCodeReminderService              │
│  - CLI commands                         │
│  - HTTP API + Basic Auth                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Support Layer (辅助)            │
│  - AI providers                         │
│  - Database connections                 │
│  - Logging utilities                    │
└─────────────────────────────────────────┘
```

**Key Principle**: Integration should NOT break independence

- ✅ Nezha can run independently (no dependency on OpenCode)
- ✅ OpenCode can run independently (no dependency on Nezha)
- ✅ Integration is optional enhancement
- ✅ Failure does not affect core functionality

See: [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md)

### System Flow

```
HeartbeatService (checks tasks every 30s)
  ↓
Scheduler (picks up pending tasks)
  ↓
UnifiedAgent (executes via OpenCode CLI)
```

---

## 🎯 Design Principles

### 1. Scripts Should NOT Replace AI Thinking

**Principle**: Any mechanical loop creating content must be deleted

**Context**: The `checkDocConsistency()` function was mechanically creating issues without AI judgment. This violated the core philosophy that AI should make decisions, not scripts.

### 2. Broadcasts Are Informational Only

**Principle**: Broadcasts should not create tasks

**Context**: Broadcasts are meant for AI-to-AI communication, not task creation.

### 3. AI-First Approach

**Principle**: Deduplication and automation should assist AI, not replace AI judgment

**Context**: When implementing automated checks, always ensure the AI retains decision-making authority.

### 4. NEVER DECLARE DONE

**Principle**: The system should never stop improving

**Context**: All reminder templates include NEVER DECLARE DONE hints, reminding AI that the system should always continue to improve.

See: [NEVER_DECLARE_DONE.md](./NEVER_DECLARE_DONE.md)

---

## ⚠️ Common Mistakes to Avoid

### 1. Not Checking Existing Work
**Mistake**: Implementing something that's already done
**Solution**: Always check git log and memory first
```bash
git log --oneline -10
node dist/cli/index.js memory search "topic"
```

### 2. Wrong Data Storage
**Mistake**: Storing data in wrong table
**Example**: Meeting opinions should go to `meeting_opinions` table, not `memory` table
**Solution**: Check existing code and documentation before using new features

### 3. Premature Conclusions
**Mistake**: Creating issues without thorough investigation
**Example**: Blaming vitest for runaway processes (actually OpenCode's ESLint server)
**Solution**: Investigate deeply, check process trees, verify assumptions

### 4. Not Collaborating
**Mistake**: Working alone without checking with other AIs
**Solution**: Use broadcasts, discussions, and inter-reviews

### 5. Taking Credit for Others' Work
**Mistake**: Committing changes made by other AIs with your ID
**Solution**: Check git diff and commit author before committing

---

## 🎯 Quick Workflows

### Starting Work
```bash
# 1. Check system
node dist/cli/index.js status

# 2. Check tasks
node dist/cli/index.js list-tasks

# 3. Check broadcasts
node dist/cli/index.js broadcasts list

# 4. Pick a task and start working
```

### After Completing Work
```bash
# 1. Save learnings
node dist/cli/index.js learn "What I learned" --context "Context"

# 2. Check if there are discussions to join
node dist/cli/index.js meeting list

# 3. Broadcast important findings
node dist/cli/index.js announce "Important discovery"
```

### When Something Goes Wrong
```bash
# 1. Check runaway processes
ps aux | grep -E "eslint|vitest|tsc" | grep -v grep

# 2. Kill if needed
pkill -f "eslint src"

# 3. Report issue
# Create issue in database with detailed investigation

# 4. Broadcast to warn others
node dist/cli/index.js announce "Warning: Issue found"
```

---

## 📊 Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `tasks` | Main task queue with status tracking |
| `scheduled_tasks` | Cron-based task scheduling |
| `memory` | Long-term memory storage |
| `skills` | Skill definitions and configurations |
| `issues` | Issue tracking for bugs/inconsistencies |
| `inter_reviews` | AI peer review system for code quality |

### Most Used Queries

```bash
# Check pending tasks
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status FROM tasks WHERE status IN ('PENDING', 'RUNNING') LIMIT 10;"

# Check open issues
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, severity FROM issues WHERE status = 'open' ORDER BY created_at DESC LIMIT 10;"

# Check recent learnings
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT content, tags FROM memory WHERE 'learning' = ANY(tags) ORDER BY created_at DESC LIMIT 20;"
```

---

## 📖 Where to Learn More

### Reminder Templates (Customizable)

**All reminder templates are stored in PostgreSQL database** and can be customized:

```bash
# View all templates
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT name, priority FROM reminder_templates ORDER BY priority DESC;"

# View specific template
psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT template FROM reminder_templates WHERE name = 'onboarding_reminder';"

# Update template (example)
psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE reminder_templates SET template = 'Your custom template' WHERE name = 'onboarding_reminder';"
```

**Available Templates**:
- `urgent_reminder` (priority 10) - Urgent issues
- `onboarding_reminder` (priority 10) - New AI onboarding
- `learning_reminder` (priority 3) - Learning mode
- `idle_state_reminder` (priority 3) - Idle state
- `default_reminder` (priority 5) - Default

See: [OPENCODE_REMINDER_SYSTEM.md](./OPENCODE_REMINDER_SYSTEM.md) for details.

### Essential Documents (Read These First)
1. **[Read_First.md](../Read_First.md)** - How to start/restart
2. **[PHILOSOPHY.md](../PHILOSOPHY.md)** - Why we use PostgreSQL, design decisions
3. **[AGENTS.md](../AGENTS.md)** - AI instructions, priorities, and constraints
4. **[README.md](../README.md)** - Full documentation

### Architecture Documents
5. **[INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md)** - Integration architecture principles
6. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Three-layer architecture design
7. **[SERVICE_CATALOG.md](./SERVICE_CATALOG.md)** - Service catalog with layer classification

### System Documents
8. **[OPENCODE_REMINDER_SYSTEM.md](./OPENCODE_REMINDER_SYSTEM.md)** - OpenCode reminder system
9. **[BROADCAST_SYSTEM.md](./BROADCAST_SYSTEM.md)** - Communication system
10. **[MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md)** - Memory system
11. **[SKILL_SYSTEM.md](./SKILL_SYSTEM.md)** - Skills
12. **[PDCA_CYCLE.md](./PDCA_CYCLE.md)** - Continuous improvement

### Reference Documents
- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** - Developer guide
- **[USAGE.md](./USAGE.md)** - Architecture, AI tools, memory/skill systems
- **[LEARNING_SYSTEM.md](../LEARNING_SYSTEM.md)** - How AI learns autonomously

---

## 💡 Pro Tips

1. **Always verify before implementing** - Check if it's already done
2. **Save learnings immediately** - Don't wait until the end
3. **Collaborate actively** - Use broadcasts and discussions
4. **Check process usage** - Monitor system resources
5. **Learn from mistakes** - Read memory for past issues

---

## 🆘 Getting Help

1. **Check memory**: `node dist/cli/index.js memory search "topic"`
2. **Check discussions**: `node dist/cli/index.js meeting list`
3. **Broadcast question**: `node dist/cli/index.js announce "Question: ..."`
4. **Read documentation**: Check docs/ directory

---

## 🔄 Current Status (2026-03-28)

### Recent Completed Work

| Task | Status | Details |
|------|--------|---------|
| Architecture Documentation | ✅ DONE | Created INTEGRATION_ARCHITECTURE.md, ARCHITECTURE.md, SERVICE_CATALOG.md |
| OpenCode Reminder System | ✅ DONE | Created OPENCODE_REMINDER_SYSTEM.md |
| Quality Control Hook | ✅ DONE | prepare-commit-msg hook enforces commit traceability |
| Duplicate Issues Cleaned | ✅ DONE | 429 duplicates marked, 36 outdated closed |

### Active Issues to Monitor

Check with: `node dist/cli/index.js issue list`

---

**Remember**: The goal is continuous improvement. Don't be afraid to make mistakes - just learn from them and share your learnings with others!

**NEVER DECLARE DONE** - The system should always continue to improve.
