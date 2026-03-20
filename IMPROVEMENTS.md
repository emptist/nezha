# Nezha Systemic Improvement Plan

> Last Updated: 2026-03-20
> Status: Active Development

## Session 2026-03-20 Key Findings

See [SESSION_RESEARCH_2026-03-20.md](./docs/SESSION_RESEARCH_2026-03-20.md) for comprehensive session findings.

### Critical Insights

1. **Database-first is about SAFETY** - not just query capability
2. **Skills must be DB-only** - prevents attack vectors
3. **Meeting system exists but needs automation** - heartbeat integration needed
4. **AIs need auto-onboarding** - created `nezha-essential` skill
5. **UUID for agent identity** - inter-AI identification

### Implemented This Session

- `learn()` and `suggest_prompt_update()` functions
- Reflection parsing from AI output
- `created_by` column for tasks
- OpenClaw-style skill triggers (trigger_phrases, anti_patterns)

## Design Foundation

**重要**: 核心架构决策文档见 [PHILOSOPHY.md](../PHILOSOPHY.md)

本文档聚焦于基线之上的改进。存储设计的基础原则：

| 问题                  | 解决方案                         |
| --------------------- | -------------------------------- |
| 为什么用 PostgreSQL？ | 可查询、可并发、可靠             |
| 什么存数据库？        | tasks, memory, skills, audit_log |
| 什么存文件？          | 每日记忆、MEMORY.md、配置        |
| 如何迁移？            | pg_dump/pg_restore               |

