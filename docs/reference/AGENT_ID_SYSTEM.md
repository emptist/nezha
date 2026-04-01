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
S-{source}-{project}-{branch}-{hash}   # Specific: 有项目/git
G-{source}-{machine-fingerprint}-{hash}  # General: 无项目/git
```

### 示例

```
# Nezha Daemon (默认 source=nezha)
S-nezha-nezha.git-minimax2-7-4b0ab6
 ↑     │         │            │
 │     │         │            └── 确定性哈希 (6位)
 │     │         └── Git branch (分支名)
 │     └── 项目名 (git remote 或目录名)
 └── 来源标识 (nezha/opencode/trae/pi/external)

# OpenCode Server (source=opencode)
S-opencode-nezha.git-main-a1b2c3

# Trae (source=trae)
S-trae-nezha.git-feature-d4e5f6

# Pi (source=pi)
S-pi-nezha.git-dev-g7h8i9

# General (无项目/git)
G-nezha-71c2ae97d5d52059-4b0ab6
```

### 字段说明

| 字段                  | 来源                                  | 价值                 |
| --------------------- | ------------------------------------- | -------------------- |
| `S/G`                 | 自动判断                              | 区分特定/通用身份    |
| `source`              | 环境变量 `NEZHA_AGENT_SOURCE`         | **区分不同 AI 系统** |
| `project`             | git remote 或目录名                   | 知道来自哪个项目     |
| `branch`              | `git rev-parse --abbrev-ref HEAD`     | 知道在哪个分支工作   |
| `machine-fingerprint` | SHA256(主机名+平台+CPU)               | 机器识别             |
| `hash`                | SHA256(project\|git\|machine\|source) | 确定性保证           |

### 来源标识 (source)

通过环境变量 `NEZHA_AGENT_SOURCE` 设置：

| 值         | 说明                |
| ---------- | ------------------- |
| `nezha`    | Nezha Daemon (默认) |
| `opencode` | OpenCode Server     |
| `trae`     | Trae                |
| `pi`       | Pi                  |
| `external` | 其他外部 AI         |

### 环境检测 vs 安装检测

**关键概念区分**:

| 检测类型     | 目的                       | 例子                                     | 是依赖吗                |
| ------------ | -------------------------- | ---------------------------------------- | ----------------------- |
| **环境检测** | 知道"我正在谁的环境中运行" | `AI_AGENT === 'TRAE'` → 当前在 Trae 内部 | **否** - 只是上下文感知 |
| **安装检测** | 知道"某软件是否已安装"     | `~/.trae/` 是否存在                      | **否** - 被动检测       |

**为什么区分这个很重要**:

```typescript
// 这行代码"提到"了 Trae，但"不依赖" Trae
if (process.env.AI_AGENT !== 'TRAE') {
  return { source: null, sessionId: null };
}

// 如果 AI_AGENT 不是 TRAE (Trae 没运行)，代码正常执行
// 只是不启用 Trae 相关的功能
// 这叫"提到" ≠ "依赖"
```

**重要原则**:

- **提到** ≠ **依赖**
- 检查是一种**知识运用**，不是**依赖关系**
- 代码中可能出现软件名称，但只要不是 `import` 或必须存在才能运行，就不是依赖

### 当前检测实现

| 软件           | 检测方式                                                                                              | 类型     | 说明                                              |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| **Trae**       | `process.env.AI_AGENT === 'TRAE'`                                                                     | 环境检测 | Trae 设置 `AI_AGENT=TRAE` 告诉 Nezha "你在我里面" |
| **OpenCode**   | 1. 配置 URL 检查 2. 进程检查 `ps aux \| grep opencode` 3. 配置文件 `~/.config/opencode/opencode.json` | 混合检测 | OpenCode 没有设置类似 `AI_AGENT` 的环境变量       |
| **Pi**         | `process.env.ENABLE_PI === 'true'`                                                                    | 环境检测 | 需要手动启用                                      |
| **PostgreSQL** | 必须存在                                                                                              | 依赖     | 这是真正的依赖，没有 PostgreSQL 无法运行          |

> **注意**: OpenCode 没有像 Trae 那样设置 `AI_AGENT` 环境变量，所以无法通过环境检测知道"我正在 OpenCode 内部"。这是 OpenCode 的**设计选择**，不是 Nezha 的缺陷。

### 重要前提：软件需要主动留下标识

**核心观点**: 如果软件自己不主动"留下名字"（设置环境变量/特征），Nezha 无法用同样的方法检测到它。

| 软件         | 是否主动留下名字        | 结果                                           |
| ------------ | ----------------------- | ---------------------------------------------- |
| **Trae**     | ✅ 设置 `AI_AGENT=TRAE` | Nezha 可以知道"我在 Trae 里面"                 |
| **OpenCode** | ❌ 不设置类似变量       | Nezha 无法通过环境变量知道"我在 OpenCode 里面" |

- Trae 选择主动暴露自己的环境 → Nezha 能检测
- OpenCode 选择不这样做 → Nezha 无法通过环境检测知道

**这是软件的设计选择，不是 Nezha 的缺陷。Nezha 只是"知识运用"——你告诉我，我就知道；不告诉我，我就不知道。**

### 核心原则：因地制宜 + 知识驱动

**ID 生成机制是独立的**，不依赖外部软件是否存在：

1. **因地制宜**: 看软件做什么，利用软件留下的特征来设置 ID
   - Trae 设置 `AI_AGENT` → 利用它
   - OpenCode 可能设置 session_id → 利用它
   - 什么都没有 → 降级到 git hash

2. **知识驱动**: 依靠对软件的知识来设计机制
   - 我知道 Trae 会设置 `AI_AGENT` → 设计环境检测
   - 我知道 OpenCode 可能传递 session_id → 设计 session 检测
   - 我知道 git hash 总是存在 → 设计兜底方案

3. **独立运行**: 无论软件是否存在，机制都能工作
   - 软件存在 → 利用特征 (环境变量/文件/进程)
   - 软件不存在 → 降级运行 (git hash / machine fingerprint)

**这就是"依赖知识而非依赖存在"的实际含义。**

### 补充：主动提供 vs 被动检测

如果软件**主动提供**信息（而非 Nezha 去检测），情况不同：

> **示例**: 如果 OpenCode 运行环境中的软体时，会以明确的方式提供它自己和它的大模型的信息
>
> - OpenCode 可以主动传递 `session_id` 给 Nezha
> - OpenCode 可以主动设置 `NEZHA_AGENT_SOURCE=opencode`
> - 这是 OpenCode **主动提供**，不是 Nezha **依赖** OpenCode

| 场景         | 谁在行动                    | 结果                   |
| ------------ | --------------------------- | ---------------------- |
| **主动提供** | OpenCode 主动设置环境变量   | Nezha 可以利用这些信息 |
| **被动检测** | Nezha 检查文件/进程是否存在 | 不依赖软件存在         |
| **都不做**   | -                           | 降级运行 (git hash)    |

**关键点**: 无论哪种情况，都是 **Nezha 在做检测/利用**，不是 Nezha 依赖软件。软件存在 → 用特征；软件不存在 → 降级。

### 降级方案

```
无项目/git → 机器指纹 → G-格式
```

{project}-{git-hash}-{timestamp}[-{uuid}]

```

