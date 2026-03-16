# Database Schema Design

**创建时间**: 2026-03-16  
**状态**: 完整数据库设计

---

## 🎯 概述

学习系统的数据库设计，支持统一知识库、跨项目共享、高效查询。

---

## 📊 表结构

### 1. memories 表

**主表：存储所有知识**

```sql
CREATE TABLE memories (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 项目关联（可选，NULL 表示通用知识）
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    
    -- 知识内容
    content TEXT NOT NULL,
    
    -- 标签（数组）
    tags TEXT[] DEFAULT '{}',
    
    -- 上下文
    context TEXT,
    
    -- 来源
    source TEXT,
    
    -- 重要性（1-10）
    importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
    
    -- 元数据（JSON）
    metadata JSONB DEFAULT '{}',
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 向量嵌入（可选，用于语义搜索）
    embedding vector(1536)
);

-- 注释
COMMENT ON TABLE memories IS 'Unified knowledge base for all projects';
COMMENT ON COLUMN memories.project_id IS 'NULL for general knowledge, project-specific otherwise';
COMMENT ON COLUMN memories.tags IS 'Array of tags for categorization and search';
COMMENT ON COLUMN memories.importance IS 'Importance score from 1 (low) to 10 (critical)';
```

### 2. memory_links 表

**关联表：建立知识之间的关系**

```sql
CREATE TABLE memory_links (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 关联的知识
    source_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    
    -- 关系类型
    relationship TEXT NOT NULL CHECK (
        relationship IN (
            'applied-to',
            'derived-from',
            'related-to',
            'contradicts',
            'extends',
            'alternative-to',
            'prerequisite-of',
            'follows'
        )
    ),
    
    -- 元数据
    metadata JSONB DEFAULT '{}',
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 唯一约束（防止重复关联）
    UNIQUE(source_id, target_id, relationship)
);

-- 注释
COMMENT ON TABLE memory_links IS 'Relationships between knowledge items';
COMMENT ON COLUMN memory_links.relationship IS 'Type of relationship between knowledge items';
```

### 3. memory_access_log 表（可选）

**访问日志：记录知识使用情况**

```sql
CREATE TABLE memory_access_log (
    -- 主键
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- 访问的知识
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    
    -- 访问类型
    access_type TEXT NOT NULL CHECK (
        access_type IN ('search', 'get', 'apply', 'update')
    ),
    
    -- 访问者（项目或任务）
    accessor_id UUID,
    accessor_type TEXT,
    
    -- 访问上下文
    context JSONB DEFAULT '{}',
    
    -- 时间戳
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 注释
COMMENT ON TABLE memory_access_log IS 'Track knowledge usage for analytics';
```

---

## 📊 索引设计

### 1. memories 表索引

```sql
-- 项目索引（查询项目知识）
CREATE INDEX idx_memories_project ON memories(project_id);

-- 标签索引（GIN，支持数组查询）
CREATE INDEX idx_memories_tags ON memories USING GIN(tags);

-- 重要性索引（排序）
CREATE INDEX idx_memories_importance ON memories(importance DESC);

-- 创建时间索引（排序）
CREATE INDEX idx_memories_created_at ON memories(created_at DESC);

-- 全文搜索索引（内容搜索）
CREATE INDEX idx_memories_content_fts ON memories USING GIN(to_tsvector('english', content));

-- 向量索引（语义搜索，可选）
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
```

### 2. memory_links 表索引

```sql
-- 源知识索引（查找关联）
CREATE INDEX idx_memory_links_source ON memory_links(source_id);

-- 目标知识索引（反向查找）
CREATE INDEX idx_memory_links_target ON memory_links(target_id);

-- 关系类型索引
CREATE INDEX idx_memory_links_relationship ON memory_links(relationship);
```

### 3. memory_access_log 表索引

```sql
-- 知识索引（统计访问）
CREATE INDEX idx_memory_access_log_memory ON memory_access_log(memory_id);

-- 访问时间索引（时间范围查询）
CREATE INDEX idx_memory_access_log_accessed_at ON memory_access_log(accessed_at DESC);
```

---

## 📊 查询优化

### 1. 按项目查询知识

```sql
-- 查询项目知识 + 通用知识
SELECT * FROM memories
WHERE project_id = $1 OR project_id IS NULL
ORDER BY importance DESC, created_at DESC
LIMIT $2;

-- 使用索引：idx_memories_project, idx_memories_importance
```

### 2. 按标签查询知识

```sql
-- 查询包含特定标签的知识
SELECT * FROM memories
WHERE tags @> ARRAY['pattern', 'nodejs']
ORDER BY importance DESC
LIMIT 10;

-- 使用索引：idx_memories_tags
```

### 3. 全文搜索

```sql
-- 全文搜索知识内容
SELECT * FROM memories
WHERE to_tsvector('english', content) @@ to_tsquery('english', 'continuous & running')
ORDER BY importance DESC
LIMIT 10;

-- 使用索引：idx_memories_content_fts
```

