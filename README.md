# Nezha

> AI 驱动的自主开发系统 - 让编辑器 AI 能够持续工作、自主执行任务

**设计原则**: PostgreSQL 优先，文件仅在不可避免时使用。

## 项目目标

构建一个能够**自主运行**的 AI 开发系统，具备以下核心能力：

| 能力                 | 说明                        | 状态      |
| -------------------- | --------------------------- | --------- |
| **永久记忆**         | PostgreSQL 存储 + 任务历史  | ✅ 已实现 |
| **持续工作**         | 心跳机制 + 任务调度         | ✅ 已实现 |
| **任务执行**         | Agent 调用 + 错误处理       | ✅ 已实现 |
| **Process Guardian** | 孤儿进程清理 + 实例数控制   | ✅ 已实现 |
| **对话日志**         | PostgreSQL + JSONL 双存储   | ✅ 已实现 |
| **技能系统**         | DB-only 技能加载 + 安全扫描 | ✅ 已实现 |
| **AI 构建技能**      | AI 自主生成技能             | ✅ 已实现 |
| **任务评审**         | 自动化 QC + 学习模式        | ✅ 已实现 |
| **AI 互相 Review**   | AI 互相 review 代码         | ✅ 已实现 |
| **知识导入**         | SOUL.md → PostgreSQL        | ✅ 已实现 |

## 核心设计

### ⚠️ AI ID 设计原则 (重要)

> **错误的设计: AI ID 共享** - 已被废弃，禁止使用！

**荒唐的错误**: 最初的设计将所有 AI 的 ID 存储在共享文件 `.nezha/agent-id.json` 中，导致所有 AI 实例使用相同的 ID。这完全违背了数字人身份系统的基本原则：

```
❌ 错误设计 (已废弃):
.nezha/agent-id.json (所有 AI 共享)
     ↓
OpenCode AI → 读到 ID A
Daemon AI → 读到 ID A (冲突！)
Trae AI → 读到 ID A (冲突！)
结果: 知识混乱，无法追踪谁做了什么
```

**正确的设计**: Agent ID 应该是幂等的、确定性的，基于上下文（项目 + Git + 时间）自动分配，确保相同上下文产生相同的数字人身份，实现知识累积和专家养成。

详见: [docs/AGENT_ID_SYSTEM.md](./docs/AGENT_ID_SYSTEM.md)

### 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Nezha Core                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Memory    │  │   Skill    │  │   Task     │             │
│  │   System    │  │   System   │  │   Review   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│              ┌─────────────────────┐                            │
│              │     PostgreSQL     │                            │
│              │   (Single Source   │                            │
│              │    of Truth)       │                            │
│              └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### PostgreSQL-first 设计原则

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Primary)                           │
│   • 所有结构化数据 (记忆、技能、对话)                            │
│   • 可查询、索引化、关联                                      │
│   • ACID 事务、并发访问                                        │
│   • 唯一的真实来源                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 仅在不可避免时
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    File System (Fallback)                         │
│   • 源代码 (git)                                                │
│   • 配置文件 (config.yaml)                                       │
│   • 临时日志 (轮转)                                             │
│   • 不用于知识/记忆存储                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 为什么选择 PostgreSQL？

| 方面       | PostgreSQL              | 文件系统     |
| ---------- | ----------------------- | ------------ |
| **查询**   | SQL 查询、JOIN、聚合    | Grep，有限   |
| **索引**   | B-tree, GIN, GiST, 向量 | 原生无       |
| **访问**   | 并发，行级锁            | 文件锁       |
| **备份**   | pg_dump, 时间点恢复     | cp, rsync    |
| **同步**   | 复制, CDC               | Git (仅文本) |
| **完整性** | 约束，触发器            | 无           |

### ⚠️ AI ID System - 数字人身份设计

> **核心洞察**: AI 没有记忆，AI 只是数据的临时容器。真正的"知识"存在于 PostgreSQL 中，用 Agent ID 作为数据的标签/锚点。

#### ID 格式

```
S-{project}-{git-hash}-{timestamp}-{hash}   # Specific: 有项目/git
G-{machine-fingerprint}-{timestamp}-{hash}  # General: 无项目/git
```

#### 示例

```
S-nezha-e33f9a0-20260325-133422-64db91
G-71c2ae97-20260325-133422-64db91
```

#### 核心原则

- **幂等性**: 同样上下文 = 同样 ID = 知识累积 = 专家养成
- **确定性**: ID 生成用哈希，不含随机数
- **自动灌注**: AI 启动时自动解析/创建身份

#### 依赖

- Daemon + PostgreSQL (必须运行)
- 自动检测 Daemon 状态，未运行则自动启动

**详细文档**: 参见 [docs/AGENT_ID_SYSTEM.md](./docs/AGENT_ID_SYSTEM.md)

---

### ⚠️ 重要概念：真正的持续工作 vs 虚伪的持续工作

