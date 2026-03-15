# Nezha 数据库实现计划

## 阶段 1：数据库连接层（当前）

### 目标
建立数据库连接，验证可用性，为后续存储知识打下基础。

### 设计

```
src/db/
├── client.ts      # 数据库客户端（单例 + 连接池）
├── config.ts     # 环境变量加载
├── index.ts      # 统一导出
└── test.ts      # 连接测试脚本
```

### 环境变量
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nezha
DB_USER=postgres
DB_PASSWORD=postgres
```

### 技术选型
- 使用 `pg` 库（已安装）
- 连接池管理：默认 10 连接
- 单例模式：避免重复创建连接

---

## 阶段 2：核心 Schema

### 目标
设计核心表结构，支持知识存储和检索。

### 表结构设计

```sql
-- 知识/记忆表（最核心）
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,           -- 记忆内容
    embedding VECTOR(1536),          -- 向量嵌入（可选，用于语义检索）
    source TEXT,                      -- 来源：code, error, conversation, heartbeat
    tags TEXT[],                      -- 标签：['react', 'bug-fix', 'api']
    importance INTEGER DEFAULT 1,     -- 重要程度 1-5
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 任务队列表（借鉴 OpenClaw + PostgreSQL SKIP LOCKED）
CREATE UNLOGGED TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',    -- pending, running, completed, failed
    priority INTEGER DEFAULT 0,
    payload JSONB,                   -- 任务数据
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 心跳记录表
CREATE TABLE heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT,                      -- ok, task_executed, error
    tasks_count INTEGER DEFAULT 0,
    duration_ms INTEGER
);

-- 会话/上下文表
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key TEXT UNIQUE NOT NULL,
    context JSONB,                    -- 存储上下文数据
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 索引
```sql
-- 向量索引（如果启用 pgvector）
CREATE INDEX memories_embedding_idx ON memories USING ivfflat (embedding vector_cosine_ops);

-- 时间索引
CREATE INDEX memories_created_at_idx ON memories(created_at DESC);
CREATE INDEX tasks_status_idx ON tasks(status, priority DESC, created_at ASC);
```

---

## 阶段 3：Repository 层

### 目标
封装数据库操作，提供业务友好的 API。

```
src/db/
├── repositories/
│   ├── memory.repository.ts
│   ├── task.repository.ts
│   ├── heartbeat.repository.ts
│   └── session.repository.ts
└── migrations/
    └── 001_initial.sql
```

### 核心方法

```typescript
// MemoryRepository
interface MemoryRepository {
  create(content: string, source: string, tags?: string[]): Promise<Memory>;
  findById(id: string): Promise<Memory | null>;
  searchByText(query: string, limit?: number): Promise<Memory[]>;
  searchByVector(embedding: number[], limit?: number): Promise<Memory[]>;
  findByTag(tag: string): Promise<Memory[]>;
  update(id: string, data: Partial<Memory>): Promise<Memory>;
  delete(id: string): Promise<void>;
}

// TaskRepository (使用 SKIP LOCKED 实现并发安全)
interface TaskRepository {
  enqueue(title: string, payload?: object, priority?: number): Promise<Task>;
  dequeue(): Promise<Task | null>;  // 原子操作，自动锁定
  complete(id: string): Promise<void>;
  fail(id: string, error?: string): Promise<void>;
  list(status?: string): Promise<Task[]>;
}
```

---

## 阶段 4：集成测试

### 目标
验证所有数据库操作正常工作。

```bash
# 运行测试
npm test

# 测试连接
npm run db:test
```

---

## 实施顺序

1. **Phase 1**: 环境变量 + 连接模块 + 测试脚本
2. **Phase 2**: 创建 schema.sql + migrations 脚本
3. **Phase 3**: Repository 层
4. **Phase 4**: 集成测试

---

## 注意事项

- 暂不启用 pgvector（需要单独安装扩展）
- 优先实现 memory 存储，因为这是"记录重要知识"的核心需求
- Task 队列可以后续 heartbeat 实现时再加入
- 保持简单，不超前设计
