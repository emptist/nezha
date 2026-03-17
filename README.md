# Nezha

> AI 驱动的自主开发系统 - 让编辑器 AI 能够持续工作、自主执行任务

## 项目目标

构建一个能够**自主运行**的 AI 开发系统，具备以下核心能力：

| 能力 | 说明 | 状态 |
|------|------|------|
| **永久记忆** | PostgreSQL 存储 + 任务历史 | ✅ 已实现 |
| **持续工作** | 心跳机制 + 任务调度 | ✅ 已实现 |
| **任务执行** | Agent 调用 + 错误处理 | ✅ 已实现 |
| **技能扩展** | Skill 系统 + 插件机制 | ⚠️ 基础实现 |
| **自主学习** | AI 驱动知识管理 | ❌ 未实现 |

## 核心设计

### 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Nezha Core                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Memory    │  │  Scheduler  │  │    Agent    │      │
│  │   System    │  │   System    │  │   System    │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                │                │              │
│         └────────────────┼────────────────┘              │
│                          ▼                               │
│              ┌─────────────────────┐                     │
│              │     PostgreSQL      │                     │
│              │   (Permanent Store) │                     │
│              └─────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

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
  console.log("Working...");
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

| 维度 | 虚伪的持续工作 | 真正的持续工作 |
|------|---------------|---------------|
| **工作主体** | 程序代码 | 大模型 |
| **智能程度** | 无（固定逻辑） | 高（自主决策） |
| **学习能力** | 无 | 有 |
| **任务适应性** | 无（固定任务） | 有（灵活处理） |
| **程序代码作用** | 执行具体工作 | 调度大模型 |
| **大模型调用** | ❌ 不调用 | ✅ 必须调用 |

#### Nezha 的持续工作模式

Nezha 采用**真正的持续工作**模式：

1. **HeartbeatService**: 调度器，负责定时触发
2. **Scheduler**: 任务调度器，从数据库获取任务
3. **Agent**: 大模型调用器，调用 OpenCode API 执行任务
4. **大模型**: 实际执行工作，自主决策

**工作流程**:
```
HeartbeatService 定时触发
    ↓
Scheduler 从数据库获取任务
    ↓
Agent 调用 OpenCode API
    ↓
大模型接收任务，自主决策
    ↓
大模型执行任务（调用工具、读写文件、运行命令）
    ↓
大模型返回结果
    ↓
Agent 更新数据库状态
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

使用 PostgreSQL 实现永久存储，借鉴 OpenClaw 的记忆机制：

```typescript
interface MemorySystem {
  // 存储
  save(input: SaveMemoryInput): Promise<string>;
  
  // 检索
  search(searchTerm: string, limit?: number): Promise<Memory[]>;
  
  // 按项目查询
  getByProject(projectId: string): Promise<Memory[]>;
  
  // 清理旧记忆
  deleteOldMemories(): Promise<number>;
}
```

**实现状态**:
- ✅ PostgreSQL 存储
- ✅ CRUD 操作
- ✅ 搜索功能
- ⚠️ 向量搜索（pgvector）未实现
- ⚠️ 自动捕获未实现

**存储内容**:
- 任务执行历史
- 错误日志
- 项目信息
- 用户偏好

#### 2. Scheduler System (调度系统) ✅

借鉴 OpenClaw 的 heartbeat + cron 机制：

```typescript
interface SchedulerSystem {
  // 启动心跳
  start(): Promise<void>;
  
  // 停止心跳
  stop(): Promise<void>;
  
  // 调度任务
  scheduleTask(task: ScheduledTask): Promise<string>;
  
  // 获取统计信息
  getStats(): SchedulerStats;
}
```

**实现状态**:
- ✅ 心跳机制（可配置间隔）
- ✅ 任务队列（使用 PostgreSQL SKIP LOCKED）
- ✅ 并发安全（FOR UPDATE SKIP LOCKED）
- ✅ 失败暂停机制
- ✅ 卡住任务自动重置
- ⚠️ Cron 调度未实现

**工作流程**:
```
心跳触发 (默认每 30 分钟)
    ↓
