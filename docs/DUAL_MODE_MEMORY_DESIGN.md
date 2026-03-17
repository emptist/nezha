# Nezha 双模式记忆系统设计

**创建日期**: 2026-03-17  
**版本**: 1.0  
**目的**: 明确区分 Nezha 自身开发和产品应用两种场景的记忆系统设计

---

## 🎯 核心设计原则

### 两种使用场景

Nezha 有两种完全不同的使用场景，需要不同的记忆系统设计：

#### 场景 1: Nezha 自身开发模式

**特点**:
- Nezha 正在开发中，可能不稳定
- 可能连数据库都连不上
- 需要最基础的记忆机制来支持开发

**记忆系统设计**:
```
Nezha 自身开发
    ├── 文件系统记忆
    │   ├── HEARTBEAT.md (任务清单)
    │   ├── memory/ (知识存储)
    │   └── conversations/ (对话记录)
    └── 数据库记忆 (可选，如果可用)
        └── (作为补充，不是必需)
```

**对话记录设计**:
```
conversations/
    ├── 2026-03-17/
    │   ├── session-001.jsonl
    │   └── session-002.jsonl
    └── index.json
```

**为什么使用文件系统**:
- ✅ 不依赖数据库连接
- ✅ 开发过程中随时可用
- ✅ 人类可读，方便调试
- ✅ Git 可追踪，版本可控

#### 场景 2: Nezha 产品模式（应用在其他项目中）

**特点**:
- Nezha 已开发完成，作为产品使用
- 在客户项目中运行
- 数据库已配置好，连接稳定
- 不能污染客户项目的文件系统

**记忆系统设计**:
```
Nezha 产品模式
    └── 数据库记忆 (必需，唯一选择)
        ├── memories 表 (记忆存储)
        ├── conversations 表 (对话记录)
        ├── knowledge 表 (知识库)
        └── tasks 表 (任务队列)
```

**对话记录设计**:
```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    session_id VARCHAR(255),
    timestamp TIMESTAMP,
    conversation_type VARCHAR(50),
    task_id VARCHAR(255),
    messages JSONB,
    result JSONB,
    learning JSONB,
    metadata JSONB
);
```

**为什么必须使用数据库**:
- ✅ 不污染客户项目文件系统
- ✅ 与客户项目数据隔离
- ✅ 支持多项目并行
- ✅ 性能更好，查询更快
- ✅ 支持事务，数据一致性好

---

## 📊 对比分析

