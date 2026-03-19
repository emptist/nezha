# Nezha Skill System Architecture

> **Design Principle**: PostgreSQL-first. File system only when inevitable.

## Core Principle

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Primary)                          │
│   • All skills stored here                                      │
│   • Only approved skills (status='approved')                    │
│   • Safety score >= 70 required                                 │
│   • Version controlled, audited                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ NEVER loaded from disk
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 DatabaseSkillLoader (DB-Only)                   │
│                                                                  │
│   Skills are loaded ONLY from PostgreSQL                         │
│   No disk file execution for skills                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

> **Security Note**: Loading skills from disk creates attack vectors. Nezha loads ONLY from database.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SKILL SOURCES                                 │
├─────────────────────┬─────────────────────┬────────────────────────┤
│   CLAWHUB           │   INTERNALLY-BUILT   │   TASK REVIEW         │
│   (External)        │   (AI-Generated)    │   (Auto-learned)      │
├─────────────────────┼─────────────────────┼────────────────────────┤
│ Search & Download   │ AI Builds Skill     │ QC After Task         │
│ Safety Review       │ Quality Gate        │ Learn from Results    │
│ User Approval       │ Maintainer Assigned │ Patterns to Memory    │
└─────────┬───────────┴──────────┬──────────┴───────────┬──────────────┘
          │                     │                      │
          └─────────────────────┼──────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL (Single Source of Truth)               │
├─────────────────────────────────────────────────────────────────────┤
│ skills ────────────── All skills with metadata                       │
│ skill_versions ─────── Version history for rollback                  │
│ skill_audit_log ───── Complete audit trail                          │
│ memory ─────────────── Learned patterns and knowledge               │
│ skill_builder_config ─ Builder settings and statistics              │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│              DatabaseSkillLoader (DB-Only Loading)                    │
│  • Only approved skills (status='approved')                         │
│  • Minimum safety score >= 70                                       │
│  • Version tracked                                                  │
│  • Access controlled                                               │
└─────────────────────────────────────────────────────────────────────┘
```

## Skill Sources

### 1. ClawHub Marketplace (External)

Skills downloaded from ClawHub with full safety pipeline:

```typescript
// Workflow
searchClawHub() → reviewSkill() → userApproval → saveToDatabase()
```

**Security layers:**

- Static code analysis (SkillReviewer)
- Dangerous pattern detection
- Safety scoring (0-100)
- User approval required
- Auto-block malicious skills

### 2. Internally-Built Skills (AI-Generated)

AI builds skills based on purpose/requirements:

```typescript
buildSkill({
  name: 'code-review',
  purpose: 'Performs automated code review',
  useCases: ['review PRs', 'check style']
}) → SkillSpec → Database
```

**Benefits:**

- Full control over skill content
- No external dependencies
- Builder/maintainer tracked
- Version controlled

### 3. Task Review (Auto-Learned)

QC system that learns from task outcomes:

```typescript
reviewTask(task) → score → issues → patterns → memory
```

**Learns:**

- Excellent solutions to remember
- Critical issues to avoid
- Common patterns
- Quality improvements

## Database Schema

### skills table

| Column         | Type   | Description                  |
| -------------- | ------ | ---------------------------- |
| id             | UUID   | Primary key                  |
| name           | TEXT   | Skill name                   |
| source         | ENUM   | clawhub, ai-built, generated |
| builder        | TEXT   | Who created the skill        |
| maintainer     | TEXT   | Who maintains it             |
| version        | TEXT   | Semantic version             |
| instructions   | TEXT   | Skill instructions           |
| safety_score   | INT    | 0-100                        |
| status         | ENUM   | pending, approved, blocked   |
| permissions    | TEXT[] | Required permissions         |
| use_count      | INT    | Usage tracking               |
| build_metadata | JSONB  | Build info                   |

### skill_versions table

| Column         | Type | Description     |
| -------------- | ---- | --------------- |
| skill_id       | UUID | FK to skills    |
| version        | TEXT | Version string  |
| instructions   | TEXT | Version content |
| change_summary | TEXT | What changed    |
| improved_by    | TEXT | Who improved    |

### skill_audit_log table

| Column       | Type        | Description               |
| ------------ | ----------- | ------------------------- |
| skill_id     | UUID        | FK to skills              |
| action       | ENUM        | installed, approved, used |
| performed_by | TEXT        | Who did it                |
| old_status   | TEXT        | Previous state            |
| new_status   | TEXT        | New state                 |
| created_at   | TIMESTAMPTZ | When                      |

## Security Model

### DB-Only Loading

```
Disk file → NEVER LOADED
     ↓
