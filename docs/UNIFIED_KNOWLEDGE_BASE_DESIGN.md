# Unified Knowledge Base Design

**创建时间**: 2026-03-16  
**状态**: 核心架构决策

---

## 🎯 核心理念

**PostgreSQL 打通所有项目，为学习创造条件**

学到的知识可以用在任何项目中，只需要通过数据库查询来限制范围。知识本身是无界限的。

---

## 📊 传统方式 vs Nezha 方式

### 传统方式：项目隔离

```
┌─────────────────────────────────────────────────────────┐
│              传统方式：项目隔离的知识                     │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Project A  │  │  Project B  │  │  Project C  │    │
│  │             │  │             │  │             │    │
│  │ Knowledge A │  │ Knowledge B │  │ Knowledge C │    │
│  │             │  │             │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│        │                │                │              │
│        └────────────────┼────────────────┘              │
│                         │                               │
│                    ❌ 无法共享                           │
│                    ❌ 重复学习                           │
│                    ❌ 知识孤岛                           │
└─────────────────────────────────────────────────────────┘
```

**问题**:
- ❌ 知识无法跨项目共享
- ❌ 需要在每个项目中重复学习
- ❌ 项目边界限制知识流动
- ❌ 无法利用其他项目的经验

### Nezha 方式：统一知识库

```
┌─────────────────────────────────────────────────────────┐
│              Nezha 方式：统一知识库                       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Project A  │  │  Project B  │  │  Project C  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│        │                │                │              │
│        └────────────────┼────────────────┘              │
│                         │                               │
│                         ↓                               │
│              ┌─────────────────────┐                    │
│              │   PostgreSQL        │                    │
│              │   Unified Knowledge │                    │
│              │                     │                    │
│              │  • Knowledge A      │                    │
│              │  • Knowledge B      │                    │
│              │  • Knowledge C      │                    │
│              │  • Shared Knowledge │                    │
│              └─────────────────────┘                    │
│                         │                               │
│                    ✅ 统一存储                           │
│                    ✅ 跨项目共享                         │
│                    ✅ 一次学习，处处可用                  │
│                    ✅ 无界限知识管理                     │
└─────────────────────────────────────────────────────────┘
```

**优势**:
- ✅ 知识统一存储在 PostgreSQL
- ✅ 可以跨项目共享知识
- ✅ 一次学习，处处可用
- ✅ 无界限的知识管理

---

## 🏗️ 数据库设计

### 统一的 memories 表

```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),  -- 可选，项目关联
    content TEXT NOT NULL,                     -- 知识内容
    tags TEXT[],                               -- 标签
    context TEXT,                              -- 上下文
    source TEXT,                               -- 来源
    importance INTEGER DEFAULT 5,              -- 重要性 1-10
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 可选：向量搜索
    embedding vector(1536)
);

-- 索引
CREATE INDEX idx_memories_project ON memories(project_id);
CREATE INDEX idx_memories_tags ON memories USING GIN(tags);
CREATE INDEX idx_memories_importance ON memories(importance);
```

### 关键设计决策

**1. project_id 可选**

```sql
-- 项目特定知识
INSERT INTO memories (project_id, content, tags)
VALUES ('project-a-id', 'Project A specific knowledge', ARRAY['project-a']);

-- 通用知识（无项目限制）
INSERT INTO memories (content, tags)
VALUES ('General knowledge applicable to all projects', ARRAY['general']);
```

**为什么可选？**
- ✅ 允许存储通用知识
- ✅ 知识可以在项目间共享
- ✅ 不受项目边界限制

**2. 标签系统**

```sql
-- 通过标签分类知识
tags: ['pattern', 'architecture', 'continuous-running', 'nodejs']

-- 通过标签查询
SELECT * FROM memories WHERE 'pattern' = ANY(tags);
SELECT * FROM memories WHERE tags @> ARRAY['pattern', 'nodejs'];
```

**为什么用标签？**
- ✅ 灵活的知识分类
- ✅ 跨项目知识发现
- ✅ 多维度知识组织

---

## 📊 知识共享示例

### 场景 1: 在 Nezha 项目学习，应用到 GitBrain 项目

```sql
-- 在 Nezha 项目学习
INSERT INTO memories (project_id, content, tags, context, importance)
VALUES (
    'nezha-project-id',
    'OpenClaw uses while(true) + waitForever() to achieve continuous operation',
    ARRAY['pattern', 'architecture', 'continuous-running', 'nodejs'],
    'Useful for 24/7 services',
    9
);

-- 在 GitBrain 项目应用
-- 查询所有相关知识（不限项目）
SELECT * FROM memories 
WHERE tags @> ARRAY['continuous-running', 'nodejs']
ORDER BY importance DESC;

-- 结果：找到在 Nezha 学到的知识
-- AI 可以直接应用，不需要重新学习！
```

### 场景 2: 发现通用模式，应用到所有项目

```sql
-- 发现通用模式（无项目限制）
INSERT INTO memories (content, tags, context, importance)
VALUES (
    'Using SKIP LOCKED in PostgreSQL provides safe concurrent task processing',
    ARRAY['pattern', 'postgresql', 'concurrency', 'general'],
    'Applicable to any project using PostgreSQL for task queues',
    10
);

-- 所有项目都可以查询到这个知识
SELECT * FROM memories 
WHERE 'general' = ANY(tags) AND 'postgresql' = ANY(tags);

-- 结果：所有项目都能学到这个通用模式
```

### 场景 3: 项目特定知识 + 通用知识