**核心原则**: 完成工作的主体必须是**大模型**，而不是程序代码

#### 虚伪的持续工作（系统中的毒素）

**定义**: 完成工作的主体是程序代码（循环、定时器、死程序），而不是大模型

**特征**:

- ❌ 使用 `while (true)` 循环执行固定的程序逻辑
- ❌ 使用 `setInterval` 定时执行预定义的代码
- ❌ 使用 `for` 循环遍历数据并执行固定操作
- ❌ 使用 crontab 定时执行脚本，但脚本只是运行固定代码
- ❌ 程序代码"假装"在工作，实际上没有调用大模型

**示例**:

```typescript
// ❌ 虚伪的持续工作 - 循环执行死程序
while (true) {
  // 只是打印日志，没有调用大模型
  console.log('Working...');
  await sleep(1000);
}

// ❌ 虚伪的持续工作 - 定时执行固定代码
setInterval(() => {
  // 只是更新计数器，没有调用大模型
  counter++;
  console.log(`Counter: ${counter}`);
}, 1000);
```

**问题**:

- 没有真正的智能决策
- 无法处理复杂任务
- 无法学习和改进
- 只是"假装"在工作

#### 真正的持续工作

**定义**: 完成工作的主体是大模型，程序代码只是调度器

**特征**:

- ✅ 程序代码调度大模型执行任务
- ✅ 大模型自主决策如何完成任务
- ✅ 大模型可以调用工具、读写文件、运行命令
- ✅ 大模型可以学习和改进
- ✅ 程序代码只负责调度，不负责具体工作

**示例**:

```typescript
// ✅ 真正的持续工作 - 调度大模型执行任务
while (true) {
  // 1. 从数据库获取任务
  const task = await getTaskFromDatabase();

  if (task) {
    // 2. 调用大模型执行任务
    const result = await callLLM(task.description);

    // 3. 更新任务状态
    await updateTaskStatus(task.id, result);
  }

  await sleep(30000); // 30 秒后再次检查
}
```

**关键区别**:

| 维度             | 虚伪的持续工作 | 真正的持续工作 |
| ---------------- | -------------- | -------------- |
| **工作主体**     | 程序代码       | 大模型         |
| **智能程度**     | 无（固定逻辑） | 高（自主决策） |
| **学习能力**     | 无             | 有             |
| **任务适应性**   | 无（固定任务） | 有（灵活处理） |
| **程序代码作用** | 执行具体工作   | 调度大模型     |
| **大模型调用**   | ❌ 不调用      | ✅ 必须调用    |

#### Nezha 的持续工作模式

Nezha 采用**真正的持续工作**模式：

1. **HeartbeatService**: 调度器，负责定时触发
2. **Scheduler**: 任务调度器，从数据库获取任务
3. **AIProvider**: AI 调用器，通过 OpenAI/Anthropic API 执行任务
4. **大模型**: 实际执行工作，自主决策

**工作流程**:

```
HeartbeatService 定时触发
    ↓
Scheduler 从数据库获取任务
    ↓
AIProvider 调用 LLM API
    ↓
大模型接收任务，自主决策
    ↓
大模型返回结果
    ↓
更新数据库状态
    ↓
循环...
```

**关键点**:

- ✅ 程序代码只负责调度
- ✅ 大模型负责实际工作
- ✅ 大模型可以自主决策
- ✅ 大模型可以学习和改进

**详细文档**: 参见 [USER_GUIDE.md](./docs/USER_GUIDE.md) - 三种持续工作方法的详细使用指南

### 四大子系统

#### 1. Memory System (记忆系统) ✅

PostgreSQL 实现永久存储：

```typescript
interface MemorySystem {
  // 存储
  save(input: SaveMemoryInput): Promise<string>;

  // 检索
  search(searchTerm: string, limit?: number): Promise<Memory[]>;

  // 向量搜索
  vectorSearch(query: string): Promise<VectorSearchResult[]>;

  // 按项目查询
  getByProject(projectId: string): Promise<Memory[]>;
}
```

**实现状态**:

- ✅ PostgreSQL 存储
- ✅ CRUD 操作
- ✅ 搜索功能
- ✅ 向量搜索 (pgvector)
- ✅ SOUL.md/AGENTS.md 导入

**存储内容**:

- 任务执行历史
- 学习模式
- 知识图谱
- 用户偏好

#### 2. Skill System (技能系统) ✅

**DB-only 技能加载** - 安全强化：

```typescript
interface SkillSystem {
  // 获取技能 (仅从 DB)
  getSkill(name: string): Promise<Skill | null>;

  // 列出技能
  listSkills(): Promise<StoredSkill[]>;

  // 搜索技能
  searchSkills(query: string): Promise<StoredSkill[]>;

  // 执行技能
  executeSkill(name: string, input: unknown): Promise<SkillExecutionResult>;
}
```

**安全模型**:

