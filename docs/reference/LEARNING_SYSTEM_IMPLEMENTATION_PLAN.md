# Learning System Implementation Plan

**创建时间**: 2026-03-16  
**状态**: 基于真实案例的设计方案

---

## 🎯 真实案例回顾

### 我刚才做了什么

```
用户提问: "为什么 Nezha 不能像 OpenClaw 一样持续工作？"
    ↓
1. 观察: 阅读 OpenClaw 源码
   - monitor.ts: while (true) 循环
   - wait.ts: waitForever() 函数
   - heartbeat-runner.ts: 自动重连机制
    ↓
2. 学习: 理解核心模式
   - while (true) 保证持续运行
   - waitForever() 保持事件循环活跃
   - 自动重连保证稳定性
    ↓
3. 借鉴: 应用到 Nezha
   - 创建 wait.ts
   - 修改 HeartbeatService
   - 增强 Scheduler
    ↓
4. 记录: 创建文档
   - OPENCLAW_CORE_TECHNOLOGY.md
   - 更新 README.md
```

### 关键洞察

这个过程可以抽象为：

```
触发条件 (用户提问/任务完成)
    ↓
观察阶段 (阅读代码/分析问题)
    ↓
学习阶段 (提取模式/理解原理)
    ↓
应用阶段 (借鉴实现/解决问题)
    ↓
记录阶段 (存储知识/创建文档)
```

---

## 📊 系统设计

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Learning System                       │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Trigger System (触发器)                │    │
│  │                                                   │    │
│  │  • Task completed                                 │    │
│  │  • Problem solved                                 │    │
│  │  • Pattern discovered                             │    │
│  │  • User feedback received                         │    │
│  │  • Error fixed                                    │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│                          ↓                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Learning Prompt (学习指令)               │    │
│  │                                                   │    │
│  │  "After completing a task:                       │    │
│  │   1. Reflect on what you learned                 │    │
│  │   2. Extract core patterns                       │    │
│  │   3. Use memory_save to store                    │    │
│  │   4. Use memory_link to connect                  │    │
│  │   ..."                                           │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│                          ↓                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Learning Skills (学习工具)             │    │
│  │                                                   │    │
│  │  • memory_save - 存储知识                        │    │
│  │  • memory_search - 检索知识                      │    │
│  │  • memory_link - 关联知识                        │    │
│  │  • memory_reflect - 反思学习                     │    │
│  │  • memory_apply - 应用知识                       │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│                          ↓                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │          Memory Storage (知识存储)               │    │
│  │                                                   │    │
│  │  PostgreSQL memories 表                          │    │
│  │  - id: UUID                                      │    │
│  │  - content: TEXT (学到的知识)                    │    │
│  │  - tags: TEXT[] (标签)                           │    │
│  │  - context: TEXT (上下文)                        │    │
│  │  - source: TEXT (来源)                           │    │
│  │  - importance: INTEGER (重要性 1-10)             │    │
│  │  - created_at: TIMESTAMPTZ                       │    │
│  │  - embedding: vector (可选，向量搜索)            │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ 实现计划

### Phase 1: Memory Skills (基础工具)

**目标**: 实现 Memory 的 CRUD 操作

**文件**: `src/skills/memory.ts`

```typescript
export const memorySkills = {
  memory_save: {
    description: "Save learned knowledge to permanent memory",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The knowledge or pattern learned"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for categorization"
        },
        context: {
          type: "string",
          description: "When/where this knowledge is useful"
        },
        source: {
          type: "string",
          description: "Where this knowledge came from"
        },
        importance: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Importance score"
        }
      },
      required: ["content"]
    },
    execute: async (params: SaveMemoryParams) => {
      // Implementation
    }
  },
  
  memory_search: {
    description: "Search for relevant knowledge in memory",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags"
        },
        limit: {
          type: "integer",
          default: 10
        }
      },
      required: ["query"]
    },
    execute: async (params: SearchMemoryParams) => {
      // Implementation
    }
  },
  
  memory_link: {
    description: "Connect related pieces of knowledge",
    parameters: {
      type: "object",
      properties: {
        source_id: {
          type: "string",
          description: "Source memory ID"
        },
        target_id: {
          type: "string",
          description: "Target memory ID"
        },
        relationship: {
          type: "string",
          description: "How they are related"
        }
      },
      required: ["source_id", "target_id", "relationship"]
    },
    execute: async (params: LinkMemoryParams) => {
      // Implementation
    }
  }
};
```