PostgreSQL → Approved → Loaded → Executed
```

**Enforced by:**

- `DatabaseSkillLoader` only reads from DB
- Skills must pass: status='approved', safety_score >= 70
- No disk file execution
- Cache with automatic invalidation

### ClawHub Safety Review

```typescript
const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/g, message: 'Dynamic code execution' },
  { pattern: /exec\s*\(/g, message: 'Command execution' },
  { pattern: /child_process/g, message: 'Process spawning' },
  { pattern: /rm\s+-rf/g, message: 'Destructive operations' },
  // ... 15+ patterns
];
```

### Approval Workflow

```
┌─────────┐    Review    ┌──────────┐   User     ┌──────────┐
│ ClawHub │ ──────────→ │ pending  │ ─────────→ │ approved │
│ Download │             │          │            │          │
└─────────┘              └──────────┘            └────┬─────┘
                                                        │
Auto-block if malicious ────────────────────────────────┘
```

## CLI Commands

### Skill Management

```bash
# Search and browse
nezha skills search <query>
nezha skills browse

# Install from ClawHub
nezha skills install <skill-name>

# List database skills
nezha skills list
```

### AI Skill Builder

```bash
# Build new skill
nezha skills build <name> <purpose>

# Improve existing skill
nezha skills improve <skill-id> "<improvement>"

# Deprecate skill
nezha skills deprecate <skill-id> "<reason>"

# Transfer maintainer
nezha skills transfer <skill-id> <new-maintainer>

# Get suggestions
nezha skills suggest
```

### Task Review

```bash
# Review completed task
nezha review <task-id> --title "<title>" --result <result>
```

## Skill Lifecycle

```
┌─────────┐    Build     ┌──────────┐   Review   ┌──────────┐
│ builder │ ──────────→ │ pending  │ ─────────→ │ approved │
│         │              │          │            │          │
└─────────┘              └──────────┘            └────┬─────┘
                                                       │
                              ┌──────────┐            │
                              │ improve  │ ←───────────┘
                              └──────────┘

                              ┌──────────┐
                              │deprecate │
                              └──────────┘
```

## Benefits

| Benefit                    | Implementation                              |
| -------------------------- | ------------------------------------------- |
| **Version control**        | `skill_versions` table, semantic versioning |
| **Access control**         | Per-project/user permissions                |
| **Audit logging**          | `skill_audit_log` with triggers             |
| **Centralized management** | PostgreSQL as source of truth               |
| **Security scanning**      | Static analysis + safety scores             |
| **AI-generated skills**    | SkillBuilder with quality gates             |
| **Self-improvement**       | TaskReview patterns → memory                |

## Integration with Learning System

```
Task Complete
    ↓
TaskReviewSkill.review()
    ↓
┌─────────────────────────┐
│ Quality Assessment      │
│ - Score calculation     │
│ - Issue detection       │
│ - Pattern extraction    │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Save to Memory          │
│ - Learned patterns      │
│ - Issues to avoid      │
│ - Excellent examples    │
└─────────────────────────┘
    ↓
Future tasks can recall from memory
```

## Future Enhancements

- [ ] Skill dependency resolution
- [ ] Skill composition (combine skills)
- [ ] Vector search for similar skills
- [ ] Automated skill testing
- [ ] Skill ratings and feedback
- [ ] SOUL.md / markdown knowledge import

---

**Version:** 1.0  
**Last Updated:** 2026-03-19