- ❌ 永不从磁盘加载技能
- ✅ 仅加载已批准技能 (status='approved')
- ✅ 安全评分 >= 70
- ✅ 静态代码分析
- ✅ 用户审批流程

#### 3. Skill Builder (技能构建) ✅

AI 自主构建技能：

```typescript
interface SkillBuilder {
  // 构建新技能
  buildSkill(input: SkillBuildInput): Promise<SkillBuildOutput>;

  // 改进现有技能
  improveSkill(skillId: string, improvement: string): Promise<SkillBuildOutput>;

  // 列出内部构建的技能
  listInternallyBuiltSkills(): Promise<SkillSpec[]>;
}
```

**构建流程**:

```
输入用途 → AI 生成技能规范 → 质量评分 → 保存到数据库
```

#### 4. Task Review (任务评审) ✅

自动化 QC 系统：

```typescript
interface TaskReviewSkill {
  // 评审任务
  review(input: TaskReviewInput): Promise<TaskReviewOutput>;

  // 获取评审历史
  getReviewHistory(taskId?: string): Promise<TaskReviewOutput[]>;
}
```

**评审内容**:

- 执行状态 (成功/失败)
- 结果质量
- 性能 (耗时)
- 测试通过/失败
- 文件变更

**学习输出**:

- 优秀解决方案 → 记住
- 关键问题 → 避免
- 常见模式 → 存储

#### 5. Inter-Review (AI 互相 Review) ✅

AI 互相 review 代码，提取 learnings 存入 memory：

```typescript
interface InterReviewService {
  // 请求 review
  requestReview(request: ReviewRequest): Promise<string>;

  // 执行 review (AI 调用 AI)
  performReview(reviewId: string, prompt: string): Promise<ReviewResult>;

  // 提取 learnings 存入 memory
  saveLearningsToMemory(result: ReviewResult, taskId?: string): Promise<void>;
}
```

**核心哲学**: Review 的输出不是反馈，而是 learnings - 帮助未来 AI 避免类似问题的提醒

**AI 提供者支持**:

- ✅ **OpenAI** - 通过 OPENAI_API_KEY 环境变量
- ✅ **Anthropic** - 通过 ANTHROPIC_API_KEY 环境变量
- ✅ **GLM-4-Flash** - 通过 ZHIPU_API_KEY 环境变量

**Learnings 示例**:

```json
{
  "learnings": [
    {
      "topic": "TypeScript patterns",
      "reminder": "Always use non-null assertion after rows.length check"
    },
    { "topic": "Database patterns", "reminder": "Use record_spawned_process() when tracking PIDs" }
  ]
}
```

**CLI 命令**:

```bash
npm run review:request [commit-hash]  # 请求 AI review
npm run review:show [review-id]      # 查看 review
npm run review:stats                 # 查看统计
```

#### 6. Knowledge Import (知识导入) ✅

从传统 markdown 文件导入：

```typescript
interface MarkdownKnowledgeLoader {
  // 导入目录
  importDirectory(dirPath: string): Promise<ImportResult[]>;

  // 导出到 markdown
  exportToMarkdown(type: KnowledgeType): Promise<string>;
}
```

**支持文件类型**:

- `SOUL.md` → 身份/角色
- `AGENTS.md` → 操作指令
- `USER.md` → 用户上下文
- `memory/*.md` → 每日记忆
- `lore.md` → 背景知识

#### 6. ClawHub Integration (ClawHub 集成) ✅

安全导入外部技能：

```typescript
interface ClawHubClient {
  // 搜索技能
  searchSkills(options: SearchOptions): Promise<ClawHubSkill[]>;

  // 安全评审
  reviewSkill(skill: ClawHubSkill): Promise<SkillReviewResult>;

  // 安装 (需审批)
  installSkill(skill: ClawHubSkill): Promise<boolean>;
}
```

**安全层**:

- 静态代码分析
- 危险模式检测
- 安全评分
- 用户审批
- 自动屏蔽恶意技能

## 技术选型

| 组件       | 技术       | 版本  | 说明              |
| ---------- | ---------- | ----- | ----------------- |
| 运行时     | Node.js    | 22+   | 与 OpenClaw 一致  |
| 语言       | TypeScript | 5.7+  | 类型安全          |
| 数据库     | PostgreSQL | 18+   | 永久存储          |
| 数据库驱动 | pg         | 8.14+ | PostgreSQL 客户端 |
| 测试框架   | vitest     | 3.0+  | 快速测试          |
| 开发工具   | tsx        | 4.21+ | TypeScript 执行器 |

## 项目结构

