# Testing Strategy

**创建时间**: 2026-03-16  
**状态**: 完整测试策略

---

## 🎯 概述

学习系统的测试策略，确保功能正确性和系统稳定性。

---

## 📊 测试层次

```
┌─────────────────────────────────────────────────────────┐
│                    Testing Pyramid                       │
│                                                          │
│                    ┌─────────┐                          │
│                    │   E2E   │                          │
│                    │  Tests  │                          │
│                    └─────────┘                          │
│                 ┌───────────────┐                       │
│                 │ Integration   │                       │
│                 │    Tests      │                       │
│                 └───────────────┘                       │
│            ┌───────────────────────┐                    │
│            │     Unit Tests        │                    │
│            └───────────────────────┘                    │
│       ┌─────────────────────────────────┐              │
│       │        Database Tests           │              │
│       └─────────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 测试类型

### 1. 数据库测试

**目标**: 验证数据库操作的正确性

**位置**: `src/__tests__/db/`

```typescript
// memories.test.ts

describe('Memories Table', () => {
  beforeEach(async () => {
    // 清空测试数据
    await db.query('DELETE FROM memories');
  });
  
  test('should insert memory', async () => {
    const result = await db.query(
      `INSERT INTO memories (content, tags, importance)
       VALUES ($1, $2, $3)
       RETURNING *`,
      ['Test knowledge', ['test'], 5]
    );
    
    expect(result.rows[0].id).toBeDefined();
    expect(result.rows[0].content).toBe('Test knowledge');
    expect(result.rows[0].tags).toEqual(['test']);
  });
  
  test('should search by tags', async () => {
    // 插入测试数据
    await db.query(
      `INSERT INTO memories (content, tags, importance)
       VALUES 
         ('Knowledge 1', ARRAY['pattern', 'nodejs'], 7),
         ('Knowledge 2', ARRAY['pattern', 'python'], 8)`
    );
    
    // 搜索
    const result = await db.query(
      `SELECT * FROM memories WHERE tags @> ARRAY['pattern']`
    );
    
    expect(result.rows.length).toBe(2);
  });
  
  test('should create memory link', async () => {
    // 创建两个知识
    const source = await db.query(
      `INSERT INTO memories (content) VALUES ('Source') RETURNING id`
    );
    const target = await db.query(
      `INSERT INTO memories (content) VALUES ('Target') RETURNING id`
    );
    
    // 创建关联
    const link = await db.query(
      `INSERT INTO memory_links (source_id, target_id, relationship)
       VALUES ($1, $2, 'applied-to')
       RETURNING *`,
      [source.rows[0].id, target.rows[0].id]
    );
    
    expect(link.rows[0].relationship).toBe('applied-to');
  });
});
```

---

### 2. 单元测试

**目标**: 测试单个函数和类的正确性

**位置**: `src/__tests__/unit/`

#### 2.1 Memory Skills 测试

```typescript
// memory-skills.test.ts

describe('Memory Skills', () => {
  describe('memory_save', () => {
    test('should save knowledge with all fields', async () => {
      const result = await memory_save({
        content: "OpenClaw uses while(true) + waitForever()",
        project_id: "test-project-id",
        tags: ["pattern", "continuous-running"],
        context: "Useful for 24/7 services",
        source: "OpenClaw analysis",
        importance: 9
      });
      
      expect(result.success).toBe(true);
      expect(result.memory_id).toBeDefined();
    });
    
    test('should save general knowledge without project_id', async () => {
      const result = await memory_save({
        content: "General knowledge",
        tags: ["general"],
        importance: 5
      });
      
      expect(result.success).toBe(true);
    });
    
    test('should reject empty content', async () => {
      await expect(memory_save({
        content: "",
        importance: 5
      })).rejects.toThrow('INVALID_CONTENT');
    });
    
    test('should validate importance range', async () => {
      await expect(memory_save({
        content: "Test",
        importance: 11
      })).rejects.toThrow();
    });
  });
  
  describe('memory_search', () => {
    test('should search by query', async () => {
      // 先存储
      await memory_save({
        content: "Continuous running pattern",
        tags: ["pattern"],
        importance: 8
      });
      
      // 搜索
      const result = await memory_search({
        query: "continuous",
        limit: 5
      });
      
      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.memories[0].content).toContain('Continuous');
    });
    
    test('should search by tags', async () => {
      await memory_save({
        content: "Pattern 1",
        tags: ["pattern", "nodejs"],
        importance: 7
      });
      
      const result = await memory_search({
        tags: ["nodejs"],
        limit: 5
      });
      
      expect(result.memories.length).toBeGreaterThan(0);
    });
    
    test('should filter by importance', async () => {
      await memory_save({
        content: "Important knowledge",
        tags: ["test"],
        importance: 9
      });
      
      await memory_save({
        content: "Less important",
        tags: ["test"],
        importance: 3
      });
      
      const result = await memory_search({
        tags: ["test"],
        min_importance: 8
      });
      
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].importance).toBe(9);
    });
  });
  
  describe('memory_link', () => {
    test('should create link between memories', async () => {
      const source = await memory_save({
        content: "Source knowledge",
        importance: 5
      });
      
      const target = await memory_save({
        content: "Target knowledge",
        importance: 5
      });
      
      const link = await memory_link({
        source_id: source.memory_id,
        target_id: target.memory_id,
        relationship: "applied-to"
      });
      
      expect(link.success).toBe(true);
    });
    
    test('should reject invalid relationship', async () => {
      const source = await memory_save({
        content: "Source",
        importance: 5
      });
      
      const target = await memory_save({
        content: "Target",
        importance: 5
      });
      
      await expect(memory_link({
        source_id: source.memory_id,
        target_id: target.memory_id,
        relationship: "invalid-relationship"
      })).rejects.toThrow();
    });
  });
});
```

#### 2.2 Prompt Builder 测试

```typescript
// prompt-builder.test.ts

