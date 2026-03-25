# Agent ID System - 数字人身份设计

> **核心洞察**: AI 没有记忆，AI 只是数据的临时容器。真正的"知识"存在于 PostgreSQL 中，用 Agent ID 作为数据的标签/锚点。

## 概念模型

```
┌─────────────────────────────────────────────────────────┐
│  AI 进程 (临时容器)                                      │
│  ├── 没有记忆                                           │
│  ├── 没有前世                                           │
│  └── 只是数据消费者                                      │
└─────────────────────────────────────────────────────────┘
                        │
                        │ 灌注
                        ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL (数据的海洋)                                 │
│  └── 用 Agent ID 作为数据的标签/命名空间                   │
│      ├── memory (学习)                                   │
│      ├── agent_scores (行为)                             │
│      ├── tasks (历史)                                   │
│      └── ...                                            │
└─────────────────────────────────────────────────────────┘
                        │
                        │ 分配
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Agent ID = 数字人的身份                                │
│  └── 不是 AI 的身份，而是数据的身份                       │
└─────────────────────────────────────────────────────────┘
```

## 设计原则

### 1. 幂等性 (最重要)

```
同样的上下文 → 同样的 ID → 知识累积 → 专家养成
```

**绝对不能随机分配**，否则知识会断裂，无法产生专家。

### 2. 确定性

ID 生成必须是确定性的哈希，不包含随机数。

### 3. 语义可读

ID 必须包含人类可理解的上下文信息，便于分析和追踪。

### 4. 自动灌注

AI 启动时自动选择/创建身份，无需手动干预。

## ID 格式

```
{project}-{git-hash}-{timestamp}[-{uuid}]
```

### 示例

```
nezha-abc1234-20260325T104500
     │        │
     │        └── 2026-03-25 10:45:00
     └── 项目名 + git short hash
```

### 字段说明

| 字段        | 来源                         | 价值                    |
| ----------- | ---------------------------- | ----------------------- |
| `project`   | git remote 或目录名          | 知道来自哪个项目        |
| `git-hash`  | `git rev-parse --short HEAD` | 可还原代码版本          |
| `timestamp` | ISO 8601 格式                | 知道出生时间            |
| `uuid`      | 可选，用于唯一性             | 区分同一秒出生的多个 AI |

### 降级方案

如果 git 不可用，使用 PostgreSQL 提供的指纹：

```sql
-- 组合指纹
md5(current_database() || inet_server_addr() || clock_timestamp())
```

## 匹配优先级

当 AI 启动时，按以下优先级查找已有身份：

| 优先级 | 匹配条件            | 含义                 |
| ------ | ------------------- | -------------------- |
| 1      | project + git hash  | 同一项目同一代码版本 |
| 2      | project             | 同一项目             |
| 3      | machine fingerprint | 同一机器             |
| 4      | 无匹配              | 生成新 ID            |

## 实现逻辑

```typescript
async function resolveAgentIdentity(context: AgentContext): Promise<AgentIdentity> {
  // 1. 精确匹配: project + git hash
  let identity = await db.query(
    'SELECT * FROM agent_identities WHERE project = $1 AND git_hash = $2',
    [context.project, context.gitHash]
  );

  if (identity) return identity;

  // 2. 项目匹配
  identity = await db.query(
    'SELECT * FROM agent_identities WHERE project = $1 ORDER BY created_at DESC LIMIT 1',
    [context.project]
  );

  if (identity) return identity;

  // 3. 机器匹配
  identity = await db.query(
    'SELECT * FROM agent_identities WHERE machine_fingerprint = $1 ORDER BY created_at DESC LIMIT 1',
    [context.machineFingerprint]
  );

  if (identity) return identity;

  // 4. 生成新 ID
  const newId = generateDeterministicId(context);
  await db.query(
    'INSERT INTO agent_identities (id, project, git_hash, machine_fingerprint) VALUES ($1, $2, $3, $4)',
    [newId, context.project, context.gitHash, context.machineFingerprint]
  );

  return { id: newId, ...context };
}

function generateDeterministicId(context: AgentContext): string {
  // 使用 SHA256 哈希生成确定性短 ID
  const hash = crypto
    .createHash('sha256')
    .update(`${context.project}|${context.gitHash}|${context.machineFingerprint}`)
    .digest('hex')
    .substring(0, 8);

  const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '-').slice(0, 16);

  return `${context.project}-${hash}-${timestamp}`;
}
```