### 示例

```

nezha-abc1234-20260325T104500
│ │
│ └── 2026-03-25 10:45:00
└── 项目名 + git short hash

````

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
````

## 匹配优先级

当 AI 启动时，按以下优先级查找已有身份：

| 优先级 | 匹配条件            | 生成格式 | 含义                 |
| ------ | ------------------- | -------- | -------------------- |
| 1      | project + git hash  | S-       | 同一项目同一代码版本 |
| 2      | project             | S-       | 同一项目             |
| 3      | machine fingerprint | G-       | 同一机器             |
| 4      | 无匹配              | S-/G-    | 生成新 ID            |

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
  id VARCHAR(100) PRIMARY KEY,           -- 语义 ID (S-/G- 格式)
  project VARCHAR(255),                   -- 项目名
  git_hash VARCHAR(20),                   -- Git short hash
  machine_fingerprint VARCHAR(64),        -- 机器指纹
  source VARCHAR(50) DEFAULT 'nezha',     -- AI 来源 (nezha/opencode/external/mcp)
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

## 使用方式

### 新流程 (推荐)

```bash
# 1. 确保 PostgreSQL 运行
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18 start

# 2. 安装并启动 daemon (首次需要)
nezha install
nezha daemon

# 3. 启动工作
nezha start
```

### 自动化 (推荐配置)

```bash
# 安装后，daemon 会自动启动 (RunAtLoad: true)
# 每次打开终端，daemon 应该已经在运行

# 检查状态
nezha daemon  # 显示状态并自动启动

# 开始工作
nezha start
```

### 以前 vs 现在

| 方面 | 以前         | 现在               |
| ---- | ------------ | ------------------ |
| 启动 | 打开项目即可 | 先确保 daemon 运行 |
| ID   | 共享文件     | 幂等分配           |
| 身份 | 无追踪       | 自动关联           |
| 知识 | 混乱累积     | 确定性累积         |

### AI 身份自动解析

当 `nezha` 命令执行时：

```
1. 检测 daemon 状态
   ↓
2. 未运行 → 自动启动
   ↓
3. 连接 PostgreSQL
   ↓
4. 解析/创建身份
   ↓
5. 任务关联身份
   ↓
6. 知识累积到身份
```

### 命令速查

```bash
# 检查/启动 daemon
nezha daemon

# 启动工作
nezha start

# 查看身份
# 在任务列表中查看 created_by_identity 字段
nezha tasks

# 查看所有身份
# 直接查询数据库
psql -d nezha -c "SELECT * FROM agent_identities;"
```

### 环境变量

```bash
# 设置 AI 来源 (关键! 用于区分不同 AI 系统)
export NEZHA_AGENT_SOURCE=opencode  # opencode/trae/pi/nezha/external

# 可选：手动指定完整身份 (覆盖自动解析)
export NEZHA_AGENT_ID=S-nezha-abc1234-20260325-123456-xyz789

# 可选：指定身份名称
export NEZHA_AGENT_NAME=jk-opencode
```

> **重要**: 在启动外部 AI (OpenCode/Trae/Pi) 时，必须设置 `NEZHA_AGENT_SOURCE` 才能让 git commit 带上正确的 Agent ID。

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
# 设置 AI 来源 (区分 Nezha/OpenCode/Trae/Pi/External)
NEZHA_AGENT_SOURCE=opencode

# 手动指定完整身份 (最高优先级，覆盖一切)
NEZHA_AGENT_ID=jk-nezha-expert

# 自动选择 (默认)
# 根据上下文自动匹配/创建
```

## 相关文档

- [REFLECTION_SYSTEM.md](./REFLECTION_SYSTEM.md) - 学习系统
- [PDCA_CYCLE.md](./PDCA_CYCLE.md) - 改进循环
- [docs/LEARNING_SYSTEM.md](./LEARNING_SYSTEM.md) - 知识管理

---

**Last Updated**: 2026-03-29