describe('PromptBuilder', () => {
  test('should build system prompt with knowledge', async () => {
    const builder = new PromptBuilder();
    
    // 存储测试知识
    await memory_save({
      content: "Test knowledge",
      tags: ["test"],
      importance: 8
    });
    
    const prompt = await builder.buildSystemPrompt(
      BASE_PROMPT,
      { task: "Test task", projectId: "test-project" }
    );
    
    expect(prompt).toContain('Test knowledge');
    expect(prompt).toContain('Learning and Knowledge Management');
  });
  
  test('should not include low importance knowledge', async () => {
    const builder = new PromptBuilder();
    
    await memory_save({
      content: "Low importance",
      tags: ["test"],
      importance: 3
    });
    
    const prompt = await builder.buildSystemPrompt(
      BASE_PROMPT,
      { task: "Test task", projectId: "test-project" }
    );
    
    expect(prompt).not.toContain('Low importance');
  });
});
```

---

### 3. 集成测试

**目标**: 测试组件之间的协作

**位置**: `src/__tests__/integration/`

```typescript
// learning-system.test.ts

describe('Learning System Integration', () => {
  test('should learn from task completion', async () => {
    const agent = new Agent();
    
    // 执行任务
    const result = await agent.executeTask(
      "Implement continuous running mechanism",
      { projectId: "test-project" }
    );
    
    // 验证学习
    const knowledge = await memory_search({
      query: "continuous running",
      limit: 1
    });
    
    expect(knowledge.memories.length).toBeGreaterThan(0);
  });
  
  test('should apply learned knowledge', async () => {
    // 先学习
    await memory_save({
      content: "Use while(true) + waitForever() for continuous running",
      tags: ["pattern", "continuous-running"],
      importance: 9
    });
    
    const agent = new Agent();
    
    // 执行相关任务
    const result = await agent.executeTask(
      "How to make service run continuously?",
      { projectId: "test-project" }
    );
    
    // 验证应用了知识
    expect(result.response).toContain('while(true)');
    expect(result.response).toContain('waitForever()');
  });
  
  test('should link related knowledge', async () => {
    const agent = new Agent();
    
    // 学习知识 A
    const knowledgeA = await memory_save({
      content: "OpenClaw continuous running pattern",
      tags: ["pattern"],
      importance: 9
    });
    
    // 执行任务，应用知识 A
    await agent.executeTask(
      "Implement continuous running in Nezha",
      { projectId: "test-project" }
    );
    
    // 验证建立了关联
    const links = await db.query(
      `SELECT * FROM memory_links WHERE source_id = $1`,
      [knowledgeA.memory_id]
    );
    
    expect(links.rows.length).toBeGreaterThan(0);
    expect(links.rows[0].relationship).toBe('applied-to');
  });
});
```

---

### 4. 端到端测试

**目标**: 测试完整的用户场景

**位置**: `src/__tests__/e2e/`

```typescript
// learning-flow.test.ts

