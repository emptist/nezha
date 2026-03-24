# Nezha Knowledge Management System

**Created**: 2026-03-22  
**Status**: Active  
**Purpose**: Guide for AI and human users on knowledge sharing and accumulation

---

## Overview

Nezha provides a comprehensive knowledge management system that enables both AI agents and human users to share, accumulate, and query knowledge across sessions and projects.

---

## Database Mechanisms

### 1. Memory Table

**Purpose**: Core knowledge storage for learnings, insights, and experiences

**Schema**:
```sql
CREATE TABLE memory (
    id UUID PRIMARY KEY,
    project_id UUID,              -- Optional project association
    content TEXT NOT NULL,        -- Knowledge content
    source TEXT,                  -- Source identifier
    tags TEXT[],                  -- Classification tags
    metadata JSONB,               -- Additional metadata
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    embedding VECTOR(768),        -- Vector search support
    importance INTEGER,           -- 1-10 importance score
    has_sensitive BOOLEAN,        -- Privacy flag
    agent_id UUID,                -- Agent who created it
    session_id VARCHAR(50)        -- Session identifier
);
```

**Key Features**:
- Vector similarity search via pgvector
- Tag-based classification
- Importance scoring (1-10)
- Source tracking
- Agent attribution

**Usage Examples**:
```bash
# Save a learning
node dist/cli/index.js learn "insight text" --context "context" --importance 8

# areflect with structured markers
node dist/cli/index.js areflect "[LEARN] insight: ... context: ..."
```

---

### 2. Skills Table

**Purpose**: Reusable skill storage with version management

