# Memory Skills API Specification

**创建时间**: 2026-03-16  
**状态**: 详细 API 设计

---

## 🎯 概述

Memory Skills 是学习系统的基础工具，提供知识的存储、检索和关联功能。

---

## 📊 API 设计

### 1. memory_save

**描述**: 存储学到的知识到永久记忆

**参数**:

```typescript
interface MemorySaveParams {
  // 必需参数
  content: string;           // 知识内容
  
  // 可选参数
  project_id?: string;       // 项目 ID（可选，通用知识不设置）
  tags?: string[];           // 标签数组
  context?: string;          // 上下文说明
  source?: string;           // 知识来源
  importance?: number;       // 重要性 1-10（默认 5）
  metadata?: Record<string, any>;  // 额外元数据
}
```

**返回值**:

```typescript
interface MemorySaveResult {
  success: boolean;
  memory_id: string;         // 生成的 UUID
  message: string;           // 操作结果消息
}
```

**示例**:

```typescript
// 存储项目特定知识
await memory_save({
  content: "OpenClaw uses while(true) + waitForever() to achieve continuous operation",
  project_id: "nezha-project-id",
  tags: ["pattern", "architecture", "continuous-running", "nodejs"],
  context: "Useful when building services that need to run 24/7 without exiting",
  source: "OpenClaw monitor.ts analysis",
  importance: 9
});

// 存储通用知识
await memory_save({
  content: "Using SKIP LOCKED in PostgreSQL provides safe concurrent task processing",
  tags: ["pattern", "postgresql", "concurrency", "general"],
  context: "Applicable to any project using PostgreSQL for task queues",
  importance: 10
});
```

**错误处理**:

```typescript
// 错误类型
interface MemorySaveError {
  code: 'INVALID_CONTENT' | 'DATABASE_ERROR' | 'PERMISSION_DENIED';
  message: string;
  details?: any;
}

// 错误示例
throw {
  code: 'INVALID_CONTENT',
  message: 'Content cannot be empty',
  details: { received: '' }
};
```

---

### 2. memory_search

**描述**: 检索相关知识

**参数**:

```typescript
interface MemorySearchParams {
  // 必需参数（至少一个）
  query?: string;            // 搜索关键词
  tags?: string[];           // 标签过滤
  project_id?: string;       // 项目过滤
  
  // 可选参数
  limit?: number;            // 返回数量限制（默认 10）
  offset?: number;           // 偏移量（分页）
  min_importance?: number;   // 最小重要性
  include_general?: boolean; // 是否包含通用知识（默认 true）
  sort_by?: 'importance' | 'created_at' | 'relevance';  // 排序方式
}
```

**返回值**:

```typescript
interface MemorySearchResult {
  success: boolean;
  memories: Memory[];
  total: number;             // 总数量
  query_time_ms: number;     // 查询耗时
}

interface Memory {
  id: string;                // UUID
  project_id: string | null; // 项目 ID（null 表示通用知识）
  content: string;           // 知识内容
  tags: string[];            // 标签
  context: string | null;    // 上下文
  source: string | null;     // 来源
  importance: number;        // 重要性
  metadata: Record<string, any> | null;  // 元数据
  created_at: string;        // 创建时间
  updated_at: string;        // 更新时间
}
```

**示例**:

```typescript
// 按关键词搜索
const result = await memory_search({
  query: "continuous running",
  limit: 5
});

// 按标签搜索
const result = await memory_search({
  tags: ["pattern", "postgresql"],
  limit: 10
});

// 搜索项目知识 + 通用知识
const result = await memory_search({
  project_id: "nezha-project-id",
  include_general: true,
  min_importance: 7
});

// 组合搜索
const result = await memory_search({
  query: "error handling",
  tags: ["pattern"],
  project_id: "current-project",
  include_general: true,
  min_importance: 5,
  limit: 10,
  sort_by: 'importance'
});
```

---

### 3. memory_link

**描述**: 关联两个知识点

**参数**:

```typescript
interface MemoryLinkParams {
  // 必需参数
  source_id: string;         // 源知识 ID
  target_id: string;         // 目标知识 ID
  relationship: string;      // 关系类型
  
  // 可选参数
  metadata?: Record<string, any>;  // 关系元数据
}
```

**关系类型**:

```typescript
type RelationshipType = 
  | 'applied-to'        // 应用到
  | 'derived-from'      // 衍生自
  | 'related-to'        // 相关
  | 'contradicts'       // 矛盾
  | 'extends'           // 扩展
  | 'alternative-to'    // 替代方案
  | 'prerequisite-of'   // 前置条件
  | 'follows';          // 后续
```

**返回值**:

```typescript
interface MemoryLinkResult {
  success: boolean;
  link_id: string;           // 关联 ID
  message: string;
}
```

**示例**:

```typescript
// 建立应用关系
await memory_link({
  source_id: "openclaw-pattern-id",
  target_id: "nezha-implementation-id",
  relationship: "applied-to",
  metadata: {
    applied_at: "2026-03-16",
    modified: false
  }
});

// 建立衍生关系
await memory_link({
  source_id: "general-pattern-id",
  target_id: "project-specific-id",
  relationship: "derived-from"
});
```

---

### 4. memory_get

**描述**: 获取单个知识的详细信息

**参数**:

```typescript
interface MemoryGetParams {
  memory_id: string;         // 知识 ID
  include_links?: boolean;   // 是否包含关联知识（默认 false）
}
```

**返回值**:

```typescript
interface MemoryGetResult {
  success: boolean;
  memory: Memory;
  links?: MemoryLink[];      // 关联知识
}

interface MemoryLink {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  metadata: Record<string, any> | null;
  created_at: string;
  
  // 如果 include_links=true，包含关联的知识详情
  source_memory?: Memory;
  target_memory?: Memory;
}
```

**示例**:

```typescript
// 获取知识详情
const result = await memory_get({
  memory_id: "knowledge-uuid"
});

// 获取知识详情 + 关联知识
const result = await memory_get({
  memory_id: "knowledge-uuid",
  include_links: true
});
```

---

### 5. memory_update

**描述**: 更新已有知识

**参数**:

```typescript
interface MemoryUpdateParams {
  memory_id: string;         // 知识 ID
  
  // 可更新字段
  content?: string;          // 新内容
  tags?: string[];           // 新标签
  context?: string;          // 新上下文
  importance?: number;       // 新重要性
  metadata?: Record<string, any>;  // 新元数据
}
```

**返回值**:

```typescript
interface MemoryUpdateResult {
  success: boolean;
  memory: Memory;            // 更新后的知识
  message: string;
}
```

**示例**:

```typescript
// 更新重要性
await memory_update({
  memory_id: "knowledge-uuid",
  importance: 10
});

// 更新内容
await memory_update({
  memory_id: "knowledge-uuid",
  content: "Updated knowledge content",
  tags: ["pattern", "updated"]
});
```

---

### 6. memory_delete

**描述**: 删除知识

**参数**:

```typescript
interface MemoryDeleteParams {
  memory_id: string;         // 知识 ID
  cascade?: boolean;         // 是否级联删除关联（默认 false）
}
```

**返回值**:

```typescript
interface MemoryDeleteResult {
  success: boolean;
  deleted_links: number;     // 删除的关联数量
  message: string;
}
```

**示例**:

```typescript
// 删除知识
await memory_delete({
  memory_id: "knowledge-uuid"
});

// 删除知识 + 关联
await memory_delete({
  memory_id: "knowledge-uuid",
  cascade: true
});
```

---

## 📊 完整类型定义

```typescript
// src/skills/memory.ts

export interface Memory {
  id: string;
  project_id: string | null;
  content: string;
  tags: string[];
  context: string | null;
  source: string | null;
  importance: number;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryLink {
  id: string;
  source_id: string;
  target_id: string;
  relationship: RelationshipType;
  metadata: Record<string, any> | null;
  created_at: string;
}

export type RelationshipType = 
  | 'applied-to'
  | 'derived-from'
  | 'related-to'
  | 'contradicts'
  | 'extends'
  | 'alternative-to'
  | 'prerequisite-of'
  | 'follows';

// Skill 定义
export const memorySkills = {
  memory_save: {
    description: "Save learned knowledge to permanent memory",
    parameters: MemorySaveParamsSchema,
    execute: (params: MemorySaveParams) => Promise<MemorySaveResult>
  },
  
  memory_search: {
    description: "Search for relevant knowledge in memory",
    parameters: MemorySearchParamsSchema,
    execute: (params: MemorySearchParams) => Promise<MemorySearchResult>
  },
  
  memory_link: {
    description: "Connect related pieces of knowledge",
    parameters: MemoryLinkParamsSchema,
    execute: (params: MemoryLinkParams) => Promise<MemoryLinkResult>
  },
  
  memory_get: {
    description: "Get detailed information about a specific knowledge",
    parameters: MemoryGetParamsSchema,
    execute: (params: MemoryGetParams) => Promise<MemoryGetResult>
  },
  
  memory_update: {
    description: "Update existing knowledge",
    parameters: MemoryUpdateParamsSchema,
    execute: (params: MemoryUpdateParams) => Promise<MemoryUpdateResult>
  },
  
  memory_delete: {
    description: "Delete knowledge from memory",
    parameters: MemoryDeleteParamsSchema,
    execute: (params: MemoryDeleteParams) => Promise<MemoryDeleteResult>
  }
};
```

---

## 🎯 使用场景

### 场景 1: 学习新知识

```typescript
// AI 完成一个任务后，自动学习
const learned = await memory_save({
  content: "OpenClaw uses while(true) + waitForever() for continuous operation",
  tags: ["pattern", "continuous-running", "nodejs"],
  context: "Useful for 24/7 services",
  importance: 9
});
```

### 场景 2: 应用已有知识

```typescript
// AI 遇到问题，搜索相关知识
const knowledge = await memory_search({
  query: "continuous running service",
  tags: ["pattern"],
  limit: 5
});

// 找到知识后应用
// ... 实现代码 ...

// 记录应用关系
await memory_link({
  source_id: knowledge.memories[0].id,
  target_id: newImplementationId,
  relationship: "applied-to"
});
```

### 场景 3: 知识发现

```typescript
// 查找所有高重要性知识
const important = await memory_search({
  min_importance: 8,
  limit: 20,
  sort_by: 'importance'
});

// 发现知识网络
for (const memory of important.memories) {
  const details = await memory_get({
    memory_id: memory.id,
    include_links: true
  });
  
  console.log(`Knowledge: ${memory.content}`);
  console.log(`Links: ${details.links?.length || 0}`);
}
```

---

## ✅ 设计原则

1. **简单易用** - 参数直观，返回清晰
2. **灵活查询** - 支持多种搜索方式
3. **知识关联** - 支持建立知识网络
4. **错误处理** - 清晰的错误类型和消息
5. **性能优化** - 支持分页、索引

---

**创建时间**: 2026-03-16  
**状态**: 详细 API 设计  
**下一步**: 数据库 Schema 设计