```
nezha/
├── src/
│   ├── core/
│   │   ├── ContinuousImprovementLoop.ts  # 持续改进循环 ✅
│   │   ├── EventBus.ts          # 事件总线 ✅
│   │   ├── Memory.ts            # 记忆系统 ✅
│   │   ├── Scheduler.ts         # 调度系统 ✅
│   │   └── SkillSystem.ts       # 技能系统 ✅
│   ├── services/
│   │   ├── heartbeat/           # 心跳服务 ✅
│   │   │   └── HeartbeatService.ts  # 99行精简版
│   │   ├── ai/                  # AI 调用 ✅
│   │   │   └── AIProvider.ts   # OpenAI/Anthropic
│   │   ├── InterReviewService.ts # AI 互相 Review ✅
│   │   ├── AutoReviewService.ts  # 自动触发 Review ✅
│   │   ├── TaskReviewSkill.ts    # 任务 QC ✅
│   │   ├── SkillBuilder.ts       # AI 构建技能 ✅
│   │   └── DatabaseSkillLoader.ts # DB-only 技能加载 ✅
│   ├── db/
│   │   ├── DatabaseClient.ts  # 数据库客户端 ✅
│   │   └── migrations/
│   │       └── 001_initial.sql # 初始化脚本 ✅
│   ├── config/
│   │   ├── Config.ts          # 配置管理 ✅
│   │   ├── constants.ts       # 常量定义 ✅
│   │   └── types.ts           # 类型定义 ✅
│   ├── cli/
│   │   ├── index.ts           # CLI 入口 ✅
│   │   └── process-guardian.ts # 进程守护 ✅
│   └── NezhaCore.ts           # 核心入口 ✅
├── deprecated/                # 已废弃代码
│   └── opencode-coupling/     # OpenCode 耦合代码 (已移除)
├── conversations/             # 会话日志 (JSONL)
├── memory/                    # 每日记忆
├── reviews/                    # 代码评审
├── package.json
├── tsconfig.json
└── README.md
```

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-org/nezha.git
cd nezha

# 安装依赖
npm install
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=nezha
# DB_USER=postgres
# DB_PASSWORD=your_password
```

### 环境变量

在 `.env` 文件中配置：

| 变量               | 说明                             | 默认值        |
| ------------------ | -------------------------------- | ------------- |
| DB_HOST            | PostgreSQL 主机                  | localhost     |
| DB_PORT            | PostgreSQL 端口                  | 5432          |
| DB_NAME            | 数据库名                         | nezha         |
| DB_USER            | 数据库用户                       | postgres      |
| DB_PASSWORD        | 数据库密码                       | your_password |
| EMBEDDING_PROVIDER | 嵌入提供者 (ollama/zhipu/openai) | -             |
| WEBHOOK_URL        | Webhook 通知 URL                 | -             |
| NEZHA_MAX_RETRIES  | 任务最大重试次数                 | 3             |
| NEZHA_TASK_TIMEOUT | 任务超时时间 (ms)                | 300000        |
| NEZHA_AGENT_ID     | 手动指定身份 ID (覆盖自动)       | 自动解析      |
| NEZHA_AGENT_NAME   | 身份显示名称                     | -             |
| NEZHAPI_PORT       | Nezhapi 服务端口                 | 4099          |

### 启动流程

```bash
# 1. 确保 PostgreSQL 运行
pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18 start

# 2. 首次安装 daemon
nezha install

# 3. 检查/启动 daemon
nezha daemon

# 4. 启动工作
nezha start
```

### Nezhapi (OpenCode 集成)

Nezha 提供 REST API 供 OpenCode 集成：

```bash
# 启动 Nezhapi 服务
npm run nezhapi

# 或
node dist/api/NezhaApiServer.js
```

**API 端点** (端口 4099):

| 端点         | 方法 | 功能             |
| ------------ | ---- | ---------------- |
| `/health`    | GET  | 健康检查         |
| `/identity`  | GET  | 获取当前 AI 身份 |
| `/tasks`     | GET  | 获取待处理任务   |
| `/tasks`     | POST | 创建新任务       |
| `/broadcast` | GET  | 获取广播列表     |
| `/broadcast` | POST | 发送广播         |
| `/memory`    | GET  | 搜索记忆         |
| `/memory`    | POST | 保存记忆         |

**示例**:

```bash
# 健康检查
curl http://localhost:4099/health

# 获取 AI 身份
curl http://localhost:4099/identity

# 获取待处理任务
curl http://localhost:4099/tasks

# 创建任务
curl -X POST http://localhost:4099/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "新任务", "description": "任务描述", "priority": 50}'
```

**OpenCode 集成**: 参见 [docs/OPENCODE_INTEGRATION.md](./docs/OPENCODE_INTEGRATION.md)

### 数据库初始化

> 📖 **深入了解**: 参见 [docs/OPENCODE_INTEGRATION.md](./docs/OPENCODE_INTEGRATION.md) 了解 CLI vs REST API 的对比

#### 标准操作流程 (SOP)

```bash
# 1. 启动 PostgreSQL
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18 start

# 2. 创建数据库（如果不存在）
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -c "CREATE DATABASE nezha;"

# 3. 运行迁移
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha -f src/db/migrations/001_initial.sql

# 4. 构建
npm run build

# 5. 启动 Nezha daemon
nezha start