**Schema**:
```sql
CREATE TABLE skills (
    id UUID PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    category TEXT,
    is_enabled BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Key Features**:
- Version management
- Audit logging
- Feedback mechanism
- Quality gates

**Related Tables**:
- `skill_versions` - Version history
- `skill_audit_log` - Change tracking
- `skill_feedback` - User feedback
- `skill_builder_config` - Configuration

---

### 3. Knowledge Links Table

**Purpose**: Connect different types of knowledge

**Schema**:
```sql
CREATE TABLE knowledge_links (
    id UUID PRIMARY KEY,
    from_type VARCHAR(20) NOT NULL,  -- 'memory', 'skill', 'issue', etc.
    from_id UUID NOT NULL,
    to_type VARCHAR(20) NOT NULL,
    to_id UUID NOT NULL,
    relation VARCHAR(50) NOT NULL,   -- 'relates-to', 'derived-from', etc.
    confidence DOUBLE PRECISION,     -- 0-1 confidence score
    context TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ
);
```

**Key Features**:
- Cross-type linking
- Relationship types
- Confidence scoring
- Context preservation

---

### 4. Issues Table

**Purpose**: Track problems and their resolutions

**Schema**:
```sql
CREATE TABLE issues (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    issue_type TEXT NOT NULL,        -- 'bug', 'feature', 'improvement', etc.
    severity TEXT,                   -- 'critical', 'high', 'medium', 'low'
    status TEXT,                     -- 'open', 'in_progress', 'resolved', etc.
    discovered_by TEXT,
    discovered_at TIMESTAMPTZ,
    related_issue_id UUID,
    task_id UUID,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    tags TEXT[],
    metadata JSONB
);
```

**Key Features**:
- Severity classification
- Status tracking
- Task association
- Resolution history

---

### 5. Inter-Reviews Table

**Purpose**: Store code review results and learnings

**Schema**:
```sql
CREATE TABLE inter_reviews (
    id UUID PRIMARY KEY,
    task_id UUID,
    commit_hash TEXT,
    reviewer_id TEXT NOT NULL,
    status TEXT,                     -- 'pending', 'in_progress', 'completed'
    summary TEXT,
    findings JSONB,
    suggestions JSONB,
    issues JSONB,
    praise JSONB,
    overall_score INTEGER,           -- 0-100
    code_quality_score INTEGER,
    test_coverage_score INTEGER,
    documentation_score INTEGER,
    response TEXT,
    accepted_suggestions JSONB
);
```

**Key Features**:
- Multi-dimensional scoring
- Structured findings
- Suggestion tracking
- Response management

---

### 6. Project Communications Table

**Purpose**: AI-to-AI communication and broadcasts

**Schema**:
```sql
CREATE TABLE project_communications (
    id UUID PRIMARY KEY,
    project_id UUID,
    from_ai TEXT NOT NULL,
    to_ai TEXT,
    message_type TEXT NOT NULL,      -- 'broadcast', 'task', 'review', etc.
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    priority TEXT                    -- 'low', 'normal', 'high', 'critical'
);
```

**Key Features**:
- Priority levels
- Read status tracking
- Message types
- Agent targeting

---

### 7. Meetings Table

**Purpose**: AI-to-AI meetings and discussions

**Schema**:
```sql
CREATE TABLE meetings (
    id UUID PRIMARY KEY,
    topic TEXT NOT NULL,
    status TEXT NOT NULL,            -- 'active', 'completed', 'cancelled'
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ,
    consensus TEXT,
    consensus_at TIMESTAMPTZ,
    metadata JSONB
);
```

**Key Features**:
- Topic-based discussions
- Consensus tracking
- Status management
- Metadata support

---

### 8. Meeting Opinions Table

**Purpose**: Store AI opinions in meetings

**Schema**:
```sql
CREATE TABLE meeting_opinions (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL,
    author TEXT NOT NULL,
    perspective TEXT NOT NULL,
    reasoning TEXT,
    position TEXT,                   -- 'support', 'oppose', 'neutral'
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Key Features**:
- Position tracking
- Reasoning documentation
- Perspective sharing
- Meeting association

---

## CLI Tools

### Knowledge Recording

```bash
# Save a learning with context
node dist/cli/index.js learn "insight text" --context "context" --importance 8

# areflect with structured markers
node dist/cli/index.js areflect "[LEARN] insight: ... context: ..."

# Import documentation
node dist/cli/index.js import-docs
```

### Knowledge Sharing

```bash
# Broadcast to all AIs
node dist/cli/index.js announce "message"

# Broadcast with priority
node dist/cli/index.js announce "msg" --priority high

# Send direct message
node dist/cli/index.js announce "msg" --to <agent-id>

# Share and broadcast
node dist/cli/index.js share "reflection text"
```

### Knowledge Query

```bash
# List broadcasts
node dist/cli/index.js broadcasts list

# Show unread broadcasts
node dist/cli/index.js broadcasts unread

# Mark broadcasts as read
node dist/cli/index.js broadcasts read

# Reflection statistics
node dist/cli/index.js reflection-stats

# Daily reflection summary
node dist/cli/index.js reflection-summary

# Weekly trends
node dist/cli/index.js reflection-trends
```

### AI Meetings

```bash
# Create a discussion
node dist/cli/index.js meeting discuss "API Design" "REST or GraphQL?"

# List active discussions
node dist/cli/index.js meeting list

# Show discussion details
node dist/cli/index.js meeting show [id]

# Record an opinion
node dist/cli/index.js meeting opinion <meeting-id> <author>

# Record consensus
node dist/cli/index.js meeting consensus <topic> <participants> <decision>

# View consensus history
node dist/cli/index.js meeting history
```

---

## Best Practices

### For AI Agents

1. **Record Learnings Immediately**
   - Use `areflect` after completing tasks
   - Include context for future reference
   - Set appropriate importance scores

2. **Share Important Findings**
   - Use `announce` for critical discoveries
   - Use `share` for insights worth remembering
   - Set appropriate priority levels

3. **Link Related Knowledge**
   - Connect related memories via `knowledge_links`
   - Reference issues and tasks
   - Maintain knowledge graph

4. **Review and Update**
   - Check existing knowledge before creating new
   - Update outdated information
   - Mark obsolete knowledge

### For Human Users

1. **Query Knowledge**
   - Use SQL queries for complex searches
   - Check `memory` table for recent learnings
   - Review `issues` table for problems

2. **Monitor AI Activity**
   - Check `project_communications` for broadcasts
   - Review `inter_reviews` for code quality
   - Track `agent_sessions` for active agents

3. **Provide Feedback**
   - Use `skill_feedback` table for skill improvements
   - Acknowledge important alerts
   - Update documentation

---

## Integration with Heartbeat

The knowledge management system integrates with the heartbeat mechanism:

1. **Context Building**: Heartbeat uses `ContextBuilder` to gather relevant knowledge
2. **Memory Injection**: Relevant memories are injected into task context
3. **Learning Capture**: Task results are parsed for learnings
4. **Knowledge Sharing**: Important findings are broadcast to other AIs

---

## Recent Findings (2026-03-22)

### Heartbeat Architecture Insights

1. **OpenCode has no heartbeat mechanism** - Nezha's HeartbeatService sends tasks via HTTP to OpenCode server
2. **CLI Transport Bug** - opencode CLI spawn from Node.js hangs without output
3. **Runaway processes** - Come from IDE watch mode, not heartbeat mechanism
4. **Lane-based serialization** - OpenClaw uses this to prevent resource competition

### Knowledge Storage Locations

- **MEMORY.md** - `.tmp/nezha-memory/MEMORY.md` (curated long-term memory)
- **Daily Memory** - `.tmp/nezha-memory/YYYY-MM-DD.md` (ephemeral daily tracking)
- **Database** - `memory` table with vector embeddings
- **Skills** - `skills` table with version management

---

## Future Improvements

1. **Enhanced Vector Search** - Improve embedding quality and search relevance
2. **Knowledge Graph** - Visualize knowledge connections
3. **Auto-categorization** - Automatically tag and categorize new knowledge
4. **Knowledge Decay** - Implement importance decay over time
5. **Cross-project Learning** - Better support for knowledge transfer between projects

---

## Related Documentation

- [DAEMON_SYSTEM_RESEARCH.md](./DAEMON_SYSTEM_RESEARCH.md) - Research on daemon/heartbeat systems
- [KNOWLEDGE_HANDOVER_MECHANISM.md](./KNOWLEDGE_HANDOVER_MECHANISM.md) - Knowledge handover design
- [UNIFIED_KNOWLEDGE_BASE_DESIGN.md](./UNIFIED_KNOWLEDGE_BASE_DESIGN.md) - Unified knowledge base architecture

---

*This document is maintained by Nezha AI agents and human collaborators.*
