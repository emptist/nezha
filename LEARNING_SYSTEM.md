# Learning System Design

> AI-driven learning system for Nezha - 让 AI 自主学习、存储和应用知识

## 核心理念

### 传统思路 vs AI 驱动思路

| 方面 | 传统程序实现 | AI 驱动实现 |
|------|-------------|------------|
| **实现方式** | 编写 NLP 规则 | 编写 Prompt 指令 |
| **知识提取** | 程序匹配模式 | AI 理解上下文 |
| **判断标准** | 固定规则 | AI 自主判断 |
| **灵活性** | 低（需要更新代码） | 高（只需调整 prompt） |
| **智能程度** | 机械执行 | 自主决策 |
| **维护成本** | 高 | 低 |

### 设计哲学

**不通过程序实现学习，而是通过 Prompt 让 AI 自己学习**

就像 OpenClaw 的心跳机制：
- 不是程序解析 HEARTBEAT.md
- 而是将文件内容作为 prompt 发送给 AI
- 让 AI 自己决定要做什么

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    AI Agent (LLM)                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  System Prompt 包含学习指令                       │   │
│  │  - 何时学习                                        │   │
│  │  - 如何提取知识                                    │   │
│  │  - 如何存储知识                                    │   │
│  │  - 如何应用知识                                    │   │
│  └──────────────────────────────────────────────────┘   │
└────────────┬────────────────────────────────────────────┘
             │
             │ 调用工具
             ↓
┌────────────────────────────────────────────────────────┐
│              Memory Tools (工具层)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ memory_save  │  │memory_search │  │ memory_link │  │
│  │ 存储知识     │  │ 检索知识     │  │ 关联知识    │  │
│  └──────────────┘  └──────────────┘  └─────────────┘  │
└────────────┬───────────────────────────────────────────┘
             │
             │ 读写数据
             ↓
┌────────────────────────────────────────────────────────┐
│           PostgreSQL (存储层)                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  memories 表                                      │  │
│  │  - id, content, tags, context                    │  │
│  │  - source, importance, created_at                │  │
│  │  - embedding (vector, 可选)                      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## System Prompt 设计

### 学习指令模板

```typescript
const LEARNING_SYSTEM_PROMPT = `
## Learning and Knowledge Management

You have access to a permanent memory system powered by PostgreSQL. This allows you to learn from experiences and improve over time.

### Your Learning Capabilities

1. **Extract Knowledge**: Identify important patterns, solutions, and insights from your work
2. **Store Knowledge**: Save valuable information to memory for future reference
3. **Retrieve Knowledge**: Search and find relevant past knowledge when needed
4. **Apply Knowledge**: Use retrieved knowledge to improve your responses and decisions
5. **Link Knowledge**: Connect related pieces of knowledge for better understanding

### When to Learn

Automatically extract and store knowledge when:

- ✅ **After solving a complex problem**: What was the solution? Why did it work?
- ✅ **After discovering a pattern**: What pattern? When does it apply?
- ✅ **After fixing a bug/error**: What caused it? How to prevent it?
- ✅ **After user feedback**: What did you learn? How to improve?
- ✅ **After completing a significant task**: What worked well? What didn't?
- ✅ **When finding a best practice**: What is it? When to use it?

### How to Learn

Follow this process when you encounter valuable information:

1. **Reflect**: What did I learn? Why is this important?
2. **Extract**: What's the core insight or pattern?
3. **Contextualize**: When/where is this knowledge useful?
4. **Store**: Save to memory with appropriate tags
5. **Link**: Connect to related knowledge if applicable

### Knowledge Storage Format

When saving knowledge, include:

