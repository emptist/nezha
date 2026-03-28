# Nezha 双模式对话系统设计

**创建日期**: 2026-03-17  
**版本**: 1.0  
**目的**: 明确区分 Nezha 自身开发和产品应用两种场景的对话系统设计

---

## 🎯 核心设计原则

### 两种使用场景

与记忆系统一样，对话系统也需要支持两种完全不同的使用场景：

#### 场景 1: Nezha 自身开发模式

**特点**:
- Nezha 正在开发中，可能不稳定
- 可能连数据库都连不上
- 需要最基础的对话记录机制来支持开发

**对话记录设计**:
```
Nezha 自身开发
    └── 文件系统对话记录
        ├── conversations/
        │   ├── 2026-03-17/
        │   │   ├── session-001.jsonl
        │   │   ├── session-002.jsonl
        │   │   └── session-003.jsonl
        │   └── index.json
        └── .tmp/
            └── nezha_session_*.json (OpenCode 会话)
```

**为什么使用文件系统**:
- ✅ 不依赖数据库连接
- ✅ 开发过程中随时可用
- ✅ 人类可读，方便调试
- ✅ Git 可追踪，版本可控
- ✅ 可以直接查看和分析

**文件格式**:
```json
{
  "timestamp": "2026-03-17T21:30:00.000Z",
  "session_id": "uuid",
  "conversation_type": "task_execution",
  "task": {
    "id": "task-001",
    "title": "Implement conversation logging",
    "description": "Create dual-mode conversation system"
  },
  "messages": [
    {
      "role": "user",
      "content": "Start implementing conversation logging",
      "timestamp": "2026-03-17T21:30:01.000Z"
    },
    {
      "role": "assistant",
      "content": "I will create a ConversationLogger class...",
      "timestamp": "2026-03-17T21:30:02.000Z"
    }
  ],
  "result": {
    "success": true,
    "output": "ConversationLogger implemented",
    "artifacts": ["src/core/ConversationLogger.ts"]
  },
  "learning": {
    "insights": ["Dual-mode design is essential"],
    "improvements": ["Add database support"],
    "patterns": ["File system first, database second"]
  },
  "metadata": {
    "duration_ms": 5000,
    "tokens_used": 500,
    "model": "big-pickle"
  }
}
```

#### 场景 2: Nezha 产品模式（应用在其他项目中）

**特点**:
- Nezha 已开发完成，作为产品使用
- 在客户项目中运行
- 数据库已配置好，连接稳定
- 不能污染客户项目的文件系统

**对话记录设计**:
```sql
-- 对话记录表
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    conversation_type VARCHAR(50),  -- 'task_execution', 'problem_solving', 'learning', 'review'
    
    -- 任务信息
    task_id VARCHAR(255),
    task_title TEXT,
    task_description TEXT,
    
    -- 对话内容
    messages JSONB NOT NULL,
    
    -- 结果和学习
    result JSONB,
    learning JSONB,
    
    -- 元数据
    metadata JSONB,
    
    -- 索引字段
    project_id VARCHAR(255),  -- 支持多项目
    user_id VARCHAR(255),     -- 支持多用户
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp);
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_type ON conversations(conversation_type);
```

**为什么必须使用数据库**:
- ✅ 不污染客户项目文件系统
- ✅ 与客户项目数据隔离
- ✅ 支持多项目并行
- ✅ 支持多用户访问
- ✅ 性能更好，查询更快
- ✅ 支持事务，数据一致性好
- ✅ 支持复杂查询和分析

---

## 📊 对比分析