# 6. 添加任务
nezha task-add "Review code" "Review src/core for issues" 5
```

**注意**: Nezha 不再依赖 OpenCode 服务。它直接通过 AIProvider 调用 OpenAI/Anthropic API。

#### 旧版方式（仅参考）

```bash
# 连接到 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE nezha;

# 运行迁移
\c nezha
\i src/db/migrations/001_initial.sql
```

### 运行

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动守护进程
npm run start:daemon

# 查看状态
node dist/cli/index.js status

# 查看健康信息
node dist/cli/index.js health
```

### CLI 命令

```bash
# 启动心跳服务
nezha start

# 停止心跳服务
nezha stop

# 查看状态
nezha status

# 查看健康信息
nezha health

# 添加任务
nezha task-add "Review code" "Review src/core for issues" 5

# 列出任务
nezha tasks

# AI Review 命令
nezha review-request [commit]  # 请求 AI review
nezha review-show [id]         # 查看 review
nezha review-stats              # 查看统计
nezha review-respond <id> <msg> # 回应 review

# 帮助
nezha help
```

### Process Guardian 命令

```bash
# 启动进程守护
node dist/cli/process-guardian.js run

# 查看进程状态
node dist/cli/process-guardian.js status

# 单次清理
node dist/cli/process-guardian.js once

# 停止守护
node dist/cli/process-guardian.js stop
```

**Cron 定时清理** (每 10 分钟):

```bash
0,10,20,30,40,50 * * * * cd /path/to/nezha && node dist/cli/process-guardian.js once
```

## 与 OpenClaw 的关系

### OpenClaw vs Nezha

| 方面         | OpenClaw                 | Nezha             |
| ------------ | ------------------------ | ----------------- |
| **定位**     | 通用 AI 助手网关         | 专用开发助手      |
| **记忆**     | 文件系统 (`memory/*.md`) | PostgreSQL        |
| **技能**     | `.md` 文件在磁盘         | 数据库 + 审批流程 |
| **知识**     | 每日 markdown 文件       | 可查询的表        |
| **设计哲学** | 文件优先                 | PostgreSQL 优先   |
| **安全**     | 信任外部技能             | 扫描 + 审批       |

### OpenClaw 核心机制

OpenClaw 是一个**通用 AI 助手网关**，提供：

| 功能             | 实现                                  | 说明                  |
| ---------------- | ------------------------------------- | --------------------- |
| **多渠道消息**   | WhatsApp, Telegram, Slack, Discord 等 | 20+ 消息平台          |
| **Gateway 服务** | WebSocket + RPC                       | 统一控制平面          |
| **Memory 系统**  | 文件系统 + SQLite                     | 向量嵌入 + 搜索       |
| **心跳机制**     | HeartbeatRunner                       | 定期检查 HEARTBEAT.md |
| **任务队列**     | CommandQueue                          | 防止并发冲突          |
| **Skills 系统**  | 插件机制                              | 功能扩展              |

### Nezha 的增强

| 功能         | OpenClaw | Nezha                     |
| ------------ | -------- | ------------------------- |
| **学习系统** | ❌ 无    | ✅ Task Review + 模式存储 |
| **技能构建** | ❌ 无    | ✅ AI 自主生成技能        |
| **技能安全** | ❌ 信任  | ✅ 扫描 + 审批            |
| **知识导入** | ❌ 文件  | ✅ SOUL.md → PostgreSQL   |
| **审计日志** | ❌ 无    | ✅ skill_audit_log        |

**策略**: 借鉴 OpenClaw 的心跳和调度机制，用 PostgreSQL 增强存储能力，专注于开发场景。

## 开发计划

### 已完成 ✅

- [x] 项目初始化
- [x] 数据库 schema 设计
- [x] 基础 CLI 框架
- [x] PostgreSQL 存储实现
- [x] 心跳机制实现
- [x] 任务队列实现
- [x] Agent 通信系统
- [x] 错误处理和重试机制
- [x] 健康检查接口
- [x] Process Guardian (孤儿进程清理)
- [x] Conversation Logging (会话日志)
- [x] 客户项目集成教程
- [x] **Skill System (DB-only 加载)**
- [x] **Skill Builder (AI 构建技能)**
- [x] **Task Review (自动化 QC)**
- [x] **ClawHub Integration (安全导入)**
- [x] **Markdown Knowledge Import (SOUL.md → DB)**
- [x] **Decision Framework (ReAct 模式)**
- [x] **Dual Storage (JSONL + PostgreSQL)**
- [x] **Inter-Review (AI 互相 Review)**

### 进行中 🚧

- [ ] 提高测试覆盖率（目标 80%）
- [ ] 完善 Skill System 与 Agent 集成
- [ ] Skill 依赖解析

### 计划中 📋

- [ ] Skill 组合 (技能叠加)
- [ ] Skill 评级和反馈
- [ ] 自动化 Skill 测试
- [ ] Web UI
- [ ] 监控和告警