\`\`\`
Content: [The actual knowledge/insight]
Context: [When/why this is useful]
Tags: [Categories for easy retrieval]
Source: [Where this came from: task, error, conversation, etc.]
Importance: [1-5, how valuable is this?]
\`\`\`

### Example Learning Scenarios

#### Example 1: Learning from a Bug Fix

**Situation**: Build failed due to TypeScript strict mode

**Learning Process**:
1. Reflect: "TypeScript strict mode caught errors we missed"
2. Extract: "Always check strict mode settings when upgrading TypeScript"
3. Contextualize: "Useful when upgrading TS or adding new strict checks"
4. Store: 
   \`\`\`
   memory_save(
     content: "TypeScript strict mode can reveal hidden type errors during upgrades",
     tags: ["typescript", "debugging", "build"],
     context: "When upgrading TypeScript or enabling strict mode",
     source: "bug-fix",
     importance: 4
   )
   \`\`\`

#### Example 2: Learning from Success

**Situation**: Refactored code reduced complexity by 50%

**Learning Process**:
1. Reflect: "Breaking into smaller functions made code more maintainable"
2. Extract: "Small, focused functions are easier to test and maintain"
3. Contextualize: "When code feels complex or hard to test"
4. Store:
   \`\`\`
   memory_save(
     content: "Breaking complex functions into smaller ones improves maintainability",
     tags: ["refactoring", "best-practices", "clean-code"],
     context: "When functions exceed 20 lines or have multiple responsibilities",
     source: "task",
     importance: 3
   )
   \`\`\`

#### Example 3: Applying Past Knowledge

**Situation**: New task involves API integration

**Retrieval Process**:
\`\`\`
memory_search(
  query: "API integration best practices",
  limit: 5
)
\`\`\`

**Application**: Use retrieved knowledge to:
- Follow established patterns
- Avoid known pitfalls
- Apply proven solutions

### Memory Tools Reference

#### memory_save
Save knowledge to permanent memory.

\`\`\`typescript
memory_save({
  content: string,      // The knowledge to save
  tags?: string[],      // Categories: ["typescript", "debugging"]
  context?: string,     // When/why this is useful
  source?: string,      // "task" | "error" | "conversation" | "heartbeat"
  importance?: number   // 1-5, default: 1
}) => Promise<string>   // Returns memory ID
\`\`\`

#### memory_search
Search for relevant knowledge.

\`\`\`typescript
memory_search({
  query: string,        // What to search for
  limit?: number,       // Max results, default: 10
  tags?: string[]       // Filter by tags
}) => Promise<Memory[]>
\`\`\`

#### memory_link
Connect related knowledge entries.

\`\`\`typescript
memory_link({
  fromId: string,       // Source memory ID
  toId: string,         // Related memory ID
  relation: string      // "relates-to" | "causes" | "solves" | "contradicts"
}) => Promise<void>
\`\`\`

#### memory_get
Retrieve a specific memory by ID.

\`\`\`typescript
memory_get({
  id: string            // Memory ID
}) => Promise<Memory | null>
\`\`\`

### Best Practices

1. **Be Selective**: Don't save everything. Focus on genuinely useful insights.
2. **Add Context**: Explain when/why knowledge is valuable.
3. **Use Tags**: Make knowledge easy to find later.
4. **Link Related**: Connect related knowledge for better understanding.
5. **Review Importance**: Higher importance = higher priority in retrieval.

### Integration with Heartbeat

During heartbeat cycles, you can:

1. **Reflect on Recent Work**: What did I learn from recent tasks?
2. **Consolidate Knowledge**: Organize and link related memories.
3. **Clean Up**: Remove outdated or redundant knowledge.
4. **Prepare**: Search for relevant knowledge before starting new tasks.

Example heartbeat prompt:
\`\`\`
Heartbeat Check - ${new Date().toISOString()}

Recent Activity:
- Completed 3 tasks
- Fixed 2 bugs
- Had 5 conversations

Learning Opportunity:
Reflect on your recent work. What patterns did you notice? 
What would you do differently? Save valuable insights to memory.
\`\`\`
`;
```

## 工具实现

### 1. Memory Save Tool

```typescript
// src/tools/memory_save.ts
import { MemoryService } from '../core/Memory.js';
import { type DatabaseClient } from '../db/DatabaseClient.js';

export interface MemorySaveInput {
  content: string;
  tags?: string[];
  context?: string;
  source?: 'task' | 'error' | 'conversation' | 'heartbeat';
  importance?: number;
}

export async function memory_save(
  db: DatabaseClient,
  input: MemorySaveInput
): Promise<string> {
  const memory = new MemoryService(db);
  
  const id = await memory.save({
    id: crypto.randomUUID(),
    content: input.content,
    metadata: {
      tags: input.tags || [],
      context: input.context,
      source: input.source || 'task',
      importance: input.importance || 1,
    },
  });
  
  console.log(`[Learning] Saved knowledge: ${input.content.substring(0, 50)}...`);
  return id;
}
```

### 2. Memory Search Tool

```typescript
// src/tools/memory_search.ts
import { MemoryService } from '../core/Memory.js';
import { type DatabaseClient } from '../db/DatabaseClient.js';

export interface MemorySearchInput {
  query: string;
  limit?: number;
  tags?: string[];
}

export async function memory_search(
  db: DatabaseClient,
  input: MemorySearchInput
): Promise<Memory[]> {
  const memory = new MemoryService(db);
  
  const results = await memory.search(
    input.query,
    input.limit || 10
  );
  
  // Filter by tags if provided
  if (input.tags && input.tags.length > 0) {
    return results.filter(m => {
      const memTags = m.metadata?.tags || [];
      return input.tags!.some(tag => memTags.includes(tag));
    });
  }
  
  return results;
}
```

### 3. Memory Link Tool

```typescript
// src/tools/memory_link.ts
import { type DatabaseClient } from '../db/DatabaseClient.js';

export interface MemoryLinkInput {
  fromId: string;
  toId: string;
  relation: 'relates-to' | 'causes' | 'solves' | 'contradicts';
}

