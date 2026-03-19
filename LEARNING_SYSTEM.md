# Learning System Design

> AI-driven learning system for Nezha - 让 AI 自主学习、存储和应用知识
> 
> **PostgreSQL-powered** vs OpenClaw's file-based approach

## PostgreSQL Advantages Over OpenClaw

| Feature | OpenClaw (File-based) | Nezha (PostgreSQL) |
|---------|----------------------|-------------------|
| **Semantic Search** | Limited/None | pgvector + embedding |
| **Relationships** | Manual linking | Auto-built knowledge graph |
| **Query Flexibility** | Linear file scan | SQL + indexes |
| **Concurrency** | File locks | ACID transactions |
| **Pattern Analysis** | Manual extraction | Auto-categorization |
| **Scalability** | Poor | Excellent (100M+ rows) |
| **Analytics** | Basic stats | Full analytics suite |

## Core Philosophy

### Traditional vs AI-driven

| Aspect | Traditional Program | AI-driven System |
|--------|--------------------|--------------------|
| **Implementation** | NLP rules | Prompt instructions |
| **Knowledge Extraction** | Pattern matching | AI understands context |
| **Judgment** | Fixed rules | AI decides autonomously |
| **Flexibility** | Low | High |
| **Maintenance** | High | Low |

**Core Principle**: Don't implement learning in code. Let AI learn through prompts.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Agent (LLM)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  System Prompt with Learning Instructions                 │   │
│  │  - When to Learn                                          │   │
│  │  - How to Extract Knowledge                               │   │
│  │  - How to Store/Link Knowledge                            │   │
│  │  - How to Apply Past Learnings                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ Tool Calls
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Learning Tools                            │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐     │
│  │ memory_save   │  │ memory_search  │  │ memory_link    │     │
│  │ Pattern CRUD  │  │ Semantic Query │  │ Knowledge Graph│     │
│  └───────────────┘  └───────────────┘  └────────────────┘     │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐     │
│  │record_outcome │  │suggest_improv │  │find_solutions  │     │
│  │ Task Analysis │  │ Auto Analysis  │  │ Semantic Match │     │
│  └───────────────┘  └───────────────┘  └────────────────┘     │
└────────────────────────────┬────────────────────────────────────┘
                             │ Data Access
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL (Storage Layer)                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  memories              - Long-term knowledge storage     │    │
│  │  task_outcomes         - Task execution results         │    │
│  │  task_patterns         - Success/failure patterns        │    │
│  │  knowledge_links       - Knowledge graph connections     │    │
│  │  learning_insights     - AI-generated insights           │    │
│  └──────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  pgvector (768-dim) - Semantic similarity search        │    │
│  │  Full-text search    - Keyword matching                  │    │
│  │  JSONB metadata      - Flexible data storage             │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## System Prompt Design

### Learning Instructions Template

```typescript
const LEARNING_SYSTEM_PROMPT = `
## PostgreSQL-Powered Learning System

You have access to a comprehensive learning system backed by PostgreSQL:

### Database Tables Available

1. **memories** - Long-term knowledge storage with pgvector embeddings
2. **task_outcomes** - Task execution results for pattern analysis
3. **task_patterns** - Success/failure patterns with success rates
4. **knowledge_links** - Knowledge graph connections
5. **learning_insights** - AI-generated improvement suggestions

### Your Learning Capabilities

1. **Extract Knowledge**: Identify patterns, solutions, insights from work
2. **Record Outcomes**: Track task success/failure with pgvector embeddings
3. **Find Similar Solutions**: Semantic search for past solutions
4. **Build Knowledge Graph**: Link related memories and patterns
5. **Auto-Analyze**: Get improvement suggestions based on failure patterns

### When to Learn

Automatically record and analyze when:

- ✅ **Task Completed**: What approach worked? How fast?
- ✅ **Task Failed**: What error occurred? What category?
- ✅ **Solution Found**: How did you fix it? Link to error pattern.
- ✅ **Pattern Discovered**: What works consistently?

### Database-Specific Tools

#### record_outcome
Record task result for pattern analysis.