```sql
-- 查询项目特定知识 + 通用知识
SELECT * FROM memories 
WHERE project_id = 'current-project-id' 
   OR project_id IS NULL  -- 通用知识
ORDER BY importance DESC;

-- 结果：既看到项目特定知识，也看到通用知识
-- AI 可以综合应用
```

---

## 🎯 知识范围控制

### 通过查询限制范围

```typescript
// 1. 只查询当前项目的知识
async function getProjectKnowledge(projectId: string): Promise<Memory[]> {
  return await db.query(
    `SELECT * FROM memories WHERE project_id = $1 ORDER BY importance DESC`,
    [projectId]
  );
}

// 2. 查询当前项目 + 通用知识
async function getProjectAndGeneralKnowledge(projectId: string): Promise<Memory[]> {
  return await db.query(
    `SELECT * FROM memories 
     WHERE project_id = $1 OR project_id IS NULL 
     ORDER BY importance DESC`,
    [projectId]
  );
}

// 3. 查询特定标签的知识（跨项目）
async function getKnowledgeByTags(tags: string[]): Promise<Memory[]> {
  return await db.query(
    `SELECT * FROM memories WHERE tags @> $1 ORDER BY importance DESC`,
    [tags]
  );
}

// 4. 查询所有知识（无限制）
async function getAllKnowledge(): Promise<Memory[]> {
  return await db.query(
    `SELECT * FROM memories ORDER BY importance DESC`
  );
}
```

### 灵活的范围控制

```
┌─────────────────────────────────────────────────────────┐
│              知识范围控制                                 │
│                                                          │
│  最小范围：                                               │
│  SELECT * FROM memories WHERE project_id = 'current'    │
│  → 只看当前项目                                           │
│                                                          │
│  中等范围：                                               │
│  SELECT * FROM memories                                  │
│  WHERE project_id = 'current' OR project_id IS NULL     │
│  → 当前项目 + 通用知识                                    │
│                                                          │
│  大范围：                                                 │
│  SELECT * FROM memories WHERE tags @> ARRAY['pattern']  │
│  → 特定标签的所有知识                                     │
│                                                          │
│  最大范围：                                               │
│  SELECT * FROM memories                                  │
│  → 所有知识（无界限）                                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 实际应用场景

### 场景 1: 新项目启动

```
新项目: coffeeclaw
    ↓
查询通用知识:
SELECT * FROM memories WHERE project_id IS NULL
    ↓
发现:
- "Using SKIP LOCKED for safe concurrent processing"
- "while(true) + waitForever() for continuous running"
- "PostgreSQL connection pooling best practices"
    ↓
直接应用，不需要重新学习！
```

### 场景 2: 跨项目学习

```
项目 A (Nezha) 学到:
- "OpenClaw's continuous running pattern"

项目 B (GitBrain) 遇到问题:
- "How to make service run continuously?"

查询知识:
SELECT * FROM memories WHERE tags @> ARRAY['continuous-running']
    ↓
找到 Nezha 学到的知识
    ↓
直接应用，不需要重新学习！
```

### 场景 3: 知识积累

```
时间线:
────────────────────────────────────────────────────
Day 1: Nezha 学到 "continuous running pattern"
Day 2: GitBrain 学到 "PostgreSQL optimization"
Day 3: CoffeeClaw 学到 "Error handling pattern"
...
Day N: 所有知识积累在统一数据库
    ↓
新项目启动时，所有知识都可用！
```

---

## 📊 对比总结

| 维度 | 传统方式 | Nezha 统一知识库 |
|------|---------|-----------------|
| **知识存储** | 项目隔离 | 统一 PostgreSQL |
| **知识共享** | ❌ 无法共享 | ✅ 跨项目共享 |
| **学习效率** | ❌ 重复学习 | ✅ 一次学习，处处可用 |
| **知识边界** | ❌ 项目边界限制 | ✅ 无界限 |
| **范围控制** | ❌ 固定范围 | ✅ 灵活查询控制 |
| **知识积累** | ❌ 分散 | ✅ 统一积累 |

---

## 🎯 设计原则

### 1. 知识无界限

```sql
-- 知识本身不应该有边界
-- 通过查询来限制范围，而不是通过存储
INSERT INTO memories (content, tags)  -- 无 project_id
VALUES ('Universal knowledge', ARRAY['general']);
```

### 2. 灵活范围控制

```typescript
// 通过查询控制范围，而不是硬编码
const scope = {
  projectOnly: `WHERE project_id = $1`,
  projectAndGeneral: `WHERE project_id = $1 OR project_id IS NULL`,
  byTags: `WHERE tags @> $1`,
  all: ``
};
```

### 3. 知识关联

```sql
-- 建立知识之间的关联
CREATE TABLE memory_links (
    source_id UUID REFERENCES memories(id),
    target_id UUID REFERENCES memories(id),
    relationship TEXT,
    PRIMARY KEY (source_id, target_id)
);

-- 查询关联知识
SELECT m.* FROM memories m
JOIN memory_links l ON m.id = l.target_id
WHERE l.source_id = 'knowledge-id';
```

---

## ✅ 核心优势

**PostgreSQL 打通所有项目的核心优势**:

1. ✅ **为学习创造条件** - 知识可以在项目间流动
2. ✅ **一次学习，处处可用** - 不需要重复学习
3. ✅ **灵活范围控制** - 通过查询限制范围
4. ✅ **无界限知识管理** - 知识本身不受项目限制
5. ✅ **知识积累效应** - 随时间积累，越来越有价值

---

**创建时间**: 2026-03-16  
**状态**: 核心架构决策  
**核心理念**: PostgreSQL 打通所有项目，为学习创造条件
