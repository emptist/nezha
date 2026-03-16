# Integration Design

**创建时间**: 2026-03-16  
**状态**: 与现有系统集成方案

---

## 🎯 概述

学习系统如何与 Nezha 现有系统集成，不破坏现有功能。

---

## 📊 现有系统架构

```
┌─────────────────────────────────────────────────────────┐
│              Nezha Current Architecture                  │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Memory    │  │  Scheduler  │  │    Agent    │    │
│  │   System    │  │   System    │  │   System    │    │
│  │     ✅      │  │     ✅      │  │     ✅      │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│         │                │                │              │
│         └────────────────┼────────────────┘              │
│                          ↓                               │
│              ┌─────────────────────┐                     │
│              │     PostgreSQL      │                     │
│              │   (Permanent Store) │                     │
│              └─────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 集成方案

### 1. Memory System 扩展

**现状**: Memory System 已存在，用于任务历史存储

**集成方式**: 扩展现有 Memory System，添加学习相关功能

```typescript
// src/core/Memory.ts (扩展)

export class MemoryService {
  // 现有功能（保持不变）
  async save(input: SaveMemoryInput): Promise<string> { ... }
  async search(searchTerm: string, limit?: number): Promise<Memory[]> { ... }
  
  // 新增：学习系统功能
  async saveKnowledge(input: KnowledgeSaveInput): Promise<string> {
    // 存储到 memories 表
  }
  
  async searchKnowledge(input: KnowledgeSearchInput): Promise<Knowledge[]> {
    // 从 memories 表检索
  }
  
  async linkKnowledge(input: KnowledgeLinkInput): Promise<void> {
    // 建立知识关联
  }
}
```

**优点**:
- ✅ 不破坏现有功能
- ✅ 复用现有数据库连接
- ✅ 统一的 Memory 接口

---

### 2. Agent System 扩展

**现状**: Agent System 已存在，负责与 AI 交互

**集成方式**: 注册 Memory Skills，注入学习 Prompt

```typescript
// src/core/Agent.ts (扩展)

export class Agent {
  private readonly skills: Map<string, Skill>;
  
  constructor() {
    this.skills = new Map();
    
    // 注册现有 Skills（保持不变）
    this.registerExistingSkills();
    
    // 新增：注册 Memory Skills
    this.registerMemorySkills();
  }
  
  private registerMemorySkills(): void {
    this.skills.set('memory_save', {
      description: "Save learned knowledge to permanent memory",
      parameters: MemorySaveParamsSchema,
      execute: this.memoryService.saveKnowledge.bind(this.memoryService)
    });
    
    this.skills.set('memory_search', {
      description: "Search for relevant knowledge in memory",
      parameters: MemorySearchParamsSchema,
      execute: this.memoryService.searchKnowledge.bind(this.memoryService)
    });
    
    this.skills.set('memory_link', {
      description: "Connect related pieces of knowledge",
      parameters: MemoryLinkParamsSchema,
      execute: this.memoryService.linkKnowledge.bind(this.memoryService)
    });
  }
  
  async executeTask(message: string, context?: TaskContext): Promise<AgentResponse> {
    // 构建 System Prompt
    const systemPrompt = this.buildSystemPrompt(context);
    
    // 发送到 AI
    const response = await this.sendMessage(systemPrompt, message);
    
    return response;
  }
  
  private buildSystemPrompt(context?: TaskContext): string {
    let prompt = BASE_SYSTEM_PROMPT;
    
    // 新增：注入学习指令
    prompt += '\n\n' + LEARNING_SYSTEM_PROMPT;
    
    // 新增：注入相关知识
    if (context?.projectId) {
      const knowledge = await this.getRelevantKnowledge(context);
      if (knowledge.length > 0) {
        prompt += '\n\n## Relevant Knowledge\n\n';
        prompt += this.formatKnowledge(knowledge);
      }
    }
    
    return prompt;
  }
}
```

**优点**:
- ✅ 不修改现有 Agent 逻辑
- ✅ 只添加新的 Skills
- ✅ 动态注入学习指令

---

### 3. Scheduler System 扩展

**现状**: Scheduler System 已存在，负责任务调度

**集成方式**: 添加学习触发器

```typescript
// src/core/Scheduler.ts (扩展)

export class Scheduler {
  // 现有功能（保持不变）
  async start(): Promise<void> { ... }
  async stop(): Promise<void> { ... }
  
  // 新增：学习触发器
  private learningTrigger: LearningTrigger;
  
  constructor(db: DatabaseClient, intervalMs?: number) {
    // 现有初始化（保持不变）
    this.db = db;
    this.intervalMs = intervalMs ?? 5000;
    
    // 新增：初始化学习触发器
    this.learningTrigger = new LearningTrigger(db);
  }
  
  private async processTask(task: Task): Promise<void> {
    try {
      // 执行任务（现有逻辑）
      const result = await this.agent.executeTask(task.message, {
        projectId: task.project_id
      });
      
      // 新增：任务完成后触发学习
      await this.learningTrigger.onTaskCompleted(task, result);
      
      // 更新任务状态（现有逻辑）
      await this.updateTaskStatus(task.id, TASK_STATUS.COMPLETED, result);
      
    } catch (error) {
      // 新增：错误时触发学习
      await this.learningTrigger.onTaskError(task, error);
      
      // 现有错误处理
      await this.updateTaskStatus(task.id, TASK_STATUS.FAILED, error.message);
    }
  }
}
```

**优点**:
- ✅ 不修改现有调度逻辑
- ✅ 只添加事件触发
- ✅ 学习过程异步执行

---

### 4. HeartbeatService 扩展

**现状**: HeartbeatService 已存在，负责持续运行

**集成方式**: 无需修改，学习系统独立运行

```typescript
// src/services/HeartbeatService.ts (无需修改)