\`\`\`typescript
record_outcome({
  taskId: string,
  status: 'COMPLETED' | 'FAILED',
  taskType?: 'typescript' | 'docker' | 'api' | ...,
  errorMessage?: string,
  solutionApplied?: string,
  solutionWorked?: boolean,
  executionTimeMs?: number
})
\`\`\`

#### suggest_improvements
Auto-suggest improvements based on failure patterns.

\`\`\`typescript
suggest_improvements({
  projectId?: string,
  limit?: 5
}) => Returns formatted suggestions with confidence scores
\`\`\`

#### find_similar_solutions
Semantic search for similar past solutions.

\`\`\`typescript
find_similar_solutions({
  problem: string,
  projectId?: string,
  limit?: 5
}) => Returns solutions with similarity scores
\`\`\`

#### create_pattern
Record a success or failure pattern.

\`\`\`typescript
create_pattern({
  patternType: 'success' | 'failure' | 'workaround',
  patternCategory: 'typescript' | 'docker' | 'api' | ...,
  patternContent: string,
  patternContext?: string,
  successRate?: 0.0-1.0
})
\`\`\`

#### memory_link
Create knowledge graph connections.

\`\`\`typescript
memory_link({
  fromId: string,     // Memory ID
  toId: string,       // Target ID (memory/pattern)
  relation: 'relates-to' | 'causes' | 'solves' | 'contradicts'
})
\`\`\`

#### get_connected_nodes
Explore knowledge graph connections.

\`\`\`typescript
get_connected_nodes({
  nodeType: 'memory' | 'pattern' | 'outcome',
  nodeId: string,
  relation?: string
})
\`\`\`

### Example Workflows

#### Learning from Failure

\`\`\`
User: "Build failed with TypeScript errors"

1. Analyze error -> categorize as 'typescript'
2. Fix the issue
3. Record outcome:
   record_outcome({
     taskId: task.id,
     status: 'COMPLETED',
     taskType: 'typescript',
     errorMessage: 'Type error in async function',
     solutionApplied: 'Added return type annotations',
     solutionWorked: true,
     executionTimeMs: 5000
   })
4. Create success pattern:
   create_pattern({
     patternType: 'success',
     patternCategory: 'typescript',
     patternContent: 'Always add return type annotations to async functions',
     successRate: 0.9
   })
5. Link solution to error category
\`\`\`

#### Applying Past Knowledge

\`\`\`
User: "Need to add new API endpoint"

1. Find similar solutions:
   find_similar_solutions({ problem: "Adding REST API endpoint" })
   
2. Get improvement suggestions:
   suggest_improvements({ limit: 3 })
   
3. Apply proven patterns to new task
4. Record outcome when complete
\`\`\`

### PostgreSQL Advantages

| Capability | How It's Used |
|------------|--------------|
| **pgvector** | Semantic similarity search across all memories |
| **Full-text Search** | Fast keyword matching with ts_rank |
| **Hybrid Search** | Combine vector + keyword for best results |
| **JSONB** | Flexible metadata storage |
| **Indexes** | Fast retrieval on any field |
| **CTEs** | Complex analytics queries |
| **Triggers** | Auto-update timestamps, patterns |
`;
```

## Tool Implementations

### 1. Learning Analysis Service

```typescript
// src/core/LearningAnalysis.ts
import { DatabaseClient } from '../db/DatabaseClient.js';
import { LearningAnalysisService } from './LearningAnalysis.js';

export async function analyzeAndLearn(
  db: DatabaseClient,
  taskId: string,
  status: 'COMPLETED' | 'FAILED',
  options?: RecordOutcomeInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  
  // Record the outcome (auto-categorizes errors)
  const outcomeId = await learningService.recordOutcome(
    taskId,
    status,
    options
  );
  
  // Auto-generate insights if we have failures
  if (status === 'FAILED') {
    await learningService.autoGenerateInsights();
  }
  
  return outcomeId;
}
```

### 2. Knowledge Graph Service

```typescript
// src/core/KnowledgeGraph.ts
import { DatabaseClient } from '../db/DatabaseClient.js';
import { KnowledgeGraphService } from './KnowledgeGraph.js';