## PostgreSQL 18 特性利用

### SKIP LOCKED - 并发任务队列

```sql
-- 并发安全地获取任务
UPDATE task_queue
SET status = 'running', started_at = NOW()
WHERE id = (
  SELECT id FROM task_queue
  WHERE status = 'pending'
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

**优势**:

- 无需额外锁机制
- 支持多实例部署
- 性能接近 Redis

### LISTEN/NOTIFY - 事件通知

```sql
-- 监听任务事件
LISTEN task_channel;

-- 触发通知
NOTIFY task_channel, '{"task_id": "xxx", "action": "created"}';
```

**用途**:

- 实时通知客户端
- 事件驱动架构
- 低延迟推送

### 未来: pgvector - 语义搜索

```sql
-- 创建向量索引
CREATE EXTENSION vector;

CREATE TABLE memories (
  id UUID PRIMARY KEY,
  content TEXT,
  embedding vector(1536)
);

-- 语义搜索
SELECT content,
       1 - (embedding <=> query_vector) as similarity
FROM memories
ORDER BY embedding <=> query_vector
LIMIT 10;
```

**用途**:

- 语义记忆检索
- 相似任务查找
- 智能推荐

## 架构决策记录

### 双模式架构：文件模式 vs 数据库模式

Nezha 采用**双模式架构**，根据使用场景选择不同的任务管理方式：

#### 1. 文件模式（Nezha 自身项目）

**适用场景**: Nezha 自身的开发和维护

**特点**:

- 使用 `HEARTBEAT.md` 文件作为任务清单
- AI 直接读取和修改文件
- 简单直观，适合单一项目
- 无需数据库配置

**工作流程**:

```
AI 读取 HEARTBEAT.md
    ↓
执行任务
    ↓
更新文件状态
    ↓
提交到 Git
```

**示例 HEARTBEAT.md**:

```markdown
# Tasks

## High Priority

- [ ] Fix critical bug in Scheduler
- [ ] Add unit tests for Agent

## Medium Priority

- [ ] Improve error messages
- [ ] Update documentation

## Completed

- [x] Implement heartbeat mechanism
- [x] Add PostgreSQL support
```

#### 2. 数据库模式（其他项目）

**适用场景**: 管理 Nezha 之外的其他项目

**特点**:

- 使用 PostgreSQL 数据库管理任务
- 支持多项目、多 AI 协作
- 强大的查询和统计能力
- 跨项目任务协调

**工作流程**:

```
AI 查询数据库
    ↓
获取项目任务
    ↓
执行任务
    ↓
更新数据库状态
    ↓
发送消息通知
```

**数据库表结构**:

```sql
-- 项目注册表
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    name TEXT UNIQUE,
    path TEXT,
    language TEXT,
    status TEXT
);

-- 任务表
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    title TEXT,
    status TEXT,
    priority INTEGER
);

