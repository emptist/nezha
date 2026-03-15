# Nezha

> AI 驱动的自主开发系统agent - 让 编辑器AI（首选opencode/opencode各种模态） 能够自我学习、自我优化、持续工作

## 项目目标

构建一个能够**自主运行**的 AI 开发系统，具备三大核心能力：

| 能力 | 说明 | 参考 |
|------|------|------|
| **永久记忆** | PostgreSQL 存储 + 语义检索 | OpenClaw memory 插件 |
| **持续工作** | 心跳机制 + 任务调度 | OpenClaw heartbeat + cron |
| **自我优化** | 自主学习 + 知识提取 | OpenClaw bootstrap 文件 |

## 核心设计

### 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Nezha Core                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Memory    │  │  Scheduler  │  │   Learner   │      │
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

### 三大子系统

#### 1. Memory System (记忆系统)

借鉴 OpenClaw 的 bootstrap 文件机制，使用 PostgreSQL 实现永久存储：

```typescript
interface MemorySystem {
  // 存储
  store(entry: MemoryEntry): Promise<void>;
  
  // 检索
  retrieve(query: string, context?: Context): Promise<MemoryEntry[]>;
  
  // 自动捕获
  capture(event: EditorEvent): Promise<void>;
}
```

**存储内容**：
- 项目架构和技术栈
- 编码规范和习惯
- 重要决策和讨论
- 常见错误和解决方案
- 代码模式和最佳实践

#### 2. Scheduler System (调度系统)

借鉴 OpenClaw 的 heartbeat + cron 机制：

```typescript
interface SchedulerSystem {
  // 心跳 - 定期检查任务
  startHeartbeat(interval: Duration): void;
  
  // 任务队列
  enqueue(task: Task): Promise<string>;
  
  // 定时任务
  schedule(cron: string, task: Task): Promise<string>;
}
```

**工作流程**：
```
心跳触发 (每 30 分钟)
    ↓
检查 HEARTBEAT.md
    ↓ 有任务
执行任务
    ↓ 无任务
自主学习 → 更新记忆
    ↓
等待下一次心跳
```

#### 3. Learner System (学习系统)

借鉴 OpenClaw 的自动回复和记忆索引机制：

```typescript
interface LearnerSystem {
  // 从代码中学习
  learnFromCode(files: string[]): Promise<KnowledgeEntry[]>;
  
  // 从错误中学习
  learnFromError(error: Error): Promise<KnowledgeEntry>;
  
  // 从对话中学习
  learnFromConversation(messages: Message[]): Promise<KnowledgeEntry[]>;
  
  // 定期整理
  consolidate(): Promise<void>;
}
```

## 技术选型

| 组件 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js 22+ / Bun | 与 OpenClaw 一致 |
| 语言 | TypeScript | 类型安全 |
| 数据库 | PostgreSQL 18+ | 永久存储 |
| 向量搜索 | pgvector | 语义检索 |
| 任务调度 | 内置 cron | 参考 OpenClaw |

## 项目结构

```
nezha/
├── src/
│   ├── core/
│   │   ├── memory.ts       # 记忆系统
│   │   ├── scheduler.ts    # 调度系统
│   │   └── learner.ts      # 学习系统
│   ├── db/
│   │   ├── schema.ts       # 数据库 schema
│   │   └── migrations/     # 迁移脚本
│   ├── cli/
│   │   └── nezha.ts        # CLI 入口
│   └── index.ts
├── memory/                  # 每日记忆 (保留)
├── package.json
├── tsconfig.json
└── README.md
```

## 开发计划

### Phase 1: 基础设施 (Week 1)

- [ ] 项目初始化 (package.json, tsconfig.json)
- [ ] 数据库 schema 设计
- [ ] 基础 CLI 框架

### Phase 2: 记忆系统 (Week 2)

- [ ] PostgreSQL 存储实现
- [ ] 记忆检索 API
- [ ] 与 OpenClaw 记忆格式兼容