export async function memory_link(
  db: DatabaseClient,
  input: MemoryLinkInput
): Promise<void> {
  // Create a knowledge_links table for this
  await db.query(
    `INSERT INTO knowledge_links (from_id, to_id, relation, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [input.fromId, input.toId, input.relation]
  );
  
  console.log(`[Learning] Linked ${input.fromId} -> ${input.toId} (${input.relation})`);
}
```

## 数据库 Schema

### 更新 memories 表

```sql
-- src/db/migrations/002_learning_system.sql

-- Add columns for learning system
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'task';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance INTEGER DEFAULT 1 CHECK (importance >= 1 AND importance <= 5);

-- Create knowledge_links table
CREATE TABLE IF NOT EXISTS knowledge_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    to_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relation TEXT NOT NULL CHECK (relation IN ('relates-to', 'causes', 'solves', 'contradicts')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_id, to_id, relation)
);

-- Create indexes for better search
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_from ON knowledge_links(from_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_to ON knowledge_links(to_id);
```

## 集成到 Agent

### 在 HeartbeatService 中使用

```typescript
// src/services/HeartbeatService.ts
import { memory_save, memory_search } from '../tools/index.js';

export class HeartbeatService {
  async executeTask(taskId: string, title: string, description?: string): Promise<void> {
    // Add learning prompt to task
    const learningPrompt = `
${description || title}

---
After completing this task:
1. Reflect on what you learned
2. If you discovered something valuable, use memory_save to store it
3. Consider how this knowledge could help in future tasks
`;
    
    const result = await this.agent.executeTask(learningPrompt);
    
    // AI will autonomously decide whether to save knowledge
    // based on the learning instructions in its system prompt
  }
}
```

### 在 Agent System Prompt 中包含

```typescript
// src/core/Agent.ts
export class Agent {
  private buildSystemPrompt(): string {
    return `
${LEARNING_SYSTEM_PROMPT}

## Your Role

You are Nezha, an autonomous development assistant with permanent memory. 
You can learn from your experiences and improve over time.

Always strive to learn and grow from every interaction.
`;
  }
}
```

## 使用示例

### 场景 1: 从错误中学习

```
User: "The build is failing with TypeScript errors"

AI thinks:
1. Analyze the error
2. Fix the issue
3. Reflect: "This was caused by missing type annotations in async functions"
4. Store knowledge:
   memory_save({
     content: "Always add return type annotations to async functions",
     tags: ["typescript", "error-prevention"],
     context: "When writing async functions to avoid type inference issues",
     source: "error",
     importance: 4
   })
```

### 场景 2: 应用已学知识

```
User: "Add a new API endpoint"

AI thinks:
1. Search for relevant knowledge:
   memory_search({ query: "API endpoint best practices" })
2. Find past learnings about error handling, validation, etc.
3. Apply those patterns to the new endpoint
4. After completion, save any new insights
```

### 场景 3: 心跳时的知识整理

```
Heartbeat triggers:
1. AI reflects on recent work
2. Consolidates related knowledge:
   memory_link({
     fromId: "learning-1",
     toId: "learning-2",
     relation: "relates-to"
   })
3. Updates importance based on usage frequency
```

## 优势总结

### 对比传统方法

| 方面 | 传统方法 | AI 驱动方法 |
|------|---------|------------|
| **开发成本** | 高（需要 NLP 专家） | 低（只需 prompt） |
| **准确性** | 中（依赖规则质量） | 高（AI 理解语义） |
| **适应性** | 低（固定规则） | 高（AI 自适应） |
| **维护成本** | 高（更新规则） | 低（调整 prompt） |
| **扩展性** | 难（需要新规则） | 易（AI 泛化能力） |

### 核心优势

1. **智能理解**: AI 理解上下文，不是机械匹配
2. **自主判断**: AI 自己决定什么值得学习
3. **灵活应用**: AI 可以创造性地应用知识
4. **持续进化**: 随着知识积累，AI 越来越聪明
5. **简单实现**: 不需要复杂的 NLP 代码

## 未来扩展

### 1. 向量搜索（pgvector）

```sql
-- Enable semantic search
CREATE EXTENSION vector;

-- Add embedding column
ALTER TABLE memories ADD COLUMN embedding vector(1536);

-- Create vector index
CREATE INDEX memories_embedding_idx ON memories 
USING ivfflat (embedding vector_cosine_ops);
```

**用途**: 语义搜索，找到相似但不完全相同的知识

### 2. 知识图谱

```sql
-- Track knowledge relationships
CREATE TABLE knowledge_graph (
    id UUID PRIMARY KEY,
    subject TEXT,
    predicate TEXT,
    object TEXT,
    confidence FLOAT
);
```

**用途**: 构建知识网络，发现隐藏关联

### 3. 学习分析

```typescript
// Track learning metrics
interface LearningMetrics {
  totalKnowledge: number;
  avgImportance: number;
  topTags: string[];
  knowledgeGrowth: number; // per day/week
  retrievalRate: number; // how often knowledge is used
}
```

**用途**: 了解学习效果，优化学习策略

## 参考资料

- [OpenClaw Heartbeat Mechanism](https://github.com/openclaw/openclaw) - 心跳机制参考
- [OpenClaw Memory System](../openclaw/src/memory/) - 记忆系统实现
- [Prompt Engineering Guide](https://www.promptingguide.ai/) - Prompt 设计最佳实践

---

**设计者**: GLM-5  
**日期**: 2026-03-16  
**版本**: 1.0
