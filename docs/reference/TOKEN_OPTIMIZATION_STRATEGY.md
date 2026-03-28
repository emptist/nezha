# Token Optimization Strategy

**创建时间**: 2026-03-16  
**状态**: 核心技术优势

---

## 🎯 核心优势

**基于数据库 = 选择性注入知识 = 减少 Token 消耗**

---

## 📊 Token 消耗对比

### 传统方式：全部知识放入 Prompt

```
┌─────────────────────────────────────────────────────────┐
│              传统方式：全部知识加载                       │
│                                                          │
│  System Prompt:                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Knowledge Base (ALL):                           │    │
│  │                                                   │    │
│  │ 1. OpenClaw continuous running pattern          │    │
│  │ 2. PostgreSQL SKIP LOCKED usage                 │    │
│  │ 3. Error handling in Node.js                    │    │
│  │ 4. React best practices                         │    │
│  │ 5. Python async patterns                        │    │
│  │ 6. Docker optimization                          │    │
│  │ 7. Kubernetes deployment                        │    │
│  │ 8. ... (1000+ knowledge items)                  │    │
│  │                                                   │    │
│  │ Total: ~100,000 tokens                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  问题:                                                   │
│  ❌ Token 消耗巨大                                       │
│  ❌ 成本高                                               │
│  ❌ 响应慢                                               │
│  ❌ 大部分知识不相关                                     │
└─────────────────────────────────────────────────────────┘
```

### 数据库方式：选择性注入知识

```
┌─────────────────────────────────────────────────────────┐
│              数据库方式：选择性加载                       │
│                                                          │
│  Step 1: 分析当前任务                                    │
│  Task: "Implement continuous running in Nezha"          │
│  Keywords: ['continuous', 'running', 'nodejs']          │
│                                                          │
│  Step 2: 查询相关知识                                    │
│  SELECT * FROM memories                                  │
│  WHERE tags @> ARRAY['continuous-running']              │
│  ORDER BY importance DESC                                │
│  LIMIT 5;                                                │
│                                                          │
│  Step 3: 只注入相关知识                                  │
│  System Prompt:                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Relevant Knowledge:                             │    │
│  │                                                   │    │
│  │ 1. OpenClaw continuous running pattern          │    │
│  │    - while(true) + waitForever()                │    │
│  │    - Auto-reconnect with exponential backoff    │    │
│  │                                                   │    │
│  │ Total: ~500 tokens                              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  优势:                                                   │
│  ✅ Token 消耗最小                                       │
│  ✅ 成本低                                               │
│  ✅ 响应快                                               │
│  ✅ 只加载相关知识                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Token 消耗计算

### 示例场景

假设知识库有 1000 条知识，每条平均 100 tokens：

| 方式 | Token 消耗 | 成本 (GPT-4) | 响应时间 |
|------|-----------|-------------|---------|
| **传统方式** | 100,000 tokens | ~$3.00 | 慢 |
| **数据库方式** | 500 tokens | ~$0.015 | 快 |
| **节省** | **99.5%** | **99.5%** | **快 10x** |

---

## 🛠️ 实现策略

### 1. 智能知识检索

```typescript
// src/learning/KnowledgeInjector.ts

export class KnowledgeInjector {
  async injectRelevantKnowledge(
    task: string,
    context: TaskContext
  ): Promise<string> {
    // 1. 提取关键词
    const keywords = await this.extractKeywords(task);
    
    // 2. 查询相关知识
    const relevantKnowledge = await this.queryRelevantKnowledge(
      keywords,
      context.projectId,
      { limit: 5, minImportance: 7 }
    );
    
    // 3. 构建 Prompt
    const knowledgePrompt = this.buildKnowledgePrompt(relevantKnowledge);
    
    return knowledgePrompt;
  }
  
  private async extractKeywords(task: string): Promise<string[]> {
    // 使用 AI 提取关键词
    // 或者使用简单的 NLP
    return ['continuous', 'running', 'nodejs'];
  }
  
  private async queryRelevantKnowledge(
    keywords: string[],
    projectId: string,
    options: QueryOptions
  ): Promise<Memory[]> {
    // 查询数据库
    const query = `
      SELECT * FROM memories 
      WHERE (project_id = $1 OR project_id IS NULL)
        AND (tags @> $2 OR content ILIKE ANY($3))
      ORDER BY importance DESC
      LIMIT $4
    `;
    
    const likePatterns = keywords.map(k => `%${k}%`);
    
    return await db.query(query, [
      projectId,
      keywords,
      likePatterns,
      options.limit
    ]);
  }
  
  private buildKnowledgePrompt(memories: Memory[]): string {
    if (memories.length === 0) {
      return '';
    }
    
    let prompt = '## Relevant Knowledge\n\n';
    
    for (const memory of memories) {
      prompt += `### ${memory.tags.join(', ')}\n`;
      prompt += `${memory.content}\n`;
      if (memory.context) {
        prompt += `Context: ${memory.context}\n`;
      }
      prompt += '\n';
    }
    
    return prompt;
  }
}
```

### 2. 分层知识注入

```typescript
// 根据任务复杂度决定注入多少知识

export class LayeredKnowledgeInjector {
  async inject(task: string, complexity: TaskComplexity): Promise<string> {
    switch (complexity) {
      case 'simple':
        // 简单任务：不注入知识
        return '';
        
      case 'medium':
        // 中等任务：注入 1-3 条相关知识
        return await this.injectKnowledge(task, { limit: 3 });
        
      case 'complex':
        // 复杂任务：注入 5-10 条相关知识
        return await this.injectKnowledge(task, { limit: 10 });
        
      case 'critical':
        // 关键任务：注入所有相关知识
        return await this.injectKnowledge(task, { limit: 20 });
    }
  }
}
```

### 3. 动态知识更新

```typescript
// 在任务执行过程中动态注入知识