describe('Learning Flow E2E', () => {
  test('complete learning cycle', async () => {
    // 1. 启动系统
    const heartbeat = new HeartbeatService(db);
    await heartbeat.start();
    
    // 2. 添加任务
    await db.query(
      `INSERT INTO tasks (project_id, message, status)
       VALUES ($1, $2, 'pending')`,
      ['test-project', 'Analyze OpenClaw and implement continuous running']
    );
    
    // 3. 等待任务完成
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 4. 验证学习
    const knowledge = await memory_search({
      query: "continuous running",
      limit: 5
    });
    
    expect(knowledge.memories.length).toBeGreaterThan(0);
    
    // 5. 验证应用
    const implementation = await memory_search({
      query: "Nezha implementation",
      limit: 5
    });
    
    expect(implementation.memories.length).toBeGreaterThan(0);
    
    // 6. 验证关联
    const links = await db.query(
      `SELECT * FROM memory_links`
    );
    
    expect(links.rows.length).toBeGreaterThan(0);
    
    // 7. 清理
    await heartbeat.stop();
  });
});
```

---

## 📊 测试数据管理

### 1. 测试数据工厂

```typescript
// test-factory.ts

export class TestFactory {
  static async createMemory(overrides?: Partial<Memory>): Promise<Memory> {
    const defaults = {
      content: "Test knowledge",
      tags: ["test"],
      importance: 5
    };
    
    const result = await memory_save({
      ...defaults,
      ...overrides
    });
    
    return await memory_get({ memory_id: result.memory_id });
  }
  
  static async createProject(overrides?: Partial<Project>): Promise<Project> {
    const result = await db.query(
      `INSERT INTO projects (name, path)
       VALUES ($1, $2)
       RETURNING *`,
      [
        overrides?.name ?? 'Test Project',
        overrides?.path ?? '/test/path'
      ]
    );
    
    return result.rows[0];
  }
  
  static async createTask(overrides?: Partial<Task>): Promise<Task> {
    const result = await db.query(
      `INSERT INTO tasks (project_id, message, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        overrides?.project_id ?? (await this.createProject()).id,
        overrides?.message ?? 'Test task',
        overrides?.status ?? 'pending'
      ]
    );
    
    return result.rows[0];
  }
}
```

### 2. 测试数据清理

```typescript
// test-cleanup.ts

export class TestCleanup {
  static async cleanup(): Promise<void> {
    await db.query('DELETE FROM memory_links');
    await db.query('DELETE FROM memories');
    await db.query('DELETE FROM tasks');
    await db.query('DELETE FROM projects');
  }
}
```

---

## 📊 测试配置

### 1. Jest 配置

```typescript
// jest.config.ts

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### 2. 测试环境设置

```typescript
// setup.ts

import { Pool } from 'pg';
import { TestCleanup } from './test-cleanup';

const pool = new Pool({
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'nezha_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'postgres'
});

beforeAll(async () => {
  // 连接测试数据库
  await pool.connect();
});

afterEach(async () => {
  // 清理测试数据
  await TestCleanup.cleanup();
});

afterAll(async () => {
  // 关闭连接
  await pool.end();
});
```

---

## 📊 性能测试

### 1. 查询性能测试

```typescript
// performance.test.ts

describe('Memory Performance', () => {
  test('search should be fast with many memories', async () => {
    // 创建 1000 条知识
    for (let i = 0; i < 1000; i++) {
      await memory_save({
        content: `Knowledge ${i}`,
        tags: ['test', `tag-${i % 10}`],
        importance: Math.floor(Math.random() * 10) + 1
      });
    }
    
    // 测试搜索性能
    const start = Date.now();
    const result = await memory_search({
      query: "Knowledge",
      tags: ["test"],
      limit: 10
    });
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(100); // < 100ms
    expect(result.memories.length).toBe(10);
  });
  
  test('tag search should use index', async () => {
    // 验证使用了索引
    const result = await db.query(
      `EXPLAIN ANALYZE SELECT * FROM memories WHERE tags @> ARRAY['test']`
    );
    
    expect(result.rows[0]['QUERY PLAN']).toContain('idx_memories_tags');
  });
});
```

---

## 📊 测试覆盖率目标

| 类型 | 目标覆盖率 |
|------|-----------|
| **数据库操作** | 90% |
| **Memory Skills** | 85% |
| **Prompt Builder** | 80% |
| **Integration** | 70% |
| **E2E** | 关键路径 100% |

---

## ✅ 测试原则

1. **快速反馈** - 单元测试 < 1s，集成测试 < 10s
2. **独立性** - 每个测试独立，不依赖其他测试
3. **可重复** - 每次运行结果一致
4. **有意义的断言** - 验证行为，不只是实现
5. **清晰的命名** - 测试名称描述清楚测试内容

---

**创建时间**: 2026-03-16  
**状态**: 完整测试策略  
**下一步**: 提交所有设计文档
