# Nezha Skill System Architecture

> **Design Principle**: PostgreSQL-first. File system only when inevitable.
> 
> **Last Updated**: 2026-03-27 | **Status**: Production Ready | **Review**: [docs/reviews/skills_system_review_2026-03-27.md](./reviews/skills_system_review_2026-03-27.md)

## Current Status ✅

| Metric | Value | Status |
|--------|-------|--------|
| Total Skills | 610 | ✅ Active |
| Approved Skills | 610 (100%) | ✅ All Approved |
| AI-Built Skills | 604 (99%) | ✅ Auto-generated |
| Local Skills | 2 (0.3%) | ✅ Custom |
| Average Safety Score | ~85 | ✅ High Quality |
| Database Schema | 30 fields | ✅ Complete |
| Vector Search | Not Implemented | ⚠️ Planned |

**Recent Addition**: `network-diagnostics` skill (2026-03-27) - Comprehensive network troubleshooting

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

### High Priority (Planned for Next Sprint)

- [ ] **CLI Tools Implementation** - Add `nezha skills create/list/show/suggest/update/version` commands
- [ ] **Vector Search** - Integrate embedding provider for semantic skill search
- [ ] **Documentation Update** - Add CLI usage guide and practical code examples

### Medium Priority (Next Quarter)

- [ ] **Version Management** - Implement skill version rollback and diff viewing
- [ ] **Skill Dependency Resolution** - Handle skill dependencies automatically
- [ ] **Skill Composition** - Combine multiple skills for complex tasks

### Low Priority (Future)

- [ ] **Vector Search Enhancement** - Improve search with pgvector optimization
- [ ] **Automated Skill Testing** - Test skills before approval
- [ ] **Skill Ratings and Feedback** - User feedback system
- [ ] **SOUL.md / Markdown Knowledge Import** - Import external knowledge

## Known Issues

1. **CLI Tools Missing** - No CLI commands for skill management (use DatabaseSkillLoader directly)
2. **Vector Search Not Implemented** - `embedding` field exists but not utilized
3. **Cache Configuration Hardcoded** - 60-second cache expiry is not configurable
4. **Low Usage Statistics** - `use_count` field underutilized

## Quick Start Guide

### Creating a New Skill

```typescript
import { SkillBuilder } from './src/services/SkillBuilder.js';

const builder = new SkillBuilder();
const result = await builder.buildSkill({
  name: 'my-skill',
  purpose: 'Description of what this skill does',
  useCases: ['scenario 1', 'scenario 2'],
  requiredCapabilities: ['capability 1']
});

if (result.success) {
  console.log(`Skill created: ${result.skillId}`);
  console.log(`Quality Score: ${result.qualityScore}/100`);
}
```

### Using Skills in Tasks

```typescript
import { skillSystem } from './src/core/SkillSystem.js';

// Get skill suggestions for a task
const suggestions = await skillSystem.suggestSkills('network is slow, lots of packet loss');

// Execute a skill
const result = await skillSystem.executeSkill('network-diagnostics', {
  target: '8.8.8.8',
  testType: 'connectivity'
});
```

### Database Queries

```sql
-- List all skills
SELECT name, description, safety_score, use_count 
FROM skills 
WHERE status = 'approved' 
ORDER BY use_count DESC;

-- Search skills by trigger phrases
SELECT name, trigger_phrases 
FROM skills 
WHERE trigger_phrases @> ARRAY['network slow'];

-- Get skill statistics
SELECT 
  source,
  COUNT(*) as total,
  AVG(safety_score) as avg_score,
  AVG(use_count) as avg_usage
FROM skills 
WHERE status = 'approved'
GROUP BY source;
```

---

**Version:** 2.0  
**Last Updated:** 2026-03-27  
**Review Report**: [docs/reviews/skills_system_review_2026-03-27.md](./reviews/skills_system_review_2026-03-27.md)