### Phase 3: 调度系统 (Week 3)

- [ ] 心跳机制实现
- [ ] 任务队列实现
- [ ] Cron 调度实现

### Phase 4: 学习系统 (Week 4)

- [ ] 代码分析学习
- [ ] 错误学习
- [ ] 知识整理

### Phase 5: 集成测试 (Week 5)

- [ ] 端到端测试
- [ ] 与编辑器 AI 集成
- [ ] 性能优化

## 与 OpenClaw 的关系

| 方面 | OpenClaw | Nezha |
|------|----------|-------|
| 定位 | 通用 AI 助手网关 | 专用开发助手 |
| 记忆 | 文件系统 + SQLite | PostgreSQL |
| 调度 | heartbeat + cron | 相同机制 |
| 学习 | 需要插件 | 内置能力 |

**策略**：先学 OpenClaw 的机制，用 PostgreSQL 增强，最终实现自主运行。

## OpenClaw Gateway 核心机制研究

### Gateway 是什么？

Gateway 是 OpenClaw 的**核心运行时服务**，是一个 WebSocket 服务器，提供：

1. **统一通信入口** - 所有客户端通过 WebSocket 连接
2. **RPC 方法调用** - 提供 100+ 方法供客户端调用
3. **心跳调度** - 定期触发心跳检查 HEARTBEAT.md
4. **任务队列** - 管理任务执行，防止并发冲突
5. **通道管理** - 管理 WhatsApp/Telegram/Discord 等消息通道
6. **配置热重载** - 支持配置更新不重启

### 核心 RPC 方法

| 方法类别 | 方法示例 | 说明 |
|----------|----------|------|
| **健康检查** | `health`, `status` | 检查服务状态 |
| **配置管理** | `config.get`, `config.set`, `config.apply` | 读写配置 |
| **任务调度** | `cron.list`, `cron.add`, `cron.run` | 定时任务管理 |
| **会话管理** | `sessions.list`, `sessions.reset` | 会话管理 |
| **心跳控制** | `last-heartbeat`, `set-heartbeats`, `wake` | 心跳控制 |
| **Agent 调用** | `agent`, `agent.wait` | 执行 Agent |

### 心跳机制详解

```
Gateway 启动
    ↓
启动 HeartbeatRunner
    ↓
每 30 分钟 (可配置)
    ↓
读取 HEARTBEAT.md
    ↓
有任务 → 调用 Agent 执行
无任务 → 回复 HEARTBEAT_OK
    ↓
更新心跳状态
```

**关键代码**:
- `src/infra/heartbeat-runner.ts` - 心跳运行器
- `src/auto-reply/heartbeat.ts` - 心跳提示词处理
- `src/web/auto-reply/heartbeat-runner.ts` - WhatsApp 心跳

### 任务队列机制

```
消息到达
    ↓
入队 (按 session key 分组)
    ↓
队列模式选择:
  - collect: 合并消息
  - steer: 注入当前运行
  - followup: 等待下一轮
    ↓
执行 Agent
    ↓
返回结果
```

**关键代码**:
- `src/auto-reply/queue.ts` - 队列实现
- `src/process/command-queue.ts` - 命令队列

### 记忆系统机制

OpenClaw 的记忆系统基于**文件系统**：

```
~/.openclaw/workspace/
├── AGENTS.md      # 操作指令 + 记忆
├── SOUL.md        # 人格设定
├── USER.md        # 用户信息
├── MEMORY.md      # 长期记忆
├── HEARTBEAT.md   # 心跳任务
└── memory/        # 每日记忆
    └── YYYY-MM-DD.md
```

**启动时加载**:
1. 读取 BOOTSTRAP.md (首次运行)
2. 读取 SOUL.md (人格)
3. 读取 USER.md (用户)
4. 读取 AGENTS.md (指令)
5. 读取 memory/YYYY-MM-DD.md (今日记忆)

