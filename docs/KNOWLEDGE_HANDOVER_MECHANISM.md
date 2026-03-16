# Knowledge Handover Mechanism

**创建时间**: 2026-03-16  
**状态**: 跨 Session 记忆与知识管理

---

## 🎯 核心问题

如何实现：
1. **跨 Session 记忆** - AI 在不同会话间保持记忆
2. **知识交接班** - 使用 MD 文档作为交接班机制
3. **去知识泡沫** - 避免知识膨胀，只保留重要知识
4. **动态知识注入** - 通过 SQL 查询当前最重要的知识点

---

## 📊 设计方案

### 1. KNOWLEDGE.md 文档机制

**类似 OpenClaw 的 HEARTBEAT.md，但用于知识交接**

```markdown
# Knowledge Handover

**最后更新**: 2026-03-16 15:30:00
**Session ID**: session-abc123
**项目**: nezha

---

## 🎯 当前最重要的知识点

<!-- SQL: 动态查询，不手动维护 -->
<!-- SELECT content, tags, importance FROM memories 
     WHERE (project_id = 'current-project' OR project_id IS NULL)
     AND importance >= 8
     ORDER BY importance DESC, created_at DESC
     LIMIT 10; -->

### 1. 持续运行机制 (重要性: 9/10)
OpenClaw 使用 while(true) + waitForever() 实现持续运行。
- **标签**: pattern, continuous-running, nodejs
- **上下文**: 适用于需要 24/7 运行的服务
- **应用**: 已应用到 Nezha 的 HeartbeatService

### 2. PostgreSQL SKIP LOCKED (重要性: 9/10)
使用 SKIP LOCKED 实现安全的并发任务处理。
- **标签**: pattern, postgresql, concurrency
- **上下文**: 适用于任务队列场景
- **应用**: Nezha 的 Scheduler 系统

### 3. 统一知识库设计 (重要性: 8/10)
PostgreSQL 打通所有项目，实现跨项目知识共享。
- **标签**: architecture, knowledge-base
- **上下文**: 为学习创造条件
- **应用**: 学习系统设计

---

## 📊 当前任务状态

### 进行中
- [ ] 实现学习系统 Phase 1: Memory Skills
- [ ] 创建数据库迁移脚本

### 待处理
- [ ] 设计 Problem Discovery System
- [ ] 实现 Learning Trigger

### 已完成
- [x] 学习系统设计文档
- [x] 持续运行机制实现

---

## 🔍 最近学习记录

<!-- SQL: 查询最近 24 小时学习 -->
<!-- SELECT content, created_at FROM memories 
     WHERE created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 5; -->

1. **2026-03-16 15:00**: 学习了 OpenClaw 的持续运行机制
2. **2026-03-16 14:30**: 发现了 PostgreSQL SKIP LOCKED 的并发优势
3. **2026-03-16 14:00**: 理解了统一知识库的设计理念

---

## 💡 待解决问题

1. **知识泡沫问题**: 如何避免存储过多低价值知识？
   - 方案: 重要性评分 + 定期清理

2. **跨 Session 记忆**: 如何在新 Session 中快速恢复上下文？
   - 方案: KNOWLEDGE.md + SQL 动态查询

3. **知识更新**: 如何保持知识的时效性？
   - 方案: 定期更新 + 废弃标记

---

## 📝 下一步行动

1. 实现 Memory Skills API
2. 创建数据库迁移
3. 测试知识注入机制
```

---

### 2. SQL 查询机制

#### 2.1 查询最重要知识点

```sql
-- 查询当前项目 + 通用的高重要性知识
SELECT 
    id,
    content,
    tags,
    importance,
    created_at
FROM memories
WHERE (project_id = :current_project_id OR project_id IS NULL)
  AND importance >= 8
ORDER BY importance DESC, created_at DESC
LIMIT 10;
```

#### 2.2 查询最近学习记录

```sql
-- 查询最近 24 小时学习
SELECT 
    content,
    tags,
    created_at
FROM memories
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 5;
```

#### 2.3 查询知识应用情况

```sql
-- 查询知识被应用的次数
SELECT 
    m.id,
    m.content,
    COUNT(ml.id) as application_count
FROM memories m
LEFT JOIN memory_links ml ON m.id = ml.source_id AND ml.relationship = 'applied-to'
GROUP BY m.id, m.content
HAVING COUNT(ml.id) > 0
ORDER BY application_count DESC
LIMIT 10;
```

#### 2.4 查询知识泡沫（低价值知识）