export class HeartbeatService {
  // 现有功能完全保持不变
  async start(): Promise<void> {
    await this.runContinuousLoop();
  }
  
  private async runContinuousLoop(): Promise<void> {
    while (!this.abortController?.signal.aborted) {
      await this.scheduler.start();
      await Promise.race([
        this.scheduler.waitUntilStopped(),
        this.waitForAbort(),
      ]);
      // ...
    }
  }
}
```

**优点**:
- ✅ 完全不修改 HeartbeatService
- ✅ 学习系统作为独立模块
- ✅ 不影响持续运行机制

---

## 📊 新增组件

### 1. LearningTrigger

**位置**: `src/learning/LearningTrigger.ts`

```typescript
export class LearningTrigger {
  constructor(private readonly db: DatabaseClient) {}
  
  async onTaskCompleted(task: Task, result: AgentResponse): Promise<void> {
    // 触发学习过程
    // 通过 Agent 的 System Prompt 实现
    // 这里只是记录事件
  }
  
  async onTaskError(task: Task, error: Error): Promise<void> {
    // 触发错误学习
  }
  
  async onProblemDiscovered(problem: Problem): Promise<void> {
    // 触发问题发现学习
  }
}
```

### 2. KnowledgeInjector

**位置**: `src/learning/KnowledgeInjector.ts`

```typescript
export class KnowledgeInjector {
  async injectRelevantKnowledge(
    task: string,
    projectId: string
  ): Promise<string> {
    // 1. 提取关键词
    const keywords = this.extractKeywords(task);
    
    // 2. 查询相关知识
    const knowledge = await this.searchKnowledge(keywords, projectId);
    
    // 3. 构建 Prompt
    return this.buildKnowledgePrompt(knowledge);
  }
  
  private extractKeywords(task: string): string[] {
    // 简单的关键词提取
    // 或使用 AI 提取
  }
  
  private async searchKnowledge(
    keywords: string[],
    projectId: string
  ): Promise<Memory[]> {
    // 查询数据库
  }
  
  private buildKnowledgePrompt(memories: Memory[]): string {
    // 格式化为 Prompt
  }
}
```

---

## 📊 数据库集成

### 1. 迁移脚本

**位置**: `src/db/migrations/003_learning_system.sql`

```sql
-- 创建 memories 表（不影响现有表）
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    context TEXT,
    source TEXT,
    importance INTEGER DEFAULT 5,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建 memory_links 表
CREATE TABLE memory_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, relationship)
);

-- 创建索引
CREATE INDEX idx_memories_project ON memories(project_id);
CREATE INDEX idx_memories_tags ON memories USING GIN(tags);
CREATE INDEX idx_memories_importance ON memories(importance DESC);
```

**优点**:
- ✅ 只添加新表，不修改现有表
- ✅ 独立的迁移脚本
- ✅ 可以回滚

---

## 📊 配置集成

### 1. 环境变量

```bash
# .env (新增配置)

# Learning System
LEARNING_ENABLED=true
LEARNING_MIN_IMPORTANCE=5
LEARNING_MAX_KNOWLEDGE_INJECTION=5
```

### 2. 配置文件

```typescript
// src/config/index.ts (扩展)

export interface Config {
  // 现有配置（保持不变）
  database: DatabaseConfig;
  scheduler: SchedulerConfig;
  
  // 新增：学习系统配置
  learning: {
    enabled: boolean;
    minImportance: number;
    maxKnowledgeInjection: number;
  };
}
```

---

## 📊 测试集成

### 1. 单元测试

```typescript
// src/__tests__/learning/MemorySkills.test.ts

describe('Memory Skills', () => {
  test('memory_save should store knowledge', async () => {
    const result = await memory_save({
      content: "Test knowledge",
      tags: ["test"],
      importance: 5
    });
    
    expect(result.success).toBe(true);
    expect(result.memory_id).toBeDefined();
  });
  
  test('memory_search should find knowledge', async () => {
    // 先存储
    await memory_save({
      content: "Test knowledge for search",
      tags: ["test", "search"],
      importance: 7
    });
    
    // 再搜索
    const result = await memory_search({
      query: "search",
      tags: ["test"]
    });
    
    expect(result.memories.length).toBeGreaterThan(0);
  });
});
```

### 2. 集成测试

```typescript
// src/__tests__/integration/LearningSystem.test.ts

describe('Learning System Integration', () => {
  test('Agent should learn from task completion', async () => {
    const agent = new Agent();
    
    // 执行任务
    const result = await agent.executeTask("Test task");
    
    // 验证学习
    const knowledge = await memory_search({
      query: "test task",
      limit: 1
    });
    
    expect(knowledge.memories.length).toBeGreaterThan(0);
  });
});
```

---

## 📊 部署集成

### 1. 部署步骤

```bash
# 1. 运行数据库迁移
npm run db:migrate

# 2. 重启服务
pm2 restart nezha-daemon

# 3. 验证学习系统
npm run test:learning
```

### 2. 回滚方案

```bash
# 如果出现问题，回滚迁移
npm run db:rollback

# 重启服务
pm2 restart nezha-daemon
```

---

## ✅ 集成原则

1. **不破坏现有功能** - 所有现有代码保持不变
2. **增量添加** - 只添加新组件和新功能
3. **可回滚** - 随时可以禁用学习系统
4. **独立测试** - 学习系统可以独立测试
5. **渐进式集成** - 分阶段集成，降低风险

---

**创建时间**: 2026-03-16  
**状态**: 完整集成方案  
**下一步**: 测试策略设计