检查 tasks 表
    ↓ 有待处理任务
获取任务 (SKIP LOCKED)
    ↓
执行任务
    ↓
更新状态
    ↓
等待下一次心跳
```

**关键特性**:
- **并发安全**: 使用 `FOR UPDATE SKIP LOCKED` 防止多实例竞争
- **自动恢复**: 卡住的任务（5分钟无响应）自动重置为 PENDING
- **失败保护**: 连续失败 5 次后暂停 1 分钟
- **统计追踪**: 记录执行次数、最后运行时间等

#### 3. Agent System (代理系统) ✅

与编辑器 AI 通信的核心模块：

```typescript
interface AgentSystem {
  // 创建会话
  createSession(): Promise<AgentSession>;
  
  // 发送消息
  sendMessage(sessionId: string, message: string): Promise<AgentResponse>;
  
  // 执行任务
  executeTask(message: string): Promise<AgentResponse>;
}
```

**实现状态**:
- ✅ HTTP 通信
- ✅ 会话管理
- ✅ 错误处理
- ✅ 重试机制（指数退避 + 抖动）
- ✅ 详细的网络错误消息

**错误处理特性**:
- **网络错误映射**: 将错误代码转换为人类可读消息
- **可重试状态**: 识别 429, 502, 503, 504 等可重试状态
- **指数退避**: 重试延迟随次数增加
- **请求追踪**: 每个请求有唯一 ID

#### 4. Skill System (技能系统) ⚠️

插件和技能扩展机制：

```typescript
interface SkillSystem {
  // 注册技能
  registerSkill(skill: Skill): void;
  
  // 获取技能
  getSkill(name: string): Skill | undefined;
  
  // 列出技能
  listSkills(): string[];
  
  // 执行技能
  executeSkill(name: string, input: unknown): Promise<unknown>;
}
```

**实现状态**:
- ✅ 基础注册和执行
- ⚠️ 未与 Agent 集成
- ❌ 未实现技能发现
- ❌ 未实现技能市场

## 技术选型

| 组件 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 运行时 | Node.js | 22+ | 与 OpenClaw 一致 |
| 语言 | TypeScript | 5.7+ | 类型安全 |
| 数据库 | PostgreSQL | 18+ | 永久存储 |
| 数据库驱动 | pg | 8.14+ | PostgreSQL 客户端 |
| 测试框架 | vitest | 3.0+ | 快速测试 |
| 开发工具 | tsx | 4.21+ | TypeScript 执行器 |

## 项目结构

```
nezha/
├── src/
│   ├── core/
│   │   ├── Agent.ts           # Agent 通信系统 ✅
│   │   ├── AgentSystem.ts     # Agent 管理系统 ⚠️
│   │   ├── EventBus.ts        # 事件总线 ✅
│   │   ├── Memory.ts          # 记忆系统 ✅
│   │   ├── Scheduler.ts       # 调度系统 ✅
│   │   └── SkillSystem.ts     # 技能系统 ⚠️
│   ├── services/
│   │   ├── HeartbeatService.ts # 心跳服务 ✅
│   │   └── MemoryService.ts   # 记忆服务 ✅
│   ├── db/
│   │   ├── DatabaseClient.ts  # 数据库客户端 ✅
│   │   └── migrations/
│   │       └── 001_initial.sql # 初始化脚本 ✅
│   ├── config/
│   │   ├── Config.ts          # 配置管理 ✅
│   │   ├── constants.ts       # 常量定义 ✅
│   │   └── types.ts           # 类型定义 ✅
│   ├── cli/
│   │   └── index.ts           # CLI 入口 ✅
│   └── NezhaCore.ts           # 核心入口 ✅
├── memory/                     # 每日记忆
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