**详细说明**: 参见 [PHILOSOPHY.md](../PHILOSOPHY.md#critical-design-rule)

## Executive Summary

This document outlines the systemic improvements needed to transform Nezha from a basic task queue into an autonomous AI agent system similar to OpenClaw. Based on comparison with OpenClaw's architecture, we identify key missing capabilities and their implementation priorities.

---

## Part 1: Comparison Analysis

### OpenClaw vs Nezha Feature Matrix

| Feature                        | OpenClaw                          | Nezha                         | Priority |
| ------------------------------ | --------------------------------- | ----------------------------- | -------- |
| **Daily Memory**               | ✅ memory/YYYY-MM-DD.md           | ❌                            | P0       |
| **Curated Long-term Memory**   | ✅ MEMORY.md integrated in prompt | ⚠️ Static file only           | P0       |
| **Searchable Memory (Vector)** | ✅ pgvector + semantic search     | ❌ Basic JSON match           | P0       |
| **Multi-brain Parallel Tasks** | ✅ ACP protocol, multiple agents  | ❌ Sequential only            | P1       |
| **Self-Learning via Prompts**  | ✅ Can update own prompts         | ⚠️ Stub exists, unimplemented | P1       |
| **Health Monitoring**          | ✅ Web dashboard, metrics         | ❌ Basic logs only            | P2       |
| **Task Dependencies**          | ✅ DAG-based                      | ❌ Flat queue only            | P2       |
| **Persistent Sessions**        | ✅ ACP with state                 | ❌ HTTP session per task      | P2       |

### Root Cause Analysis

**Why Nezha lacks continuous learning:**

1. Memory is stored in PostgreSQL but never retrieved contextually
2. No embedding-based search to find relevant past experiences
3. Agent has no way to "remember" solutions to similar problems
4. No daily reflection/learning loop

### Storage Architecture (Reference)

> 完整设计: [PHILOSOPHY.md](../PHILOSOPHY.md#how-we-compare-to-openclaw)

| Data Type                  | Storage               | Reason                         |
| -------------------------- | --------------------- | ------------------------------ |
| Tasks, Workers, Audit Logs | PostgreSQL            | Queryable, concurrent, ACID    |
| Memory (knowledge base)    | PostgreSQL + pgvector | Semantic search required       |
| Skills Registry            | PostgreSQL            | Many-to-many, version tracking |
| Daily Memory Logs          | Files (.tmp/)         | Human readable, append-only    |
| Curated Knowledge          | MEMORY.md             | Human editable, AI reference   |

**Import/Export for Knowledge Base:**

```bash
# Export entire DB
pg_dump nezha > backup.sql

# Export specific tables (memory, skills)
pg_dump -t memory -t skills nezha > knowledge.sql

# Import on new machine
psql nezha-new < backup.sql

# Cross-machine migration
# 1. Source: pg_dump nezha > migration.sql
# 2. Target: createdb nezha && psql nezha < migration.sql
```

---

## Part 2: Implementation Roadmap

### Phase 0: Memory System (P0) ⚠️ CRITICAL

**Goal:** Enable Nezha to remember and retrieve past experiences semantically

#### 0.1 Daily Memory (memory/YYYY-MM-DD.md)

```
Directory: .tmp/nezha-memory/
Files: 2026-03-18.md, 2026-03-17.md, ...
```

**Format:**

```markdown
# 2026-03-18

## Tasks Executed

- "Review Agent.ts" → Found race condition in timeout handling
- "Fix stdin issue" → Root cause: opencode run expects TTY

## Learnings

- opencode serve (HTTP) works better than opencode run (CLI) for daemon
- execSync blocks event loop - use HTTP API instead

## Decisions

- Use opencode serve --port 4096 for task execution
- Session reuse for efficiency
```

**Implementation:**

- Create `.tmp/nezha-memory/` directory on startup
- Append to today's file after each task completes
- Include: task prompt, result, errors, solutions found

#### 0.2 Curated Memory (MEMORY.md)

```
Location: .tmp/nezha-memory/MEMORY.md
```

**Format:**

```markdown
# Nezha Long-term Memory

## Core Identity

- I'm Nezha, an autonomous AI agent
- I execute tasks from PostgreSQL queue via heartbeat
- I use opencode serve HTTP API for task execution

## How I Work

1. Heartbeat polls DB every 30s for PENDING tasks
2. Tasks are sent to opencode serve via HTTP
3. Results stored in DB with full response JSON

## Key Learnings

- opencode run (CLI) hangs in daemon - use opencode serve instead
- execSync blocks event loop - use HTTP API or exec with callback
- stdin must be redirected to /dev/null for non-TTY execution
- Session reuse improves efficiency (avoid creating new session per task)

## Tools Available

- memory_save(id, content, metadata) - Save to memory
- memory_search(query) - Semantic search via embeddings
- memory_link(source, target) - Link related memories
```

**Implementation:**

- Load MEMORY.md content into agent system prompt
- Allow AI to update it via tool calls
- Include at start of every task context

#### 0.3 Semantic Search Memory

**Current Problem:** MemoryService uses naive `JSON.stringify().includes()` - useless for retrieval

**Solution:** Use embeddings (Ollama already configured)

**Database Schema:**

```sql
-- Add to memory table or create new table
ALTER TABLE memory ADD COLUMN embedding vector(1536);
CREATE INDEX idx_memory_embedding ON memory USING ivfflat (embedding vector_cosine_ops);
```

**API:**

```typescript
interface MemorySearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

// Tool: memory_search(query: string) → MemorySearchResult[]
```

**Implementation Steps:**

1. Enable pgvector or use simple cosine similarity with Ollama embeddings
2. Add embedding column to memory table
3. On task completion: generate embedding and store
4. On new task: embed prompt, search top-K similar memories
5. Include results in task context

---

### Phase 1: Parallel Execution (P1)

**Goal:** Execute multiple tasks concurrently

**Current State:**

- Scheduler awaits each task before checking next
- setInterval heartbeat blocked during task execution

**Solution:**

```typescript
interface TaskWorker {
  id: string;
  status: 'idle' | 'busy';
  currentTask?: string;
}

class TaskPool {
  private workers: TaskWorker[] = [];
  private maxConcurrent: number = 3;

  async schedule(tasks: Task[]): Promise<void> {
    const pending = tasks.filter(t => t.status === 'PENDING');
    const slots = this.maxConcurrent - this.workers.filter(w => w.status === 'busy').length;

    for (const task of pending.slice(0, slots)) {
      this.executeInWorker(task);
    }
  }
}
```

**Database Update:**

```sql
ALTER TABLE tasks ADD COLUMN worker_id UUID;
ALTER TABLE tasks ADD COLUMN parallel_group INT;
```

---

### Phase 2: Self-Learning (P1)

**Goal:** AI can improve its own prompts and configuration

**Current State:**

- `ContinuousImprovementLoop.ts` exists but is stubbed
- No mechanism for AI to modify its own behavior

**Solution:**

```typescript
// Tools for AI
interface SelfImprovement {
  // Update system prompt
  update_prompt(new_prompt: string): void;

  // Add to memory
  learn(insight: string, context: string): void;

  // Mark lesson learned
  remember(lesson: string, from_task: string): void;
}
```

**Workflow:**

1. After task completes, AI reviews its own performance
2. If novel solution found → save to MEMORY.md
3. If repeated pattern → suggest prompt improvement
4. Human approves → update system prompt

---

### Phase 3: Monitoring (P2)

**Goal:** Real-time visibility into Nezha's operation

**Endpoints to Add:**

```typescript
// GET /health
{
  "status": "healthy",
  "uptime": 3600,
  "tasks": {
    "pending": 5,
    "running": 2,
    "completed_today": 15,
    "failed_today": 1
  },
  "memory": {
    "total_memories": 150,
    "search_indexed": 120
  },
  "workers": [
    { "id": "w1", "status": "idle" },
    { "id": "w2", "status": "busy", "task": "Review code" }
  ]
}

// GET /metrics
{
  "tasks_per_hour": 12,
  "avg_task_duration": 45000,
  "success_rate": 0.95,
  "memory_recall_rate": 0.3
}
```

---

### Phase 4: Task Dependencies (P2)

**Goal:** Support DAG-based task execution

**Schema:**

```sql
ALTER TABLE tasks ADD COLUMN depends_on UUID[];
ALTER TABLE tasks ADD COLUMN blocking UUID[];

-- Task only runs when all depends_on are COMPLETED
-- Task blocks all tasks in blocking[]
```

**CLI Enhancement:**

```bash
node cli/index.js task-add "Phase 2" "Do phase 2" --depends-on <phase1-id>
```

---

## Part 3: Technical Specifications

### 3.1 Memory Search Algorithm

```typescript
class SemanticMemory {
  async search(query: string, topK: number = 5): Promise<MemorySearchResult[]> {
    // 1. Embed query
    const queryEmbedding = await this.embedding.embed(query);

    // 2. Search in DB (pgvector or manual)
    const results = await this.db.query(
      `
      SELECT id, content, metadata,
        (embedding <=> $1) as distance
      FROM memory
      ORDER BY embedding <=> $1
      LIMIT $2
    `,
      [queryEmbedding, topK]
    );

    // 3. Filter by threshold
    return results.rows
      .filter(r => r.distance < 0.3)
      .map(r => ({
        id: r.id,
        content: r.content,
        similarity: 1 - r.distance,
        metadata: r.metadata,
      }));
  }
}
```

### 3.2 Context Injection

```typescript
async function buildTaskContext(task: Task): Promise<string> {
  // 1. Get relevant memories
  const memories = await memory.search(task.description, topK: 3);

  // 2. Build context string
  const context = `
## Relevant Past Experience
${memories.map(m => `- ${m.content} (similarity: ${m.similarity})`).join('\n')}

## Today's Memory
${todayMemoryContent}

## Task
${task.description}
  `.trim();

  return context;
}
```

### 3.3 Daily Memory Format

```typescript
interface DailyMemoryEntry {
  date: string; // YYYY-MM-DD
  tasks: Array<{
    id: string;
    title: string;
    prompt: string;
    result: string;
    errors?: string[];
    solution?: string;
  }>;
  learnings: string[];
  reflections: string[];
}

class DailyMemory {
  private filePath: string;

  async append(task: Task, result: TaskResult): Promise<void> {
    const entry = {
      task_id: task.id,
      title: task.title,
      prompt: task.description,
      result: result.message?.substring(0, 500),
      errors: result.error ? [result.error] : [],
    };

    // Append to day's markdown file
    await fs.appendFile(
      this.filePath,
      `\n- **${task.title}**: ${result.success ? '✅' : '❌'} ${entry.result}`
    );
  }
}
```

---

## Part 4: Implementation Order

```
Week 1: Daily Memory + MEMORY.md integration
  └─> Enable AI to remember daily activities

Week 2: Semantic Search
  └─> Enable retrieval of relevant past experiences

Week 3: Parallel Execution
  └─> Execute multiple tasks concurrently

Week 4: Self-Learning Loop
  └─> AI can update its own prompts

Week 5: Monitoring Dashboard
  └─> Real-time visibility

Week 6: Task Dependencies
  └─> DAG-based execution
```

---

## Part 5: Success Metrics

| Metric                | Current | Target                              |
| --------------------- | ------- | ----------------------------------- |
| Task completion rate  | ~80%    | >95%                                |
| Memory recall         | 0%      | >30% of tasks use relevant memories |
| Parallel tasks        | 1       | 3-5 concurrent                      |
| Self-improvement      | 0       | AI suggests improvements weekly     |
| Mean time to complete | Varies  | Decreasing over time                |

---

## Appendix A: File Structure

```
.tmp/nezha-memory/
├── 2026-03-18.md      # Daily logs
├── 2026-03-17.md
├── MEMORY.md           # Curated long-term memory
└── embeddings/         # Vector cache

src/
├── services/
│   ├── MemoryService.ts      # Existing, needs upgrade
│   ├── DailyMemory.ts        # NEW: Daily log
│   ├── SemanticSearch.ts     # NEW: Vector search
│   └── ContextBuilder.ts     # NEW: Build task context
├── tools/
│   ├── memory_save.ts        # NEW
│   ├── memory_search.ts      # NEW
│   └── memory_learn.ts       # NEW: Self-improvement
└── cli/
    └── index.ts              # Add memory commands
```

---

## Appendix B: Database Schema Updates

```sql
-- Memory with embeddings
ALTER TABLE memory ADD COLUMN embedding vector(1536);
CREATE INDEX idx_memory_embedding ON memory USING ivfflat (embedding vector_cosine_ops);

-- Daily memory table
CREATE TABLE daily_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  content TEXT NOT NULL,
  task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_daily_memory_date ON daily_memory(date DESC);

-- Task dependencies
ALTER TABLE tasks ADD COLUMN depends_on UUID[] DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN blocking UUID[] DEFAULT '{}';

-- Worker pool
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  current_task_id UUID REFERENCES tasks(id),
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Appendix C: OpenClaw Reference

Key files studied:

- `/Users/jk/.openclaw/workspace/AGENTS.md` - Workspace structure
- `/Users/jk/.openclaw/workspace/SOUL.md` - Agent identity
- `/Users/jk/.openclaw/workspace/memory/` - Daily memory (to be implemented)
- `/Users/jk/.openclaw/workspace/TASKS.md` - Task tracking

Key insights from OpenClaw:

1. Memory is file-based (markdown) not DB-only
2. Daily reflection is key to learning
3. Agent has explicit identity (SOUL.md)
4. Tools are documented and discoverable
5. Human approval required for self-modification