-- AI 通信日志
CREATE TABLE project_communications (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    from_ai TEXT,
    to_ai TEXT,
    content TEXT
);
```

#### 对比总结

| 维度           | 文件模式     | 数据库模式 |
| -------------- | ------------ | ---------- |
| **适用场景**   | Nezha 自身   | 其他项目   |
| **任务存储**   | HEARTBEAT.md | PostgreSQL |
| **项目管理**   | 单一项目     | 多项目     |
| **AI 协作**    | 单个 AI      | 多 AI 协作 |
| **查询能力**   | 文件读取     | SQL 查询   |
| **历史记录**   | Git 历史     | 数据库记录 |
| **跨项目协调** | ❌ 不支持    | ✅ 支持    |

#### 为什么采用双模式？

**文件模式的优势**（Nezha 自身）:

- ✅ 简单直接，无需数据库配置
- ✅ Git 版本控制，历史清晰
- ✅ 适合单一项目的快速迭代
- ✅ AI 可以直接修改文件

**数据库模式的优势**（其他项目）:

- ✅ 集中管理多个项目
- ✅ 强大的查询和统计能力
- ✅ 支持多 AI 协作
- ✅ 跨项目任务协调
- ✅ 完整的历史记录

**相关文档**:

**核心技术**:

- [OPENCLAW_CORE_TECHNOLOGY.md](./docs/OPENCLAW_CORE_TECHNOLOGY.md) - OpenClaw 核心技术分析（持续运行机制）
- [OPENCLAW_VS_NEZHA_CORRECT.md](./docs/OPENCLAW_VS_NEZHA_CORRECT.md) - OpenClaw vs Nezha 架构对比

**开发指南**:

- [DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) - 完整开发者指南
- [OPENCODE_VS_TRAE.md](./docs/OPENCODE_VS_TRAE.md) - OpenCode vs Trae 工作模式对比

**多项目集成**:

- [GITBRAIN_NEZHA_GUIDE.md](./docs/GITBRAIN_NEZHA_GUIDE.md) - 数据库模式使用示例
- [MULTI_PROJECT_DATABASE_GUIDE.md](./docs/MULTI_PROJECT_DATABASE_GUIDE.md) - 多项目管理指南
- [MULTI_PROJECT_INTEGRATION.md](./docs/MULTI_PROJECT_INTEGRATION.md) - 多项目集成架构

**学习系统设计**（未实现）:

- [COMPLETE_LEARNING_SYSTEM_DESIGN.md](./docs/COMPLETE_LEARNING_SYSTEM_DESIGN.md) - 完整学习系统设计
- [LEARNING_SYSTEM_IMPLEMENTATION_PLAN.md](./docs/LEARNING_SYSTEM_IMPLEMENTATION_PLAN.md) - 学习系统实施计划
- [IMPLEMENTATION_ROADMAP.md](./docs/IMPLEMENTATION_ROADMAP.md) - 实施路线图

**详细设计文档**（未实现）:

- [MEMORY_SKILLS_API_SPEC.md](./docs/MEMORY_SKILLS_API_SPEC.md) - Memory Skills API 规范
- [DATABASE_SCHEMA_DESIGN.md](./docs/DATABASE_SCHEMA_DESIGN.md) - 数据库 Schema 设计
- [LEARNING_PROMPT_TEMPLATES.md](./docs/LEARNING_PROMPT_TEMPLATES.md) - 学习 Prompt 模板
- [INTEGRATION_DESIGN.md](./docs/INTEGRATION_DESIGN.md) - 集成方案设计
- [TESTING_STRATEGY.md](./docs/TESTING_STRATEGY.md) - 测试策略

**核心技术决策**:

- [UNIFIED_KNOWLEDGE_BASE_DESIGN.md](./docs/UNIFIED_KNOWLEDGE_BASE_DESIGN.md) - 统一知识库设计
- [TOKEN_OPTIMIZATION_STRATEGY.md](./docs/TOKEN_OPTIMIZATION_STRATEGY.md) - Token 优化策略
- [KNOWLEDGE_HANDOVER_MECHANISM.md](./docs/KNOWLEDGE_HANDOVER_MECHANISM.md) - 知识交接班机制（MD + SQL）

### 持续运行机制

Nezha 现已实现类似 OpenClaw 的持续运行机制：

**核心技术**:

- `while (true)` 循环：保证持续运行
- `waitForever()` 函数：保持事件循环活跃
- 自动重连机制：断开后自动重连
- 指数退避：避免频繁重连

**启动方式**:

```bash
# 方式 1: 直接运行
node dist/cli/index.js start

# 方式 2: 使用 PM2（推荐）
pm2 start dist/cli/index.js --name nezha-daemon -- start

# 查看状态
pm2 status

# 查看日志
pm2 logs nezha-daemon
```

**工作原理**:

```
启动 Nezha Daemon
    ↓
while (true) 循环
    ↓
启动 Scheduler
    ↓
等待任务或中断
    ↓
如果中断，检查是否应该重连
    ↓
如果应该重连，等待后重连
    ↓