```sql
-- 查询低重要性 + 长期未使用 + 无关联的知识
SELECT 
    m.id,
    m.content,
    m.importance,
    m.created_at,
    COUNT(ml.id) as link_count
FROM memories m
LEFT JOIN memory_links ml ON m.id = ml.source_id OR m.id = ml.target_id
WHERE m.importance <= 3
  AND m.created_at < NOW() - INTERVAL '30 days'
GROUP BY m.id
HAVING COUNT(ml.id) = 0
ORDER BY m.created_at DESC;
```

---

### 3. 去知识泡沫机制

#### 3.1 重要性评分规则

```typescript
// 重要性评分指南
const IMPORTANCE_GUIDELINES = {
  // 9-10: 关键知识，必须保留
  critical: {
    examples: [
      "持续运行机制",
      "核心架构决策",
      "关键 Bug 修复"
    ],
    action: "永久保留"
  },
  
  // 7-8: 重要知识，频繁使用
  important: {
    examples: [
      "常用设计模式",
      "最佳实践",
      "重要优化"
    ],
    action: "保留，定期验证"
  },
  
  // 5-6: 有用知识，偶尔使用
  useful: {
    examples: [
      "特定库的用法",
      "项目特定配置"
    ],
    action: "保留，6 个月后评估"
  },
  
  // 3-4: 次要知识，很少使用
  minor: {
    examples: [
      "临时解决方案",
      "特定场景的技巧"
    ],
    action: "30 天后清理"
  },
  
  // 1-2: 琐碎知识，几乎不用
  trivial: {
    examples: [
      "临时调试信息",
      "无关紧要的细节"
    ],
    action: "立即清理"
  }
};
```

#### 3.2 自动清理策略

```typescript
// src/learning/KnowledgeCleanup.ts

export class KnowledgeCleanup {
  async cleanup(): Promise<CleanupResult> {
    // 1. 清理低重要性 + 长期未使用的知识
    const unused = await this.findUnusedKnowledge();
    
    // 2. 清理重复知识
    const duplicates = await this.findDuplicateKnowledge();
    
    // 3. 清理过期知识
    const expired = await this.findExpiredKnowledge();
    
    // 4. 执行清理
    const result = await this.executeCleanup({
      unused,
      duplicates,
      expired
    });
    
    return result;
  }
  
  private async findUnusedKnowledge(): Promise<Memory[]> {
    // 查询低重要性 + 无关联 + 30 天未更新
    const query = `
      SELECT m.* FROM memories m
      LEFT JOIN memory_links ml ON m.id = ml.source_id OR m.id = ml.target_id
      WHERE m.importance <= 3
        AND m.updated_at < NOW() - INTERVAL '30 days'
      GROUP BY m.id
      HAVING COUNT(ml.id) = 0
    `;
    
    return await db.query(query);
  }
  
  private async findDuplicateKnowledge(): Promise<Memory[][]> {
    // 查询相似度高的知识（使用向量搜索）
    const query = `
      SELECT 
        m1.id as id1,
        m2.id as id2,
        1 - (m1.embedding <=> m2.embedding) as similarity
      FROM memories m1
      JOIN memories m2 ON m1.id < m2.id
      WHERE 1 - (m1.embedding <=> m2.embedding) > 0.9
    `;
    
    return await db.query(query);
  }
  
  private async findExpiredKnowledge(): Promise<Memory[]> {
    // 查询标记为过期的知识
    const query = `
      SELECT * FROM memories
      WHERE metadata->>'expired' = 'true'
         OR (importance <= 2 AND created_at < NOW() - INTERVAL '7 days')
    `;
    
    return await db.query(query);
  }
}
```

#### 3.3 定期清理任务

```typescript
// src/learning/KnowledgeCleanupScheduler.ts

export class KnowledgeCleanupScheduler {
  private readonly cleanup: KnowledgeCleanup;
  
  constructor() {
    this.cleanup = new KnowledgeCleanup();
    this.scheduleCleanup();
  }
  
  private scheduleCleanup(): void {
    // 每周日凌晨 3 点执行清理
    cron.schedule('0 3 * * 0', async () => {
      console.log('[KnowledgeCleanup] Starting weekly cleanup...');
      
      const result = await this.cleanup.cleanup();
      
      console.log(`[KnowledgeCleanup] Cleaned up:
        - ${result.unused} unused knowledge
        - ${result.duplicates} duplicate knowledge
        - ${result.expired} expired knowledge
      `);
    });
  }
}
```

---

### 4. 知识交接班流程

#### 4.1 Session 结束时