export async function buildKnowledgeConnections(
  db: DatabaseClient,
  memoryId: string
): Promise<void> {
  const kgService = new KnowledgeGraphService(db);
  
  // Get suggested links
  const suggestions = await kgService.suggestLinks(memoryId);
  
  // Auto-build connections
  await kgService.autoBuildLinks();
  
  // Get subgraph for exploration
  const subgraph = await kgService.getSubgraph('memory', memoryId, 2);
  
  return subgraph;
}
```

### 3. AI Tool Wrappers

```typescript
// src/tools/learning_tools.ts
export async function suggest_improvements(
  db: DatabaseClient,
  input: SuggestImprovementsInput
): Promise<string> {
  const learningService = new LearningAnalysisService(db);
  const improvements = await learningService.suggestImprovements(
    input.projectId,
    input.limit ?? 5
  );
  
  return formatImprovements(improvements);
}
```

## Database Schema

### Task Outcomes Table

```sql
-- Automatically categorized error types
CREATE TABLE task_outcomes (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL,
    status VARCHAR(20),
    error_category VARCHAR(100),  -- typescript, docker, database, etc.
    error_message TEXT,
    solution_applied TEXT,
    solution_worked BOOLEAN,
    execution_time_ms INTEGER,
    embedding VECTOR(768),  -- For semantic search
    ...
);
```

### Task Patterns Table

```sql
CREATE TABLE task_patterns (
    id UUID PRIMARY KEY,
    pattern_type VARCHAR(50),  -- success, failure, workaround
    pattern_category VARCHAR(100),
    pattern_content TEXT,
    success_rate FLOAT,  -- 0.0 to 1.0
    occurrence_count INTEGER,
    embedding VECTOR(768),  -- Semantic search
    ...
);
```

### Knowledge Links Table

```sql
CREATE TABLE knowledge_links (
    from_type VARCHAR(20),  -- memory, pattern, outcome
    from_id UUID,
    to_type VARCHAR(20),
    to_id UUID,
    relation VARCHAR(50),  -- relates-to, solves, causes, contradicts
    confidence FLOAT,  -- 0.0 to 1.0
    ...
);
```

## Integration Examples

### In Heartbeat Service

```typescript
// After task execution
const outcome = await record_outcome(db, {
  taskId: task.id,
  status: result.success ? 'COMPLETED' : 'FAILED',
  taskType: detectTaskType(task.description),
  errorMessage: result.error,
  solutionApplied: result.solution,
  solutionWorked: result.success,
  executionTimeMs: result.durationMs
});

// Get suggestions for next tasks
const suggestions = await suggest_improvements(db, { limit: 3 });
console.log(suggestions);
```

### In Task Queue Processing

```typescript
// Before starting a new task
const similarTasks = await find_similar_solutions(db, {
  problem: newTask.description
});

// Apply learnings
if (similarTasks.length > 0) {
  console.log(`Found ${similarTasks.length} similar successful solutions`);
  applyPatterns(similarTasks);
}
```

## Advantage Summary

### PostgreSQL vs OpenClaw

| Feature | OpenClaw | Nezha (PostgreSQL) |
|---------|----------|-------------------|
| **Semantic Search** | File grep | pgvector cosine similarity |
| **Pattern Tracking** | Manual notes | Auto-categorized + success rate |
| **Knowledge Links** | Manual | Auto-built with confidence |
| **Query Performance** | O(n) file scan | O(log n) with indexes |
| **Scalability** | 100s of files | Millions of records |
| **Analytics** | Basic | Full SQL analytics |
| **Concurrency** | File locks | ACID transactions |
| **Reliability** | Data loss risk | WAL + replication |

## Future Extensions

### Planned Features

1. **ML Model Training**: Use extracted patterns to train recommendations
2. **Anomaly Detection**: Auto-detect unusual failure patterns
3. **Predictive Scheduling**: Suggest optimal task timing
4. **Cross-Project Learning**: Share patterns between projects
5. **Natural Language Queries**: "Show me patterns related to API errors"

---

**Version**: 2.0 (PostgreSQL-powered)  
**Date**: 2026-03-19