| 维度 | Nezha 自身开发模式 | Nezha 产品模式 |
|------|-------------------|---------------|
| **数据库依赖** | ❌ 不依赖 | ✅ 必需 |
| **文件系统** | ✅ 主要使用 | ❌ 不使用 |
| **对话存储** | conversations/*.jsonl | conversations 表 |
| **索引方式** | index.json 文件 | 数据库索引 |
| **查询方式** | 文件遍历 | SQL 查询 |
| **适用场景** | Nezha 开发过程 | 客户项目应用 |
| **数据隔离** | ❌ 混在一起 | ✅ 完全隔离 |
| **多项目支持** | ❌ 不支持 | ✅ 支持 |
| **多用户支持** | ❌ 不支持 | ✅ 支持 |
| **性能** | 文件 I/O | 数据库查询 |
| **可扩展性** | 有限 | 高 |

---

## 🏗️ 实现设计

### 1. 双模式对话记录器

```typescript
export enum NezhaMode {
  DEVELOPMENT = 'development',  // Nezha 自身开发模式
  PRODUCTION = 'production'     // Nezha 产品模式
}

export class DualModeConversationLogger {
  private mode: NezhaMode;
  private fileLogger: FileSystemConversationLogger;
  private dbLogger: DatabaseConversationLogger;
  
  constructor() {
    this.mode = ModeDetector.detectMode();
    this.fileLogger = new FileSystemConversationLogger();
    this.dbLogger = new DatabaseConversationLogger();
  }
  
  async startConversation(
    task: { id: string; title: string; description: string },
    type: 'task_execution' | 'problem_solving' | 'learning' | 'review' = 'task_execution'
  ): Promise<string> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        // 开发模式：使用文件系统
        return await this.fileLogger.startConversation(task, type);
        
      case NezhaMode.PRODUCTION:
        // 产品模式：使用数据库
        return await this.dbLogger.startConversation(task, type);
    }
  }
  
  async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        await this.fileLogger.addMessage(sessionId, role, content);
        break;
        
      case NezhaMode.PRODUCTION:
        await this.dbLogger.addMessage(sessionId, role, content);
        break;
    }
  }
  
  async endConversation(sessionId: string, result?: ConversationResult): Promise<void> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        await this.fileLogger.endConversation(sessionId, result);
        break;
        
      case NezhaMode.PRODUCTION:
        await this.dbLogger.endConversation(sessionId, result);
        break;
    }
  }
  
  async getConversationLog(sessionId: string): Promise<ConversationLog | null> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        return await this.fileLogger.getConversationLog(sessionId);
        
      case NezhaMode.PRODUCTION:
        return await this.dbLogger.getConversationLog(sessionId);
    }
  }
  
  async listConversations(options?: {
    date?: string;
    projectId?: string;
    userId?: string;
    limit?: number;
  }): Promise<ConversationSummary[]> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        return await this.fileLogger.listConversations(options?.date);
        
      case NezhaMode.PRODUCTION:
        return await this.dbLogger.listConversations(options);
    }
  }
}
```

### 2. 文件系统对话记录器

```typescript
export class FileSystemConversationLogger {
  private readonly logDir: string = 'conversations';
  
  async startConversation(
    task: { id: string; title: string; description: string },
    type: 'task_execution' | 'problem_solving' | 'learning' | 'review'
  ): Promise<string> {
    const sessionId = uuidv4();
    const conversation: ConversationLog = {
      timestamp: new Date(),
      session_id: sessionId,
      conversation_type: type,
      participants: ['AI'],
      task,
      messages: [],
      metadata: { duration_ms: 0 },
    };
    
    // 保存到文件
    const date = new Date().toISOString().split('T')[0];
    const logPath = path.join(this.logDir, date, `session-${sessionId}.jsonl`);
    await fs.ensureDir(path.dirname(logPath));
    await fs.writeJson(logPath, conversation, { spaces: 2 });
    
    // 更新索引
    await this.updateIndex(conversation);
    
    return sessionId;
  }
  
  async addMessage(sessionId: string, role: string, content: string): Promise<void> {
    const conversation = await this.loadConversation(sessionId);
    conversation.messages.push({
      role,
      content,
      timestamp: new Date(),
    });
    await this.saveConversation(conversation);
  }
  
  async endConversation(sessionId: string, result?: ConversationResult): Promise<void> {
    const conversation = await this.loadConversation(sessionId);
    if (result) {
      conversation.result = result;
    }
    conversation.metadata.duration_ms = 
      Date.now() - conversation.timestamp.getTime();
    await this.saveConversation(conversation);
  }
  
  private async updateIndex(conversation: ConversationLog): Promise<void> {
    const indexPath = path.join(this.logDir, 'index.json');
    let index: ConversationSummary[] = [];
    
    if (await fs.pathExists(indexPath)) {
      index = await fs.readJson(indexPath);
    }
    
    index.push({
      session_id: conversation.session_id,
      timestamp: conversation.timestamp.toISOString(),
      task_title: conversation.task.title,
      conversation_type: conversation.conversation_type,
      success: conversation.result?.success,
    });
    
    await fs.writeJson(indexPath, index, { spaces: 2 });
  }
}
```

### 3. 数据库对话记录器

```typescript
export class DatabaseConversationLogger {
  private db: DatabaseClient;
  
  constructor(db: DatabaseClient) {
    this.db = db;
  }
  
  async startConversation(
    task: { id: string; title: string; description: string },
    type: 'task_execution' | 'problem_solving' | 'learning' | 'review',
    context?: { projectId?: string; userId?: string }
  ): Promise<string> {
    const sessionId = uuidv4();
    
    await this.db.query(`
      INSERT INTO conversations (
        session_id, timestamp, conversation_type,
        task_id, task_title, task_description,
        messages, project_id, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      sessionId,
      new Date(),
      type,
      task.id,
      task.title,
      task.description,
      JSON.stringify([]),
      context?.projectId,
      context?.userId,
    ]);
    
    return sessionId;
  }
  
  async addMessage(sessionId: string, role: string, content: string): Promise<void> {
    // 获取当前消息
    const result = await this.db.query<{ messages: any[] }>(`
      SELECT messages FROM conversations WHERE session_id = $1
    `, [sessionId]);
    
    const messages = result.rows[0]?.messages || [];
    messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    
    // 更新消息
    await this.db.query(`
      UPDATE conversations SET messages = $1 WHERE session_id = $2
    `, [JSON.stringify(messages), sessionId]);
  }
  
  async endConversation(sessionId: string, result?: ConversationResult): Promise<void> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (result) {
      updateFields.push(`result = $${paramIndex++}`);
      values.push(JSON.stringify(result));
    }
    
    // 计算持续时间
    const startResult = await this.db.query<{ timestamp: Date }>(`
      SELECT timestamp FROM conversations WHERE session_id = $1
    `, [sessionId]);
    
    if (startResult.rows[0]) {
      const duration = Date.now() - startResult.rows[0].timestamp.getTime();
      updateFields.push(`metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{duration_ms}',
        $${paramIndex++}::jsonb
      )`);
      values.push(JSON.stringify(duration));
    }
    
    values.push(sessionId);
    
    await this.db.query(`
      UPDATE conversations 
      SET ${updateFields.join(', ')}
      WHERE session_id = $${paramIndex}
    `, values);
  }
  
  async listConversations(options?: {
    date?: string;
    projectId?: string;
    userId?: string;
    limit?: number;
  }): Promise<ConversationSummary[]> {
    let query = 'SELECT * FROM conversations WHERE 1=1';
    const values: any[] = [];
    let paramIndex = 1;
    
    if (options?.date) {
      query += ` AND timestamp::date = $${paramIndex++}::date`;
      values.push(options.date);
    }
    
    if (options?.projectId) {
      query += ` AND project_id = $${paramIndex++}`;
      values.push(options.projectId);
    }
    
    if (options?.userId) {
      query += ` AND user_id = $${paramIndex++}`;
      values.push(options.userId);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(options.limit);
    }
    
    const result = await this.db.query(query, values);
    
    return result.rows.map(row => ({
      session_id: row.session_id,
      timestamp: row.timestamp.toISOString(),
      task_title: row.task_title,
      conversation_type: row.conversation_type,
      success: row.result?.success,
    }));
  }
}
```

---

## 📋 数据库 Schema 完整设计

```sql
-- 对话记录表（产品模式）
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL UNIQUE,
    timestamp TIMESTAMP NOT NULL,
    conversation_type VARCHAR(50),
    
    -- 任务信息
    task_id VARCHAR(255),
    task_title TEXT,
    task_description TEXT,
    
    -- 参与者
    participants TEXT[],
    
    -- 对话内容
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- 结果和学习
    result JSONB,
    learning JSONB,
    
    -- 元数据
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- 多项目和多用户支持
    project_id VARCHAR(255),
    user_id VARCHAR(255),
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp DESC);
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_type ON conversations(conversation_type);
CREATE INDEX idx_conversations_task ON conversations(task_id);

-- 全文搜索索引（可选）
CREATE INDEX idx_conversations_messages ON conversations USING gin(messages);

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
```

---

## 🔄 模式切换

### 从开发模式切换到产品模式

```bash
# 1. 检测当前模式
node dist/cli/index.js mode

# 2. 迁移对话记录（如果需要）
node dist/cli/index.js migrate-conversations --from=file --to=database

# 3. 验证数据库连接
node dist/cli/index.js db-test

# 4. 切换模式
export NEZHA_MODE=production
```

### 迁移脚本

```typescript
export class ConversationMigrator {
  async migrateFromFileSystemToDatabase(): Promise<void> {
    const fileLogger = new FileSystemConversationLogger();
    const dbLogger = new DatabaseConversationLogger();
    
    // 读取所有对话
    const conversations = await fileLogger.getAllConversations();
    
    console.log(`Migrating ${conversations.length} conversations...`);
    
    for (const conv of conversations) {
      try {
        // 写入数据库
        const sessionId = await dbLogger.startConversation(
          conv.task,
          conv.conversation_type
        );
        
        // 添加所有消息
        for (const msg of conv.messages) {
          await dbLogger.addMessage(sessionId, msg.role, msg.content);
        }
        
        // 结束对话
        await dbLogger.endConversation(sessionId, conv.result);
        
        console.log(`Migrated conversation ${sessionId}`);
      } catch (error) {
        console.error(`Failed to migrate conversation ${conv.session_id}:`, error);
      }
    }
    
    console.log('Migration completed!');
  }
}
```

---

## 💡 最佳实践

### 开发模式最佳实践

1. **定期提交对话记录** - 将 conversations/ 加入 Git
2. **保留历史对话** - 用于学习和调试
3. **分析对话模式** - 提取常见问题和解决方案
4. **数据库可选** - 如果可用，作为补充存储

### 产品模式最佳实践

1. **定期清理** - 清理过期的对话记录
2. **监控性能** - 监控数据库查询性能
3. **数据隔离** - 每个项目使用独立的 project_id
4. **备份策略** - 定期备份对话记录
5. **隐私保护** - 敏感信息脱敏处理

---

## 🎯 总结

### 关键区别

| 方面 | 开发模式 | 产品模式 |
|------|---------|---------|
| **目的** | Nezha 自身开发 | 服务客户项目 |
| **数据库** | 可选 | 必需 |
| **文件系统** | 主要使用 | 不使用 |
| **数据隔离** | 不需要 | 必需 |
| **多项目** | 不支持 | 支持 |
| **多用户** | 不支持 | 支持 |

### 设计原则

1. **开发模式优先文件系统** - 因为可能连数据库都连不上
2. **产品模式仅用数据库** - 因为不能污染客户项目
3. **自动模式检测** - 根据环境自动选择模式
4. **平滑迁移** - 支持从开发模式切换到产品模式

---

**结论**: Nezha 的双模式对话系统设计与记忆系统保持一致，都是为了适应两种完全不同的使用场景。开发模式使用文件系统保证可用性，产品模式使用数据库保证隔离性和性能。这种设计确保了 Nezha 既能支持自身的开发，又能作为产品在其他项目中稳定运行。