### Phase 2: Learning Prompt (学习指令)

**目标**: 创建指导 AI 学习的 System Prompt

**文件**: `src/prompts/learning.ts`

```typescript
export const LEARNING_SYSTEM_PROMPT = `
## Learning and Knowledge Management

You have access to a permanent memory system powered by PostgreSQL. This allows you to learn from experiences and improve over time.

### Your Learning Capabilities

1. **Extract Knowledge**: Identify important patterns, solutions, and insights
2. **Store Knowledge**: Save valuable information to memory
3. **Retrieve Knowledge**: Search and find relevant past knowledge
4. **Apply Knowledge**: Use retrieved knowledge to improve your work
5. **Link Knowledge**: Connect related pieces of knowledge

### When to Learn

Automatically extract and store knowledge when:

- ✅ After solving a complex problem
- ✅ After discovering a pattern
- ✅ After fixing a bug/error
- ✅ After user feedback
- ✅ After completing a significant task
- ✅ When finding a best practice

### How to Learn

Follow this process when you encounter valuable information:

1. **Reflect**: What did you learn? Why is it important?
2. **Extract**: What's the core insight or pattern?
3. **Contextualize**: When/where is this knowledge useful?
4. **Store**: Use memory_save to save the knowledge
5. **Link**: Use memory_link to connect related knowledge

### Example Learning Session

After reading OpenClaw's monitor.ts, I learned:

\`\`\`javascript
memory_save({
  content: "OpenClaw uses while(true) + waitForever() to achieve continuous operation. The while loop ensures the service keeps running, and waitForever() keeps the event loop alive.",
  tags: ["pattern", "architecture", "continuous-running", "nodejs"],
  context: "Useful when building services that need to run 24/7 without exiting. Can be applied to any long-running daemon process.",
  source: "OpenClaw monitor.ts analysis",
  importance: 9
})
\`\`\`

Then when implementing Nezha's HeartbeatService:

\`\`\`javascript
// First, search for relevant knowledge
memory_search({
  query: "continuous running service pattern",
  tags: ["pattern", "architecture"]
})

// Found the knowledge from OpenClaw
// Apply it to Nezha's HeartbeatService

// After implementation, link the knowledge
memory_link({
  source_id: "memory-from-openclaw",
  target_id: "memory-from-nezha-implementation",
  relationship: "applied-to"
})
\`\`\`

### Knowledge Tags

Use these tags to categorize knowledge:

- **pattern**: Design patterns, architectural patterns
- **architecture**: System architecture decisions
- **best-practice**: Best practices and conventions
- **bug-fix**: Solutions to bugs and errors
- **optimization**: Performance optimizations
- **security**: Security-related knowledge
- **testing**: Testing strategies and techniques
- **tool**: Tools and libraries usage

### Importance Scoring

Rate importance from 1-10:

- **9-10**: Critical knowledge, fundamental patterns
- **7-8**: Important knowledge, frequently useful
- **5-6**: Useful knowledge, occasionally helpful
- **3-4**: Minor knowledge, specific cases
- **1-2**: Trivial knowledge, rarely needed
`;
```

### Phase 3: Trigger System (触发器)

**目标**: 自动触发学习过程

**文件**: `src/core/LearningTrigger.ts`

```typescript
export class LearningTrigger {
  private readonly eventBus: EventBus;
  
  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.setupTriggers();
  }
  
  private setupTriggers(): void {
    // Trigger 1: Task completed
    this.eventBus.subscribe(SCHEDULER_EVENTS.TASK_COMPLETED, async (event) => {
      // AI should reflect on what was learned
      // This is handled by the Agent's system prompt
    });
    
    // Trigger 2: Problem solved
    this.eventBus.subscribe('problem:solved', async (event) => {
      // AI should extract the solution pattern
    });
    
    // Trigger 3: Error fixed
    this.eventBus.subscribe('error:fixed', async (event) => {
      // AI should record the fix for future reference
    });
  }
}
```

### Phase 4: Integration (集成)

**目标**: 将学习系统集成到 Nezha

**修改文件**: `src/core/Agent.ts`

```typescript
export class Agent {
  private readonly skills: Map<string, Skill>;
  
