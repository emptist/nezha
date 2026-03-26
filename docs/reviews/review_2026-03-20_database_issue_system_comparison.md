# Database Issue System Comparison: Nezha vs OpenClaw

**Created**: 2026-03-20
**Author**: Trae AI
**Status**: Comprehensive Analysis

---

## Executive Summary

This review compares Nezha's database-backed issue/review system with OpenClaw's file-based memory system. Both systems serve different purposes and excel in different domains. Nezha's approach is more structured and queryable, while OpenClaw's approach is more flexible and portable.

---

## Part 1: Nezha's Reviews Table and Tools

### Database Schema

Nezha implements a comprehensive `reviews` table (migration 033):

```sql
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_type TEXT CHECK (review_type IN ('code', 'design', 'qc', 'peer', 'task', 'security', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'follow_up', 'closed')),
  current_state TEXT DEFAULT 'initial',
  target_id TEXT,
  target_type TEXT,
  title TEXT,
  description TEXT,
  reviewer_id TEXT,
  findings JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  follow_up_due TIMESTAMPTZ,
  follow_up_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### Tools for Filling the Reviews Table

Nezha provides **multiple tools** for populating the reviews table:

#### 1. ReviewService (Programmatic API)

Located at [ReviewService.ts](file:///Users/jk/gits/hub/nezha/src/services/ReviewService.ts), provides:

- `createReview()` - Create a new review with type, title, target
- `createQCReviewFromTask()` - Auto-create QC review from completed task
- `startReview()` - Mark review as in_progress
- `completeReview()` - Complete with findings and action items
- `getPendingFollowUps()` - Get reviews needing follow-up
- `completeActionItem()` - Mark individual action items complete
- `getReviewStats()` - Get statistics on reviews

#### 2. InterReviewService (AI-Powered Reviews)

Located at [InterReviewService.ts](file:///Users/jk/gits/hub/nezha/src/services/InterReviewService.ts), provides:

- `requestReview()` - Request an AI review
- `performReview()` - Execute AI-powered code review
- `respondToReview()` - Respond to review findings
- `saveLearningsToMemory()` - Extract and save learnings
- `getSkillsFromLearnings()` - Convert learnings to skills

#### 3. QCService (Quality Control)

Located at [QCService.ts](file:///Users/jk/gits/hub/nezha/src/services/QCService.ts), provides:

- `createQCReview()` - Create QC review for a task
- `shouldTriggerQC()` - Determine if QC should run
- `completeReview()` - Complete with scores and findings

#### 4. CLI Commands

```bash
nezha review-request [commit]       # Request AI review of current changes
nezha review-show [id]              # Show review details or pending reviews
nezha review-stats                  # Show review statistics
nezha review-respond <id> <msg>     # Respond to a review
```

### Current State

- **reviews table**: 1 record (pending QC review)
- **inter_reviews table**: 50 records (active AI review history)

### Experience Using the Database Issue System

#### Strengths

1. **Structured Data**: JSONB fields for findings and action items enable complex queries
2. **Follow-up Tracking**: Built-in follow-up due dates and status tracking
3. **Type Safety**: Enum-like constraints ensure data integrity
4. **Integration**: Seamless integration with tasks table for creating follow-up tasks
5. **Statistics**: Easy to query for metrics and analytics
6. **Multi-Reviewer Support**: reviewer_id field enables tracking who did what

#### Pain Points

1. **Manual Entry Required**: Most tools require programmatic or CLI invocation
2. **No Web UI**: No visual interface for managing reviews
3. **Learning Curve**: Need to understand the schema and relationships
4. **Separate Tables**: `reviews`, `inter_reviews`, and `qc_reviews` serve similar but distinct purposes

---

## Part 2: OpenClaw's Memory System

### Architecture

OpenClaw uses a **file-based memory system** with:

1. **MEMORY.md** - Primary memory file in workspace
2. **memory/** directory - Additional memory files
3. **HEARTBEAT.md** - Task list for continuous operation
4. **AGENTS.md** - Agent instructions
5. **SOUL.md** - Persona definitions

### Key Characteristics

| Aspect | Implementation |
|--------|---------------|
| **Storage** | Markdown files in workspace |
| **Query** | Full-text search, embeddings |
| **Portability** | Git-versioned, human-readable |
| **AI Integration** | Loaded as context for each session |
| **Multimodal** | Supports images, audio via memory/ directory |

### Memory Workflow

```
User Message → Agent loads MEMORY.md + memory/* → AI processes with context → Updates written back
```

### OpenClaw's Approach to Issues/Tasks

OpenClaw does NOT have a database issue system. Instead:

1. **HEARTBEAT.md** - Contains task list for the AI to work on
2. **Session-based** - Tasks are managed within conversation context
3. **File-based** - All state stored in markdown files
4. **No persistence layer** - No PostgreSQL, no external database

---

## Part 3: Comparison Analysis

### Architectural Differences

| Dimension | Nezha | OpenClaw |
|-----------|-------|----------|
| **Storage** | PostgreSQL database | Markdown files |
| **Query** | SQL with JSONB | Full-text + embeddings |
| **Schema** | Structured tables | Unstructured markdown |
| **Relationships** | Foreign keys, joins | File references |
| **Transactions** | ACID compliance | Git commits |
| **Scalability** | Database scaling | File system scaling |
| **Portability** | Database dump/restore | Git clone |
| **Human Readability** | Requires tools | Direct reading |

### Issue/Task Management

| Feature | Nezha | OpenClaw |
|---------|-------|----------|
| **Task Storage** | `tasks` table | HEARTBEAT.md |
| **Review Storage** | `reviews` + `inter_reviews` tables | In conversation |
| **Priority** | Numeric field (1-10) | Manual ordering |
| **Status Tracking** | Enum states | Manual updates |
| **Assignee** | `assigned_to` field | Implicit |
| **Due Dates** | `follow_up_due` column | Manual |
| **Dependencies** | `depends_on` array | Manual |
| **History** | `updated_at` timestamps | Git history |

### AI Integration

| Aspect | Nezha | OpenClaw |
|--------|-------|----------|
| **Context Loading** | Query database | Read files |
| **Learning Storage** | `memory` + `skills` tables | MEMORY.md |
| **Review Automation** | InterReviewService | Manual/external |
| **Self-Improvement** | SelfImprovementService | HEARTBEAT.md loop |

### Developer Experience

| Factor | Nezha | OpenClaw |
|--------|-------|----------|
| **Setup Complexity** | High (PostgreSQL required) | Low (just files) |
| **Query Power** | High (SQL) | Medium (text search) |
| **Debugging** | Database queries | File inspection |
| **Backup** | pg_dump | git commit |
| **Multi-Project** | Native support | Separate workspaces |

---

## Part 4: Recommendations

### For Nezha

1. **Add Web UI**: Create a simple dashboard for viewing/managing reviews
2. **Consolidate Tables**: Consider merging `reviews`, `inter_reviews`, `qc_reviews`
3. **Auto-Population**: Add triggers to auto-create reviews from git commits
4. **Better CLI**: Add `nezha review create` command for manual review creation
5. **Export/Import**: Add ability to export reviews to markdown for portability

### For OpenClaw

1. **Structured Task Format**: Add optional YAML frontmatter to HEARTBEAT.md
2. **Task Status Tracking**: Add status indicators in markdown
3. **Review Templates**: Add templates for code reviews in memory/
4. **Cross-Session Persistence**: Better task state preservation

### Hybrid Approach

Consider a hybrid approach:
- Use PostgreSQL for structured data (tasks, reviews, metrics)
- Use markdown files for human-readable exports and backups
- Sync between both for best of both worlds

---

## Conclusion

**Nezha's database system** excels at:
- Structured data management
- Complex queries and analytics
- Multi-user/multi-AI collaboration
- Audit trails and history

**OpenClaw's file system** excels at:
- Simplicity and portability
- Human readability
- Git-based version control
- Quick setup and deployment

The choice depends on your use case:
- **Choose Nezha** for complex, multi-project, team-based AI coordination
- **Choose OpenClaw** for personal, single-project AI assistance

Both systems are well-designed for their intended purposes. Nezha's reviews table is well-structured with good tooling, but could benefit from better UX (web UI, simpler CLI). OpenClaw's simplicity is its strength, but limits scalability for complex workflows.

---

## Appendix: Design Issue Found and Fixed (2026-03-20)

### Issue: InterReviewService Required External API Key

**Problem**: The `InterReviewService` was designed to require an external AI API key (OpenAI/Anthropic), even though Nezha already has OpenCode integration via `UnifiedAgent`. This was inconsistent with `HeartbeatService` which uses OpenCode's built-in models.

**Root Cause**: `InterReviewService` created its own `AIProvider` instance instead of using the existing `UnifiedAgent` transport mechanism.

**Fix Applied**:
1. Modified `InterReviewService` to accept optional `UnifiedAgent` parameter
2. Updated `InterReviewCommands` to create `UnifiedAgent` using same config as `HeartbeatService`
3. Added GLM-4-Flash support to `AIProviderFactory` for users who prefer direct API access
4. Fixed PostgreSQL array format issue (tags field was using JSON.stringify instead of native array)
5. Fixed skills table INSERT to match actual schema (removed non-existent `status` column)

**Result**: Inter-review system now works with OpenCode's built-in models - no external API key required!

### Additional Issue: Skills Table Schema Mismatch

**Problem**: The code expected a `status` column in the `skills` table, but it doesn't exist.

**Recommendation**: Add a `status` column if skill approval workflow is needed:
```sql
ALTER TABLE skills ADD COLUMN status TEXT DEFAULT 'approved' 
CHECK (status IN ('draft', 'pending', 'approved', 'rejected'));
```

**Task Created**: "Add status column to skills table" (priority 5)

---

**Review Type**: System Comparison
**Confidence**: High
**Next Steps**: Consider implementing recommendations for improved UX
**Updated**: 2026-03-20 with design issue findings