### 数据库初始化

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

# 帮助
nezha help
```

## 与 OpenClaw 的关系

### OpenClaw 核心机制

OpenClaw 是一个**通用 AI 助手网关**，提供：

| 功能 | 实现 | 说明 |
|------|------|------|
| **多渠道消息** | WhatsApp, Telegram, Slack, Discord 等 | 20+ 消息平台 |
| **Gateway 服务** | WebSocket + RPC | 统一控制平面 |
| **Memory 系统** | 文件系统 + SQLite | 向量嵌入 + 搜索 |
| **心跳机制** | HeartbeatRunner | 定期检查 HEARTBEAT.md |
| **任务队列** | CommandQueue | 防止并发冲突 |
| **Skills 系统** | 插件机制 | 功能扩展 |

### OpenClaw 没有的功能

通过代码分析，OpenClaw **没有实现**以下功能：

| 功能 | 状态 | 说明 |
|------|------|------|
| **主动学习** | ❌ | 没有自动学习机制 |
| **被动学习** | ❌ | 没有从错误中学习的功能 |
| **知识提取** | ❌ | 没有自动知识整理 |
| **自我优化** | ❌ | 没有性能优化机制 |

OpenClaw 的 Memory 系统主要是：
- 向量嵌入和语义搜索
- 文件索引和检索
- 会话历史存储

### Nezha 的定位

| 方面 | OpenClaw | Nezha |
|------|----------|-------|
| **定位** | 通用 AI 助手网关 | 专用开发助手 |
| **记忆** | 文件系统 + SQLite | PostgreSQL |
| **调度** | heartbeat + cron | 相同机制 |
| **学习** | ❌ 无 | ❌ 暂未实现 |
| **渠道** | 20+ 消息平台 | 编辑器 AI |

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

### 进行中 🚧

- [ ] 提高测试覆盖率（目标 80%）
- [ ] 统一日志系统
- [ ] 完善 EventBus 集成
- [ ] 实现 Cron 调度

### 计划中 📋

- [ ] AI 驱动的学习系统（记忆工具 + System Prompt）
- [ ] 向量搜索（pgvector）
- [ ] 技能市场和发现
- [ ] 监控和告警
- [ ] Web UI
- [ ] 性能优化

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

| 维度 | 文件模式 | 数据库模式 |
|------|---------|-----------|
| **适用场景** | Nezha 自身 | 其他项目 |
| **任务存储** | HEARTBEAT.md | PostgreSQL |
| **项目管理** | 单一项目 | 多项目 |
| **AI 协作** | 单个 AI | 多 AI 协作 |
| **查询能力** | 文件读取 | SQL 查询 |
| **历史记录** | Git 历史 | 数据库记录 |
| **跨项目协调** | ❌ 不支持 | ✅ 支持 |

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

| 方面 | PostgreSQL | Redis |
|------|-----------|-------|
| **持久化** | ✅ 原生支持 | ⚠️ 需要配置 |
| **任务队列** | ✅ SKIP LOCKED | ✅ 原生支持 |
| **关系查询** | ✅ 强大 | ❌ 不支持 |
| **向量搜索** | ✅ pgvector | ⚠️ 需要扩展 |
| **运维成本** | ✅ 单一系统 | ⚠️ 多系统 |

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

| 特性 | OpenClaw | Nezha |
|------|----------|-------|
| **任务来源** | HEARTBEAT.md 文件 | PostgreSQL 数据库 |
| **并发安全** | ❌ 无保证 | ✅ SKIP LOCKED |
| **任务历史** | ❌ 无持久化 | ✅ 完整记录 |
| **分布式支持** | ❌ 单机 | ✅ 多实例 |
| **查询能力** | ❌ 弱 | ✅ SQL 强大 |

**结论**: Nezha 是独立项目，不依赖 OpenClaw 的文件系统机制。PostgreSQL 提供了更强大的任务管理和查询能力。

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