  constructor() {
    // Register memory skills
    this.skills = new Map(Object.entries(memorySkills));
  }
  
  async executeTask(message: string): Promise<AgentResponse> {
    // Include learning prompt in system message
    const systemMessage = LEARNING_SYSTEM_PROMPT;
    
    // Send to AI with access to skills
    const response = await this.sendMessage(systemMessage, message, {
      skills: Array.from(this.skills.values())
    });
    
    return response;
  }
}
```

---

## 📊 用我的案例推演

### 步骤 1: 触发

```
Event: User asks "Why can't Nezha run continuously like OpenClaw?"
Trigger: Problem identified
```

### 步骤 2: AI 执行（通过 Prompt 指导）

```
AI receives:
- System Prompt: LEARNING_SYSTEM_PROMPT
- User Message: "Why can't Nezha run continuously?"
- Available Skills: memory_save, memory_search, memory_link

AI thinks:
"I need to understand how OpenClaw achieves continuous running.
Let me read the code and learn from it."
```

### 步骤 3: 学习过程

```
AI reads OpenClaw code:
- monitor.ts: while (true) loop
- wait.ts: waitForever() function

AI reflects:
"This is a key pattern! OpenClaw uses while(true) + waitForever()
to keep the service running indefinitely."

AI calls memory_save:
memory_save({
  content: "OpenClaw uses while(true) + waitForever() to achieve continuous operation",
  tags: ["pattern", "architecture", "continuous-running"],
  context: "Useful for 24/7 services",
  source: "OpenClaw monitor.ts",
  importance: 9
})
```

### 步骤 4: 应用知识

```
AI searches memory:
memory_search({
  query: "continuous running service",
  tags: ["pattern"]
})

AI finds the knowledge and applies it:
- Creates wait.ts
- Modifies HeartbeatService
- Enhances Scheduler
```

### 步骤 5: 记录应用

```
AI links knowledge:
memory_link({
  source_id: "openclaw-pattern-memory",
  target_id: "nezha-implementation-memory",
  relationship: "applied-to"
})

AI saves new knowledge:
memory_save({
  content: "Applied OpenClaw's continuous running pattern to Nezha's HeartbeatService",
  tags: ["implementation", "nezha", "continuous-running"],
  context: "Nezha now supports 24/7 autonomous operation",
  source: "Nezha HeartbeatService implementation",
  importance: 8
})
```

---

## 🚀 实施步骤

### Week 1: Memory Skills

1. 创建 `src/skills/memory.ts`
2. 实现 `memory_save`
3. 实现 `memory_search`
4. 实现 `memory_link`
5. 编写单元测试

### Week 2: Learning Prompt

1. 创建 `src/prompts/learning.ts`
2. 设计学习指令模板
3. 添加示例和最佳实践
4. 测试 Prompt 效果

### Week 3: Trigger System

1. 创建 `src/core/LearningTrigger.ts`
2. 实现事件订阅
3. 集成到 Scheduler
4. 测试自动触发

### Week 4: Integration

1. 修改 Agent.ts
2. 注册 Skills
3. 集成 Learning Prompt
4. 端到端测试

---

## ✅ 验证标准

学习系统成功的标志：

1. **自动学习**: AI 能自动提取知识并存储
2. **知识检索**: AI 能搜索并找到相关知识
3. **知识应用**: AI 能应用已学知识解决新问题
4. **知识关联**: AI 能建立知识之间的联系
5. **持续改进**: AI 的表现随时间提升

---

**创建时间**: 2026-03-16  
**状态**: 基于真实案例的设计方案  
**下一步**: 开始实施 Phase 1 - Memory Skills