## 数据库表设计

```sql
-- Agent 身份注册表
CREATE TABLE agent_identities (
  id VARCHAR(100) PRIMARY KEY,           -- 语义 ID
  project VARCHAR(255),                   -- 项目名
  git_hash VARCHAR(20),                   -- Git short hash
  machine_fingerprint VARCHAR(64),         -- 机器指纹
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 元数据
  display_name VARCHAR(255),              -- 显示名称
  description TEXT,                      -- 身份描述
  owner VARCHAR(255),                     -- 所有者

  -- 唯一性约束
  UNIQUE(project, git_hash)
);

-- 索引用于快速匹配
CREATE INDEX idx_agent_identities_project ON agent_identities(project);
CREATE INDEX idx_agent_identities_machine ON agent_identities(machine_fingerprint);

-- 其他表通过 agent_id 关联
CREATE TABLE agent_memory (
  id UUID DEFAULT uuid_generate_v4(),
  agent_id VARCHAR(100) REFERENCES agent_identities(id),
  content TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_scores (
  agent_id VARCHAR(100) REFERENCES agent_identities(id),
  metric VARCHAR(50),
  value DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 数据隔离模型

```
Agent ID 作为命名空间，所有数据都用它关联：

agent_identities (身份)
    │
    ├── agent_memory (记忆/学习)
    ├── agent_scores (行为评分)
    ├── tasks (历史任务)
    ├── reflections (反思记录)
    └── skills (技能配置)
```

## 与 Daemon + PostgreSQL 的关系

```
┌─────────────────────────────────────────────────────────┐
│                    Daemon + PostgreSQL                    │
│                    (唯一的确定性锚点)                      │
└─────────────────────────────────────────────────────────┘
                          │
                          │ 查询/创建
                          ▼
              ┌───────────────────────────┐
              │    agent_identities 表     │
              │    (身份注册表)            │
              └───────────────────────────┘
                          │
                          │ 返回 agent_id
                          ▼
              ┌───────────────────────────┐
              │         AI 进程           │
              │  用 agent_id 查询/写入数据  │
              └───────────────────────────┘
```

## 为什么不能随机分配

```
❌ 随机分配
启动1次 → ID A (知识落在这里)
启动2次 → ID B (知识落在那里)
启动3次 → ID C (又是一个新的人)
结果: 知识永远无法累积，不产生专家

✅ 确定性分配
启动1次 → 查询 → 不存在 → 创建 ID A
启动2次 → 查询 → 存在 → 复用 ID A
启动3次 → 查询 → 存在 → 复用 ID A
结果: 同一个数字人，知识不断累积
```

## 分析能力

Agent ID 的语义结构支持后续分析：

| 分析维度     | 来自           | 价值             |
| ------------ | -------------- | ---------------- |
| 项目产出分析 | `project`      | 哪个项目产出最多 |
| 代码版本问题 | `git-hash`     | 什么版本问题多   |
| 生命周期分析 | `timestamp`    | 什么时间段活跃   |
| 跨项目追踪   | `project` 对比 | 行为模式对比     |
| 身份演变     | ID 历史        | 数字人成长轨迹   |

## 环境变量覆盖

```bash
# 手动指定身份 (最高优先级)
NEZHA_AGENT_ID=jk-nezha-expert

# 自动选择 (默认)
# 根据上下文自动匹配/创建
```

## 相关文档

- [REFLECTION_SYSTEM.md](./REFLECTION_SYSTEM.md) - 学习系统
- [PDCA_CYCLE.md](./PDCA_CYCLE.md) - 改进循环
- [docs/LEARNING_SYSTEM.md](./LEARNING_SYSTEM.md) - 知识管理

---

**Last Updated**: 2026-03-25