### 4. 组合查询

```sql
-- 组合查询：项目 + 标签 + 重要性
SELECT * FROM memories
WHERE (project_id = $1 OR project_id IS NULL)
  AND tags @> $2
  AND importance >= $3
ORDER BY importance DESC, created_at DESC
LIMIT $4;

-- 使用索引：idx_memories_project, idx_memories_tags, idx_memories_importance
```

### 5. 向量搜索（可选）

```sql
-- 语义相似度搜索
SELECT id, content, 
       1 - (embedding <=> $1) as similarity
FROM memories
ORDER BY embedding <=> $1
LIMIT 10;

-- 使用索引：idx_memories_embedding
```

---

## 📊 触发器

### 1. 自动更新 updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 2. 访问日志触发器（可选）

```sql
CREATE OR REPLACE FUNCTION log_memory_access()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO memory_access_log (memory_id, access_type, accessor_id, accessor_type)
    VALUES (NEW.id, 'create', NEW.project_id, 'project');
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER log_memory_creation
    AFTER INSERT ON memories
    FOR EACH ROW
    EXECUTE FUNCTION log_memory_access();
```

---

## 📊 视图

### 1. 项目知识视图

```sql
CREATE VIEW project_knowledge AS
SELECT 
    m.id,
    m.project_id,
    p.name as project_name,
    m.content,
    m.tags,
    m.importance,
    m.created_at
FROM memories m
LEFT JOIN projects p ON m.project_id = p.id
ORDER BY m.importance DESC, m.created_at DESC;
```

### 2. 知识统计视图

```sql
CREATE VIEW knowledge_stats AS
SELECT 
    project_id,
    COUNT(*) as total_knowledge,
    AVG(importance) as avg_importance,
    array_agg(DISTINCT unnest(tags)) as all_tags
FROM memories
GROUP BY project_id;
```

### 3. 知识关联视图

```sql
CREATE VIEW knowledge_network AS
SELECT 
    m1.id as source_id,
    m1.content as source_content,
    ml.relationship,
    m2.id as target_id,
    m2.content as target_content
FROM memory_links ml
JOIN memories m1 ON ml.source_id = m1.id
JOIN memories m2 ON ml.target_id = m2.id;
```

---

## 📊 迁移脚本

### 创建表的迁移

```sql
-- Migration: 003_learning_system.sql

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";  -- 可选

-- 创建 memories 表
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    context TEXT,
    source TEXT,
    importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    embedding vector(1536)
);

-- 创建 memory_links 表
CREATE TABLE memory_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL CHECK (
        relationship IN (
            'applied-to',
            'derived-from',
            'related-to',
            'contradicts',
            'extends',
            'alternative-to',
            'prerequisite-of',
            'follows'
        )
    ),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, relationship)
);

-- 创建索引
CREATE INDEX idx_memories_project ON memories(project_id);
CREATE INDEX idx_memories_tags ON memories USING GIN(tags);
CREATE INDEX idx_memories_importance ON memories(importance DESC);
CREATE INDEX idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX idx_memories_content_fts ON memories USING GIN(to_tsvector('english', content));

CREATE INDEX idx_memory_links_source ON memory_links(source_id);
CREATE INDEX idx_memory_links_target ON memory_links(target_id);
CREATE INDEX idx_memory_links_relationship ON memory_links(relationship);

-- 创建触发器
CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 创建视图
CREATE VIEW project_knowledge AS
SELECT 
    m.id,
    m.project_id,
    p.name as project_name,
    m.content,
    m.tags,
    m.importance,
    m.created_at
FROM memories m
LEFT JOIN projects p ON m.project_id = p.id
ORDER BY m.importance DESC, m.created_at DESC;
```

---

## 📊 性能考虑

### 1. 分区（可选）

```sql
-- 按项目分区（适用于大量项目）
CREATE TABLE memories_partitioned (
    LIKE memories INCLUDING ALL
) PARTITION BY LIST (project_id);

-- 为每个项目创建分区
CREATE TABLE memories_project_1 PARTITION OF memories_partitioned
    FOR VALUES IN ('project-1-uuid');
```

### 2. 物化视图（统计）

```sql
-- 知识统计物化视图
CREATE MATERIALIZED VIEW knowledge_stats_mv AS
SELECT 
    project_id,
    COUNT(*) as total_knowledge,
    AVG(importance) as avg_importance
FROM memories
GROUP BY project_id;

-- 定期刷新
REFRESH MATERIALIZED VIEW knowledge_stats_mv;
```

### 3. 连接池

```typescript
// 使用连接池减少连接开销
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## ✅ 设计原则

1. **统一存储** - 所有项目知识存储在同一表
2. **灵活查询** - 支持多种查询方式
3. **高效索引** - 覆盖常用查询场景
4. **可扩展** - 支持向量搜索、分区
5. **数据完整性** - 外键约束、唯一约束

---

**创建时间**: 2026-03-16  
**状态**: 完整数据库设计  
**下一步**: 学习 Prompt 模板设计