继续循环...
```

**详细说明**: 参见 [OPENCLAW_CORE_TECHNOLOGY.md](./docs/OPENCLAW_CORE_TECHNOLOGY.md)

### 为什么选择 PostgreSQL 而不是 Redis？

| 方面         | PostgreSQL     | Redis       |
| ------------ | -------------- | ----------- |
| **持久化**   | ✅ 原生支持    | ⚠️ 需要配置 |
| **任务队列** | ✅ SKIP LOCKED | ✅ 原生支持 |
| **关系查询** | ✅ 强大        | ❌ 不支持   |
| **向量搜索** | ✅ pgvector    | ⚠️ 需要扩展 |
| **运维成本** | ✅ 单一系统    | ⚠️ 多系统   |

**结论**: PostgreSQL 18 提供了足够的性能和功能，简化架构。

### 为什么采用 AI 驱动的学习系统？

**传统思路的问题**:

- 需要编写复杂的 NLP 处理逻辑
- 知识提取规则难以定义和维护
- 无法理解上下文和重要性判断
- 维护成本高，不够灵活

**AI 驱动的优势**:

- ✅ 利用 AI 的理解能力，更准确提取知识
- ✅ AI 可以根据上下文判断重要性
- ✅ 自然语言处理，无需复杂规则
- ✅ AI 可以自我调整和优化学习策略

**实现方式**: 不是通过程序代码实现学习，而是通过 **Prompt 指令**让 AI 自主学习、存储和应用知识。

**设计文档**: 参见 [LEARNING_SYSTEM.md](./LEARNING_SYSTEM.md) - 包含完整的 System Prompt 设计、工具定义和使用示例（**注意**：学习系统功能尚未实现，此为设计文档）。

### 为什么不使用 HEARTBEAT.md 文件？

**OpenClaw 的心跳机制**:

- 读取 `HEARTBEAT.md` 文件作为任务清单
- 默认提示："Read HEARTBEAT.md if it exists (workspace context). Follow it strictly."
- AI 根据文件内容执行任务或回复 `HEARTBEAT_OK`

**Nezha 的心跳机制**:

- 使用 PostgreSQL 任务队列（`tasks` 表）
- 通过 `FOR UPDATE SKIP LOCKED` 实现并发安全
- 从数据库获取任务，不依赖文件系统

**对比**:

| 特性           | OpenClaw          | Nezha             |
| -------------- | ----------------- | ----------------- |
| **任务来源**   | HEARTBEAT.md 文件 | PostgreSQL 数据库 |
| **并发安全**   | ❌ 无保证         | ✅ SKIP LOCKED    |
| **任务历史**   | ❌ 无持久化       | ✅ 完整记录       |
| **分布式支持** | ❌ 单机           | ✅ 多实例         |
| **查询能力**   | ❌ 弱             | ✅ SQL 强大       |

**结论**: Nezha 是独立项目，不依赖 OpenClaw 的文件系统机制。PostgreSQL 提供了更强大的任务管理和查询能力。

### 数据存储策略

> **详细设计原则**: 完整的设计说明见 [PHILOSOPHY.md](./PHILOSOPHY.md)

#### 为什么选择 PostgreSQL 而非文件存储？

**核心原因**: PostgreSQL 解决了文件存储无法克服的根本问题

| 问题         | 文件存储         | PostgreSQL        |
| ------------ | ---------------- | ----------------- |
| **查询能力** | grep/sed 有限    | SQL 强大查询      |
| **并发安全** | 文件锁不可靠     | ACID 事务         |
| **语义搜索** | 不支持           | pgvector 向量搜索 |
| **可移植性** | 文件复制依赖路径 | pg_dump 一键导出  |
| **多实例**   | 需额外机制       | 原生支持          |

#### 什么数据存数据库？什么存文件？

> 详细分类见 [PHILOSOPHY.md](./PHILOSOPHY.md#what-goes-in-postgresql)

**PostgreSQL (操作数据 - 必须可查询)**:
| 表 | 用途 | 为什么必须存 DB |
|---|------|----------------|
| `tasks` | 任务队列 | 必须可查询、可并发、可追踪状态 |
| `memory` | 知识库 | 向量搜索必需 |
| `skills` | 技能注册表 | 复用、版本追踪 |
| `task_audit_log` | 操作日志 | 可靠记录 |

**文件 (人类可读/机器特定)**:
| 路径 | 用途 | 为什么存文件 |
|------|------|-------------|
| `.tmp/nezha-memory/` | 每日记忆 | 人类可读、append-only |
| `.tmp/nezha-memory/MEMORY.md` | 长期记忆 | 人类编辑、AI 参考 |
| `.env` | 配置 | 机器特定、安全 |
| `docs/` | 文档 | 纯人类参考 |

#### 导入/导出知识库

> 完整指南见 [PHILOSOPHY.md](./PHILOSOPHY.md#how-we-compare-to-openclaw)

**导出整个数据库**:

```bash
# 导出为 SQL 文件
pg_dump nezha > nezha-backup-$(date +%Y%m%d).sql

# 导出为压缩格式
pg_dump nezha | gzip > nezha-backup-$(date +%Y%m%d).sql.gz
```

**导入数据库**:

```bash
# 创建空数据库
createdb nezha-new

# 导入数据
psql nezha-new < nezha-backup-20260318.sql

# 或从压缩文件导入
gunzip < nezha-backup-20260318.sql.gz | psql nezha-new
```

**仅导出特定表（知识库）**:

```bash
# 导出 memory 和 skills 表
pg_dump -t memory -t skills nezha > knowledge-backup.sql

# 导入到另一个数据库
psql nezha-prod < knowledge-backup.sql
```

**迁移到新机器**:

```bash
# 源机器导出
pg_dump nezha > migration.sql

# 目标机器创建数据库
createdb nezha

# 目标机器导入
psql nezha < migration.sql
```

#### 设计原则总结

> 详见 [PHILOSOPHY.md](./PHILOSOPHY.md#critical-design-rule)

1. **所有操作数据必须在 PostgreSQL** - 可查询、可并发、可靠
2. **文件仅用于人类参考或机器特定配置**
3. **混合架构**: PostgreSQL (操作) + Files (人类可读)

## 贡献指南

### 开发环境设置

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 类型检查
npm run typecheck

# 构建
npm run build
```

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 编写单元测试
- 更新文档

### 提交规范

```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
refactor: 重构代码
test: 添加测试
chore: 杂项任务
```

## 许可证

MIT

## 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 心跳机制和调度系统灵感
- [PostgreSQL](https://www.postgresql.org/) - 强大的数据库系统
- [Node.js](https://nodejs.org/) - 运行时环境
  test
  test2
  test3
  test final
  test debug
  test fix2
  test eval
  final test
  block test