### Nezha 需要借鉴的核心点

1. **心跳机制** - 定期检查任务，无任务时自主学习
2. **任务队列** - 防止并发冲突，序列化执行
3. **文件协议** - HEARTBEAT.md 作为任务入口
4. **Bootstrap 文件** - 启动时加载上下文
5. **PostgreSQL 增强** - 用数据库替代文件系统，实现永久记忆

## 讨论 1: PostgreSQL 18 替代 Gateway 的可行性分析

### OpenClaw Gateway 核心功能

| 功能 | Gateway 实现 | 说明 |
|------|-------------|------|
| **通信入口** | WebSocket 服务器 | 客户端连接、RPC 调用 |
| **心跳调度** | HeartbeatRunner | 定期检查 HEARTBEAT.md |
| **任务队列** | CommandQueue | 防止并发冲突 |
| **事件通知** | WebSocket 推送 | 实时通知客户端 |
| **配置管理** | 文件 + 内存 | 热重载配置 |
| **会话管理** | 内存 + 文件 | 会话状态持久化 |

### PostgreSQL 18 对应能力

| Gateway 功能 | PostgreSQL 18 能力 | 可行性 |
|-------------|-------------------|--------|
| **通信入口** | LISTEN/NOTIFY + 轮询 | ⚠️ 需要客户端轮询或长连接 |
| **心跳调度** | pg_cron (需安装) 或外部触发 | ✅ 可行 |
| **任务队列** | SKIP LOCKED + UNLOGGED 表 | ✅ 完美替代 |
| **事件通知** | LISTEN/NOTIFY | ✅ 原生支持 |
| **配置管理** | 表存储 + 触发器 | ✅ 可行 |
| **会话管理** | 表存储 | ✅ 可行 |

### PostgreSQL 18 关键特性

#### 1. LISTEN/NOTIFY - 事件通知

```sql
-- 客户端监听
LISTEN heartbeat_channel;

-- 触发心跳
NOTIFY heartbeat_channel, '{"type": "heartbeat", "timestamp": "2025-03-15T12:00:00Z"}';

-- 查看通知队列使用率
SELECT pg_notification_queue_usage();
```

**优势**：
- 原生支持，无需额外依赖
- 低延迟，实时推送
- 支持负载均衡

**局限**：
- 需要保持数据库连接
- 通知不持久化（断线丢失）

#### 2. SKIP LOCKED - 任务队列

```sql
-- 创建任务队列表
CREATE UNLOGGED TABLE task_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

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

**优势**：
- 并发安全，无需额外锁
- UNLOGGED 表性能接近 Redis
- 支持事务，保证一致性

#### 3. 异步 I/O (AIO) - 性能提升

```sql
-- PostgreSQL 18 新增配置
SHOW io_method;          -- worker
SHOW io_workers;         -- 3
SHOW io_max_concurrency; -- 64
```

**优势**：
- 大幅提升 I/O 密集操作性能
- 更好的存储资源控制

#### 4. pgvector - 语义检索

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

### 架构对比

#### OpenClaw Gateway 架构

```
┌─────────────┐     WebSocket     ┌─────────────┐
│   Client    │ ←───────────────→ │   Gateway   │
│  (编辑器)    │                   │  (Node.js)  │
└─────────────┘                   └──────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │ 文件系统  │        │  SQLite  │        │  Agent   │
              │ (记忆)    │        │ (状态)   │        │ (执行)   │
              └──────────┘        └──────────┘        └──────────┘
```

#### Nezha PostgreSQL 架构（提议）

```
┌─────────────┐     LISTEN/NOTIFY     ┌─────────────┐
│   Client    │ ←───────────────────→ │  PostgreSQL │
│  (编辑器)    │       或轮询          │     18      │
└─────────────┘                       └──────┬──────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
              ┌──────────┐            ┌──────────┐            ┌──────────┐
              │ memories │            │  tasks   │            │  events  │
              │   表      │            │   表     │            │   表     │
              │ + vector │            │ + queue  │            │ + notify │
              └──────────┘            └──────────┘            └──────────┘