```typescript
// src/learning/KnowledgeHandover.ts

export class KnowledgeHandover {
  async createHandover(sessionId: string): Promise<void> {
    // 1. 查询当前最重要的知识
    const topKnowledge = await this.getTopKnowledge(10);
    
    // 2. 查询最近学习
    const recentLearning = await this.getRecentLearning(5);
    
    // 3. 查询待处理任务
    const pendingTasks = await this.getPendingTasks();
    
    // 4. 生成 KNOWLEDGE.md
    const content = await this.generateKnowledgeMd({
      topKnowledge,
      recentLearning,
      pendingTasks,
      sessionId
    });
    
    // 5. 写入文件
    await fs.writeFile('KNOWLEDGE.md', content);
  }
  
  private async getTopKnowledge(limit: number): Promise<Memory[]> {
    const query = `
      SELECT * FROM memories
      WHERE (project_id = $1 OR project_id IS NULL)
        AND importance >= 8
      ORDER BY importance DESC, created_at DESC
      LIMIT $2
    `;
    
    return await db.query(query, [this.currentProjectId, limit]);
  }
  
  private async generateKnowledgeMd(data: HandoverData): Promise<string> {
    return `# Knowledge Handover

**最后更新**: ${new Date().toISOString()}
**Session ID**: ${data.sessionId}
**项目**: ${this.currentProjectName}

---

## 🎯 当前最重要的知识点

${data.topKnowledge.map((k, i) => `
### ${i + 1}. ${k.content.substring(0, 50)}... (重要性: ${k.importance}/10)
${k.content}

- **标签**: ${k.tags.join(', ')}
- **上下文**: ${k.context || 'N/A'}
- **来源**: ${k.source || 'N/A'}
`).join('\n')}

---

## 📊 当前任务状态

### 待处理
${data.pendingTasks.map(t => `- [ ] ${t.message}`).join('\n')}

---

## 🔍 最近学习记录

${data.recentLearning.map(l => `
- **${l.created_at}**: ${l.content.substring(0, 100)}...
`).join('\n')}

---

## 📝 下一步行动

1. 查看待处理任务
2. 继续学习系统实现
3. 定期清理知识泡沫
`;
  }
}
```

#### 4.2 Session 开始时

```typescript
// src/learning/KnowledgeHandover.ts

export class KnowledgeHandover {
  async loadHandover(): Promise<HandoverContext> {
    // 1. 读取 KNOWLEDGE.md
    const content = await fs.readFile('KNOWLEDGE.md', 'utf-8');
    
    // 2. 解析内容
    const context = this.parseKnowledgeMd(content);
    
    // 3. 验证知识时效性
    await this.validateKnowledge(context.topKnowledge);
    
    // 4. 注入到 Agent 的 System Prompt
    return context;
  }
  
  private parseKnowledgeMd(content: string): HandoverContext {
    // 解析 Markdown 内容
    // 提取重要知识点、任务状态、学习记录等
  }
  
  private async validateKnowledge(knowledge: Memory[]): Promise<void> {
    // 检查知识是否仍然有效
    // 如果过期，标记为需要更新
  }
}
```

---

### 5. 集成到 Agent

```typescript
// src/core/Agent.ts

export class Agent {
  private readonly handover: KnowledgeHandover;
  
  async initialize(): Promise<void> {
    // 加载知识交接班
    const context = await this.handover.loadHandover();
    
    // 注入到 System Prompt
    this.systemPrompt = this.buildSystemPrompt(context);
  }
  
  private buildSystemPrompt(context: HandoverContext): string {
    let prompt = BASE_SYSTEM_PROMPT;
    
    // 注入学习指令
    prompt += '\n\n' + LEARNING_SYSTEM_PROMPT;
    
    // 注入当前最重要的知识
    prompt += '\n\n## 当前最重要的知识\n\n';
    prompt += this.formatKnowledge(context.topKnowledge);
    
    // 注入待处理任务
    prompt += '\n\n## 待处理任务\n\n';
    prompt += context.pendingTasks.map(t => `- ${t.message}`).join('\n');
    
    return prompt;
  }
  
  async shutdown(): Promise<void> {
    // 创建知识交接班
    await this.handover.createHandover(this.sessionId);
  }
}
```

---

## 📊 完整流程

```
Session 开始
    ↓
读取 KNOWLEDGE.md
    ↓
解析知识点
    ↓
验证时效性
    ↓
注入到 System Prompt
    ↓
执行任务
    ↓
学习新知识
    ↓
Session 结束
    ↓
更新 KNOWLEDGE.md
    ↓
清理知识泡沫
    ↓
下一个 Session
```

---

## ✅ 核心优势

1. **跨 Session 记忆** - KNOWLEDGE.md 持久化
2. **动态知识注入** - SQL 查询最重要知识
3. **去知识泡沫** - 自动清理低价值知识
4. **知识交接班** - MD 文档作为交接机制
5. **时效性保证** - 定期验证和更新

---

**创建时间**: 2026-03-16  
**状态**: 完整知识交接班机制  
**关键创新**: MD + SQL + 自动清理