| 维度 | Nezha 自身开发模式 | Nezha 产品模式 |
|------|-------------------|---------------|
| **数据库依赖** | ❌ 不依赖 | ✅ 必需 |
| **文件系统** | ✅ 主要使用 | ❌ 不使用 |
| **记忆存储** | HEARTBEAT.md + memory/ | PostgreSQL 表 |
| **对话记录** | conversations/*.jsonl | conversations 表 |
| **适用场景** | Nezha 开发过程 | 客户项目应用 |
| **数据隔离** | ❌ 混在一起 | ✅ 完全隔离 |
| **多项目支持** | ❌ 不支持 | ✅ 支持 |

---

## 🏗️ 实现设计

### 1. 双模式检测

```typescript
export enum NezhaMode {
  DEVELOPMENT = 'development',  // Nezha 自身开发模式
  PRODUCTION = 'production'     // Nezha 产品模式
}

export class ModeDetector {
  static detectMode(): NezhaMode {
    // 检测是否在 Nezha 项目目录中
    const isNezhaProject = this.isNezhaProjectDirectory();
    
    // 检测数据库是否可用
    const isDatabaseAvailable = this.isDatabaseAvailable();
    
    if (isNezhaProject || !isDatabaseAvailable) {
      return NezhaMode.DEVELOPMENT;
    } else {
      return NezhaMode.PRODUCTION;
    }
  }
  
  private static isNezhaProjectDirectory(): boolean {
    // 检查当前目录是否包含 Nezha 的特征文件
    return fs.existsSync('package.json') && 
           this.isNezhaPackage(JSON.parse(fs.readFileSync('package.json', 'utf-8')));
  }
  
  private static isDatabaseAvailable(): boolean {
    // 尝试连接数据库
    try {
      // 简单的连接测试
      return true;
    } catch {
      return false;
    }
  }
}
```

### 2. 双模式记忆服务

```typescript
export class DualModeMemoryService {
  private mode: NezhaMode;
  private fileSystemMemory: FileSystemMemory;
  private databaseMemory: DatabaseMemory;
  
  constructor() {
    this.mode = ModeDetector.detectMode();
    this.fileSystemMemory = new FileSystemMemory();
    this.databaseMemory = new DatabaseMemory();
  }
  
  async store(entry: MemoryEntry): Promise<void> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        // 开发模式：优先使用文件系统，数据库作为可选补充
        await this.fileSystemMemory.store(entry);
        if (await this.isDatabaseAvailable()) {
          try {
            await this.databaseMemory.store(entry);
          } catch (error) {
            console.warn('Database store failed, but file system succeeded:', error);
          }
        }
        break;
        
      case NezhaMode.PRODUCTION:
        // 产品模式：仅使用数据库
        await this.databaseMemory.store(entry);
        break;
    }
  }
  
  async retrieve(query: string): Promise<MemoryEntry[]> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        // 开发模式：优先从文件系统检索
        const fileResults = await this.fileSystemMemory.retrieve(query);
        if (await this.isDatabaseAvailable()) {
          try {
            const dbResults = await this.databaseMemory.retrieve(query);
            return this.mergeResults(fileResults, dbResults);
          } catch {
            return fileResults;
          }
        }
        return fileResults;
        
      case NezhaMode.PRODUCTION:
        // 产品模式：仅从数据库检索
        return await this.databaseMemory.retrieve(query);
    }
  }
}
```

### 3. 双模式对话记录

```typescript
export class DualModeConversationLogger {
  private mode: NezhaMode;
  private fileLogger: FileSystemConversationLogger;
  private dbLogger: DatabaseConversationLogger;
  
  constructor() {
    this.mode = ModeDetector.detectMode();
    this.fileLogger = new FileSystemConversationLogger();
    this.dbLogger = new DatabaseConversationLogger();
  }
  
  async startConversation(task: TaskInfo): Promise<string> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        // 开发模式：文件系统记录
        return await this.fileLogger.startConversation(task);
        
      case NezhaMode.PRODUCTION:
        // 产品模式：数据库记录
        return await this.dbLogger.startConversation(task);
    }
  }
  
  async addMessage(sessionId: string, message: Message): Promise<void> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        await this.fileLogger.addMessage(sessionId, message);
        break;
        
      case NezhaMode.PRODUCTION:
        await this.dbLogger.addMessage(sessionId, message);
        break;
    }
  }
  
  async endConversation(sessionId: string, result: Result): Promise<void> {
    switch (this.mode) {
      case NezhaMode.DEVELOPMENT:
        await this.fileLogger.endConversation(sessionId, result);
        break;
        
      case NezhaMode.PRODUCTION:
        await this.dbLogger.endConversation(sessionId, result);
        break;
    }
  }
}
```

---

## 📋 数据库 Schema 设计

### 产品模式必需的表

```sql
-- 记忆表
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,  -- 'knowledge', 'experience', 'pattern', 'insight'
    content TEXT NOT NULL,
    embedding vector(1536),  -- pgvector for semantic search
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 对话记录表
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    conversation_type VARCHAR(50),  -- 'task_execution', 'problem_solving', 'learning', 'review'
    task_id VARCHAR(255),
    task_title TEXT,
    task_description TEXT,
    messages JSONB NOT NULL,
    result JSONB,
    learning JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 知识库表
CREATE TABLE knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    tags TEXT[],
    embedding vector(1536),
    source VARCHAR(255),  -- 'conversation', 'code', 'document', 'manual'
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 任务表
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 5,
    status VARCHAR(50) DEFAULT 'PENDING',  -- 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    result JSONB,
    error TEXT
);

-- 索引
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_created ON memories(created_at);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp);
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);

-- 向量索引 (for pgvector)
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_knowledge_embedding ON knowledge USING ivfflat (embedding vector_cosine_ops);
```

---

## 🔄 模式切换

### 从开发模式切换到产品模式

```bash
# 1. 检测当前模式
node dist/cli/index.js mode

# 2. 迁移数据（如果需要）
node dist/cli/index.js migrate --from=file --to=database

# 3. 验证数据库连接
node dist/cli/index.js db-test

# 4. 切换模式
export NEZHA_MODE=production
```

### 从产品模式切换到开发模式

```bash
# 1. 导出数据（如果需要）
node dist/cli/index.js export --output=./backup

# 2. 切换模式
export NEZHA_MODE=development

# 3. 验证文件系统
ls -la memory/ conversations/
```

---

## 💡 最佳实践

### 开发模式最佳实践

1. **定期提交记忆文件** - 将 memory/ 和 conversations/ 加入 Git
2. **使用 HEARTBEAT.md 管理任务** - 手动或自动更新任务清单
3. **保留对话记录** - 用于学习和调试
4. **数据库可选** - 如果可用，作为补充存储

### 产品模式最佳实践

1. **确保数据库稳定** - 配置好连接池、备份等
2. **定期清理** - 清理过期的对话记录和临时数据
3. **监控性能** - 监控数据库查询性能
4. **数据隔离** - 每个项目使用独立的数据库或 schema

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

### 设计原则

1. **开发模式优先文件系统** - 因为可能连数据库都连不上
2. **产品模式仅用数据库** - 因为不能污染客户项目
3. **自动模式检测** - 根据环境自动选择模式
4. **平滑切换** - 支持从开发模式切换到产品模式

---

**结论**: Nezha 的双模式记忆系统设计是为了适应两种完全不同的使用场景。开发模式使用文件系统保证可用性，产品模式使用数据库保证隔离性和性能。这种设计确保了 Nezha 既能支持自身的开发，又能作为产品在其他项目中稳定运行。