```

### 关键问题：如何触发 Agent 执行？

OpenClaw Gateway 的核心是**触发 Agent 执行**。PostgreSQL 无法直接调用外部 API，需要：

#### 方案 A: 外部轮询器

```
PostgreSQL (任务表)
      ↑
      │ 轮询 (每秒)
      │
外部进程 (Node.js/Bun)
      │
      ▼
编辑器 AI (通过 skill)
```

#### 方案 B: 触发器 + 外部通知

```sql
-- 任务插入时触发通知
CREATE OR REPLACE FUNCTION notify_task()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('task_channel', json_build_object(
    'id', NEW.id,
    'type', NEW.task_type,
    'payload', NEW.payload
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_notify
AFTER INSERT ON task_queue
FOR EACH ROW EXECUTE FUNCTION notify_task();
```

### 初步结论

| 方面 | 结论 |
|------|------|
| **任务队列** | ✅ PostgreSQL 18 完美替代 |
| **记忆存储** | ✅ PostgreSQL + pgvector 更强 |
| **事件通知** | ⚠️ LISTEN/NOTIFY 可用，但需保持连接 |
| **心跳调度** | ⚠️ 需要外部触发器或 pg_cron |
| **Agent 执行** | ❌ PostgreSQL 无法直接执行，需要外部进程 |

**核心问题**：PostgreSQL 是**数据存储**，不是**运行时服务**。它不能替代 Gateway 的**执行能力**。

**建议方向**：
1. PostgreSQL 作为**状态存储**和**任务队列**
2. 保留一个**轻量级触发器**（不是完整的 Gateway）
3. 触发器通过 skill 调用编辑器 AI

---

## 讨论 2: OpenCode WebSocket 模式研究

### OpenCode 架构

OpenCode 采用 **C/S 架构**，支持多种运行模式：

| 命令 | 模式 | 说明 |
|------|------|------|
| `opencode` | TUI 模式 | 终端交互界面 |
| `opencode serve` | 无头服务器 | WebSocket + HTTP API |
| `opencode attach` | 客户端 | 连接到运行中的服务器 |
| `opencode web` | Web 界面 | 启动 Web UI |
| `opencode acp` | ACP 服务器 | Agent Client Protocol |
| `opencode run` | 单次执行 | 执行消息后退出 |

### OpenCode WebSocket 能力

```bash
# 启动无头服务器
opencode serve --port 4096 --hostname 0.0.0.0

# 客户端连接
opencode attach http://localhost:4096

# 支持 mDNS 服务发现
opencode serve --mdns --mdns-domain opencode.local
```

**关键特性**：
- HTTP API + WebSocket 长连接
- 加密通信
- 多会话并行处理
- 远程控制（手机驱动桌面开发机）

### OpenCode vs OpenClaw Gateway 对比

| 功能 | OpenClaw Gateway | OpenCode serve |
|------|-----------------|----------------|
| **WebSocket 服务器** | ✅ | ✅ |
| **心跳调度** | ✅ HeartbeatRunner | ❓ 需验证 |
| **任务队列** | ✅ CommandQueue | ✅ 内置 |
| **RPC 方法** | ✅ 100+ 方法 | ❓ 有限 |
| **通道管理** | ✅ WhatsApp/Telegram/Discord | ❌ |
| **配置热重载** | ✅ | ❓ 需验证 |
| **记忆系统** | ✅ 文件系统 | ✅ SQLite |

### OpenCode 作为 Gateway 的可行性

**优势**：
- ✅ 已有 WebSocket 服务器
- ✅ 已有会话管理
- ✅ 已有记忆存储（SQLite）
- ✅ 支持 ACP 协议

**劣势**：
- ❌ 没有心跳机制（需要外部触发）
- ❌ 没有通道管理（WhatsApp/Telegram 等）
- ❌ RPC 方法有限

**结论**：OpenCode 可以作为**轻量级 Gateway**，但需要：
1. 外部心跳触发器
2. PostgreSQL 替代 SQLite（永久记忆）
3. 通过 skill 调用编辑器 AI

---

## 讨论 3: OpenClaw System Prompt 机制研究

### System Prompt 的作用

System Prompt 是 OpenClaw 控制 Agent 行为的核心机制：

```
┌─────────────────────────────────────────────────────────────┐
│                    System Prompt 结构                        │
├─────────────────────────────────────────────────────────────┤
│  1. 身份定义: "You are a personal assistant..."             │
│  2. 工具列表: read, write, exec, grep, ...                  │
│  3. 安全规则: 不追求自我保存、不绕过安全措施                   │
│  4. Skills 指引: 如何选择和执行 skill                        │
│  5. 记忆检索: memory_search, memory_get                     │
│  6. 心跳机制: HEARTBEAT_OK 响应规则                          │
│  7. 项目上下文: SOUL.md, USER.md, AGENTS.md, ...            │
│  8. 运行时信息: agent, host, model, ...                     │
└─────────────────────────────────────────────────────────────┘
```

### 心跳机制详解

**System Prompt 中的心跳部分**：

```markdown
## Heartbeats
Heartbeat prompt: (configured)
If you receive a heartbeat poll (a user message matching the heartbeat prompt above), 
and there is nothing that needs attention, reply exactly:
HEARTBEAT_OK

OpenClaw treats a leading/trailing "HEARTBEAT_OK" as a heartbeat ack (and may discard it).
If something needs attention, do NOT include "HEARTBEAT_OK"; reply with the alert text instead.
```

**心跳流程**：

```
HeartbeatRunner (每 30 分钟)
        ↓
检查 HEARTBEAT.md 文件
        ↓
构造心跳消息 (包含当前时间、系统事件等)
        ↓
发送给 Agent
        ↓
Agent 响应:
  - HEARTBEAT_OK → 无事可做，丢弃响应
  - 其他内容 → 有任务需要处理，执行
        ↓
更新心跳状态
```

### 关键代码位置

| 文件 | 作用 |
|------|------|
| `src/agents/system-prompt.ts` | 构建 System Prompt |
| `src/infra/heartbeat-runner.ts` | 心跳运行器 |
| `src/auto-reply/heartbeat.ts` | 心跳提示词处理 |
| `src/agents/workspace.ts` | HEARTBEAT.md 文件路径 |

### 心跳触发条件

```typescript
// 心跳跳过的原因
type HeartbeatSkipReason = 
  | "disabled"           // 心跳被禁用
  | "quiet-hours"        // 静默时段
  | "requests-in-flight" // 有正在处理的请求
  | "no-heartbeat-file"  // 没有 HEARTBEAT.md
  | "empty-heartbeat"    // HEARTBEAT.md 为空
  | "no-events";         // 没有系统事件
```

### Nezha 如何借鉴

**核心思路**：通过 System Prompt 让编辑器 AI "保持活跃"

```
┌─────────────────────────────────────────────────────────────┐
│                    Nezha 心跳设计                            │
├─────────────────────────────────────────────────────────────┤
│  1. PostgreSQL 存储任务和记忆                                │
│  2. 外部触发器定期检查 PostgreSQL                            │
│  3. 触发器通过 skill 调用编辑器 AI                           │
│  4. System Prompt 包含心跳规则                               │
│  5. AI 响应 HEARTBEAT_OK 或执行任务                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 讨论 4: 三种架构方案对比

### 方案 A: Nezha 自建 Gateway

```
┌─────────────┐     WebSocket     ┌─────────────┐
│  编辑器 AI   │ ←───────────────→ │ Nezha       │
│  (OpenCode) │                   │  Gateway    │
└─────────────┘                   └──────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │PostgreSQL│        │ 心跳调度  │        │ 任务队列  │
              │  (存储)   │        │ (Runner) │        │ (Queue)  │
              └──────────┘        └──────────┘        └──────────┘
```

**优点**：完全控制，功能完整
**缺点**：开发量大，需要实现完整的 Gateway

### 方案 B: 复用 OpenCode serve

```
┌─────────────┐     WebSocket     ┌─────────────┐
│  外部触发器  │ ─────────────────→│ OpenCode    │
│  (心跳)     │                   │  serve      │
└─────────────┘                   └──────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │PostgreSQL│        │  SQLite   │        │  Skill   │
              │  (记忆)   │        │  (会话)   │        │  (调用)  │
              └──────────┘        └──────────┘        └──────────┘
```

**优点**：复用现有基础设施，开发量小
**缺点**：功能受限，依赖 OpenCode

### 方案 C: 纯 PostgreSQL + Skill

```
┌─────────────┐                   ┌─────────────┐
│  外部触发器  │ ─────────────────→│ PostgreSQL  │
│  (心跳)     │                   │    18       │
└─────────────┘                   └──────┬──────┘
                                         │ LISTEN/NOTIFY
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │ 任务队列  │        │  记忆存储  │        │ 事件通知  │
              │ (SKIP    │        │ (pgvector)│        │ (NOTIFY) │
              │  LOCKED) │        │           │        │          │
              └──────────┘        └──────────┘        └──────────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │  编辑器 AI   │
                                  │  (通过skill) │
                                  └─────────────┘
```

**优点**：架构最简单，PostgreSQL 功能强大
**缺点**：需要外部触发器，没有 WebSocket

---

---

## 讨论 5: OpenClaw 心跳核心实现（抄作业）

### 心跳流程图

```
HeartbeatRunner (定时器 
        ↓
检查条件
        ↓
resolveHeartbeatPreflight (预检)
        ↓
读取 HEARTBEAT.md
        ↓
构造心跳消息
        ↓
调用 getReplyFromConfig (执行 Agent)
        ↓
处理响应:
  - HEARTBEAT_OK → 丢弃，修剪 transcript
  - 其他内容 → 执行任务
```

### 关键代码位置

| 文件 | 作用 |
|------|------|
| `src/infra/heartbeat-runner.ts` | 心跳运行器 |
| `src/auto-reply/reply/get-reply.ts` | 获取回复 |
| `src/auto-reply/reply/agent-runner-execution.ts` | 执行 Agent |
| `src/agents/pi-embedded-runner.ts` | 嵌入式 Agent 运行器 |
| `src/agents/system-prompt.ts` | System Prompt 构建 |

### Nezha 实现方案

**直接抄 OpenClaw 的心跳机制**：

```typescript
// 1. 心跳运行器
class HeartbeatRunner {
  private timer: NodeJS.Timeout | null;
  private config: NezhaConfig;
  
  start() {
    this.timer = setInterval(() => {
      this.runHeartbeat();
    }, this.config.heartbeatInterval);
  }
  
  private async runHeartbeat() {
    // 检查是否有正在处理的请求
    if (this.hasActiveRequests()) {
      return { status: 'skipped', reason: 'requests-in-flight' };
    }
    
    // 读取 HEARTBEAT.md
    const heartbeatContent = await this.readHeartbeatFile();
    if (this.isEmpty(heartbeatContent)) {
      return { status: 'skipped', reason: 'empty-heartbeat' };
    }
    
    // 构造心跳消息
    const message = this.buildHeartbeatMessage(heartbeatContent);
    
    // 调用编辑器 AI (通过 skill)
    const response = await this.invokeEditorAI(message);
    
    // 处理响应
    if (this.isHeartbeatOk(response)) {
      return { status: 'ok' };
    }
    
    // 执行任务
    return { status: 'ran', response };
  }
}

// 2. 调用编辑器 AI
async invokeEditorAI(message: string) {
  // 使用 skill 调用编辑器 AI
  // 例如：opencode run --message "..."
}
```

### 下一步

1. 研究 OpenClaw 的 skill 机制
2. 设计 Nezha 的 skill 接口
3. 实现心跳运行器

---

---

## 讨论 6: OpenClaw Skill 机制研究

### Skill 文件结构

```
skill-name/
├── SKILL.md (必需)
│   ├── YAML frontmatter (必需)
│   │   ├── name: skill名称
│   │   ├── description: 触发描述 (关键！)
│   │   └── metadata: (可选)
│   │       ├── emoji: 图标
│   │       ├── requires: 依赖条件
│   │       │   ├── bins: 需要的二进制
│   │       │   ├── env: 需要的环境变量
│   │       │   └── config: 需要的配置
│   │       └── install: 安装说明
│   └── Markdown 内容 (使用说明)
└── 可选资源
    ├── scripts/    - 可执行脚本
    ├── references/ - 参考文档
    └── assets/     - 输出资源
```

### Skill 加载路径 (优先级从低到高)

1. `extraDirs` - 配置指定的额外目录
2. `bundledSkillsDir` - 内置 skills
3. `~/.openclaw/skills` - 托管 skills
4. `~/.agents/skills` - 个人 agents skills
5. `./.agents/skills` - 项目 agents skills
6. `./skills` - 工作区 skills

### Skill 示例: coding-agent

```yaml
---
name: coding-agent
description: 'Delegate coding tasks to Codex, Claude Code, or Pi agents...'
metadata:
  {
    "openclaw": { "emoji": "🧩", "requires": { "anyBins": ["claude", "codex", "opencode", "pi"] } },
  }
---
```

**关键发现**:
- `description` 是触发机制，必须清晰描述何时使用
- `requires.bins` / `requires.anyBins` 检查依赖
- Skill 通过 bash tool 调用外部 CLI

### Skill 调用方式

```bash
# OpenCode
bash pty:true workdir:~/project command:"opencode run 'Your task'"

# Claude Code
bash workdir:~/project command:"claude --permission-mode bypassPermissions --print 'Your task'"

# Codex
bash pty:true workdir:~/project command:"codex exec --full-auto 'Build feature'"
```

### Nezha Skill 设计思路

**直接复用 OpenClaw 的 skill 格式**:

1. **HEARTBEAT.md** - 心跳任务定义
2. **skills/** - 存放 Nezha 专用 skills
3. **调用编辑器 AI** - 通过 skill 调用 opencode/claude

### 关键代码位置

| 文件 | 作用 |
|------|------|
| `src/agents/skills/workspace.ts` | Skill 加载和构建 |
| `src/agents/skills/types.ts` | Skill 类型定义 |
| `skills/*/SKILL.md` | Skill 定义文件 |

---

## 待讨论

1. ~~PostgreSQL 18 替代 Gateway 的可行性~~ ✅ 已分析
2. ~~OpenCode WebSocket 模式研究~~ ✅ 已分析
3. ~~OpenClaw System Prompt 机制研究~~ ✅ 已分析
4. ~~OpenClaw 心跳核心实现（抄作业）~~ ✅ 已分析
5. ~~研究 OpenClaw 的 skill 机制~~ ✅ 已分析
6. **设计 Nezha 的 skill 接口**
7. **实现心跳运行器**

## 参考

- OpenClaw 源码: `/Users/jk/gits/hub/openclaw`
- OpenClaw 文档: https://docs.openclaw.ai
- AgentSkills 规范: https://agentskills.io
- Gateway 核心代码: `src/gateway/server.impl.ts`
- 心跳机制: `src/infra/heartbeat-runner.ts`
- PostgreSQL 18 文档: https://www.postgresql.org/docs/18/