export class DynamicKnowledgeInjector {
  async onTaskProgress(event: TaskEvent): Promise<void> {
    if (event.type === 'error') {
      // 遇到错误，注入错误处理知识
      const errorKnowledge = await this.queryKnowledge({
        tags: ['error-handling', event.errorType],
        limit: 3
      });
      
      await this.injectToAgent(errorKnowledge);
    }
    
    if (event.type === 'stuck') {
      // 任务卡住，注入相关解决方案
      const solutionKnowledge = await this.queryKnowledge({
        tags: ['solution', event.context],
        limit: 5
      });
      
      await this.injectToAgent(solutionKnowledge);
    }
  }
}
```

---

## 📊 实际应用示例

### 示例 1: 实现持续运行功能

```typescript
// 任务
const task = "Implement continuous running in Nezha's HeartbeatService";

// Step 1: 提取关键词
keywords: ['continuous', 'running', 'heartbeat', 'nodejs']

// Step 2: 查询知识
SELECT * FROM memories 
WHERE tags @> ARRAY['continuous-running', 'nodejs']
ORDER BY importance DESC
LIMIT 5;

// 结果:
[
  {
    content: "OpenClaw uses while(true) + waitForever()...",
    tags: ['pattern', 'continuous-running', 'nodejs'],
    importance: 9
  },
  {
    content: "Auto-reconnect with exponential backoff...",
    tags: ['pattern', 'reconnect', 'nodejs'],
    importance: 8
  }
]

// Step 3: 注入 Prompt
System Prompt:
## Relevant Knowledge

### pattern, continuous-running, nodejs
OpenClaw uses while(true) + waitForever() to achieve continuous operation.
The while loop ensures the service keeps running, and waitForever() keeps 
the event loop alive.

### pattern, reconnect, nodejs
Auto-reconnect with exponential backoff prevents rapid reconnection attempts.
Formula: delay = min(1000 * 2^attempts, 60000)

// Token 消耗: ~300 tokens (vs 100,000 tokens if all knowledge loaded)
```

### 示例 2: 修复数据库连接问题

```typescript
// 任务
const task = "Fix database connection timeout errors";

// Step 1: 提取关键词
keywords: ['database', 'connection', 'timeout', 'error']

// Step 2: 查询知识
SELECT * FROM memories 
WHERE tags @> ARRAY['database', 'error']
   OR content ILIKE '%timeout%'
ORDER BY importance DESC
LIMIT 5;

// 结果:
[
  {
    content: "PostgreSQL connection pooling best practices...",
    tags: ['postgresql', 'connection', 'best-practice'],
    importance: 9
  },
  {
    content: "Handling connection timeouts with retry logic...",
    tags: ['error-handling', 'timeout', 'database'],
    importance: 8
  }
]

// Token 消耗: ~250 tokens
```

---

## 🎯 优化策略

### 1. 关键词提取优化

```typescript
// 使用多种方式提取关键词

class KeywordExtractor {
  async extract(task: string): Promise<string[]> {
    // 1. 简单关键词匹配
    const simpleKeywords = this.matchKeywords(task);
    
    // 2. AI 提取（可选，成本更高）
    const aiKeywords = await this.aiExtract(task);
    
    // 3. 结合上下文
    const contextKeywords = this.getContextKeywords();
    
    // 合并去重
    return [...new Set([
      ...simpleKeywords,
      ...aiKeywords,
      ...contextKeywords
    ])];
  }
}
```

### 2. 知识重要性排序

```sql
-- 按重要性排序，优先注入高重要性知识
SELECT * FROM memories
WHERE tags @> ARRAY['pattern']
ORDER BY 
  importance DESC,           -- 重要性高的优先
  created_at DESC            -- 新知识优先
LIMIT 5;
```

### 3. 知识压缩

```typescript
// 压缩知识内容，减少 token

class KnowledgeCompressor {
  compress(memory: Memory): string {
    // 1. 提取核心内容
    const core = this.extractCore(memory.content);
    
    // 2. 移除冗余信息
    const compressed = this.removeRedundancy(core);
    
    // 3. 格式化
    return this.format(compressed);
  }
}
```

---

## 📊 成本对比

### 假设场景

- 知识库: 1000 条知识
- 每条知识: 平均 100 tokens
- 每天执行: 100 个任务
- 模型: GPT-4 ($0.03/1K tokens)

| 方式 | 每任务 Token | 每任务成本 | 每天成本 | 每月成本 |
|------|-------------|-----------|---------|---------|
| **传统方式** | 100,000 | $3.00 | $300 | $9,000 |
| **数据库方式** | 500 | $0.015 | $1.50 | $45 |
| **节省** | **99.5%** | **99.5%** | **99.5%** | **99.5%** |

---

## ✅ 核心优势总结

**基于数据库的选择性知识注入**:

1. ✅ **Token 消耗减少 99.5%**
2. ✅ **成本降低 99.5%**
3. ✅ **响应速度提升 10x**
4. ✅ **只注入相关知识**
5. ✅ **动态知识更新**
6. ✅ **分层知识注入**

---

**创建时间**: 2026-03-16  
**状态**: 核心技术优势  
**关键洞察**: 选择性注入知识，减少 Token 消耗
