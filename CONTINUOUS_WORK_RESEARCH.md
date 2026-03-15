# Nezha 项目开发计划

## 项目目标

1. **持续工作** - 让编辑器 AI 能持续运行，定时执行任务
2. **永久记忆** - 知识、经验长期存储和检索
3. **自主工作** - AI 能自主分析、决策、执行

---

## 一、架构设计

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL (知识中枢)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  tasks      │  │  knowledge  │  │  memories   │       │
│  │  任务队列   │  │  知识库     │  │  记忆       │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────┘
         ↑                  ↑                  ↑
         │                  │                  │
┌────────┴──────────────────┴──────────────────┴────────┐
│                   Nezha Core Engine                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ Scheduler   │  │ Memory      │  │ Agent       │  │
│  │ (调度)      │  │ (记忆)      │  │ (执行)      │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└───────────────────────────────────────────────────────┘
         ↑
         ↓
┌─────────────────────────────────────────────────────────────┐
│                  opencode (执行引擎)                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心模块

| 模块 | 职责 |
|------|------|
| Scheduler | 定时调度，触发 heartbeat |
| Memory | 记忆存储和检索 |
| Agent | 封装 opencode API 调用 |
| Config | 统一配置管理 |

---

## 二、开发规范（必须遵守）

### 2.1 完全 OOP

- 所有模块必须是 class
- 使用依赖注入
- 禁止直接 new

```typescript
// ✅ 正确
class DatabaseClient {
  constructor(private config: DbConfig) {}
}

// ❌ 错误
const client = new DatabaseClient('localhost', 5432);
```

### 2.2 零 Hardcode

**禁止**：
- 路径 hardcode：`/Users/jk/gits/...`
- 字符串 hardcode：`'pending'`, `'completed'`
- 数字 hardcode：`30 * 60 * 1000`

**必须**：
- 所有配置通过 Config 类
- 使用常量定义枚举
- 使用环境变量或配置文件

```typescript
// ✅ 正确
class TaskStatus {
  static readonly PENDING = 'pending';
  static readonly COMPLETED = 'completed';
}

class Config {
  static readonly DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
}

// ❌ 错误
const status = 'pending';
const interval = 1800000;
```

### 2.3 目录结构

```
src/
├── config/
│   ├── Config.ts        # 配置类
│   ├── constants.ts    # 常量定义
│   └── types.ts        # 类型定义
├── core/
│   ├── Scheduler.ts    # 调度器
│   ├── Memory.ts        # 记忆管理
│   └── Agent.ts        # Agent 封装
├── db/
│   ├── Client.ts       # 数据库客户端
│   ├── repositories/   # 数据仓库
│   └── migrations/    # 数据库迁移
├── services/
│   ├── HeartbeatService.ts
│   └── TaskService.ts
└── index.ts
```

---

## 三、开发阶段

### Phase 1: 基础设施

1. **Config 模块**
   - 定义配置类
   - 环境变量加载
   - 常量定义

2. **Database 模块**
   - PostgreSQL 连接池
   - Repository 基类
   - 基础 migrations

3. **测试**：数据库连接测试

### Phase 2: 核心功能

1. **Scheduler 模块**
   - Heartbeat 定时器
   - 任务队列管理

2. **Memory 模块**
   - 记忆 CRUD
   - 项目隔离

3. **Agent 模块**
   - opencode API 封装
   - 会话管理

### Phase 3: 集成

1. **Heartbeat 流程**
   - 读取 HEARTBEAT.md
   - 调用 opencode
   - 结果存储

2. **CLI 入口**
   - nezha 命令行工具

---

## 四、验收标准

### 4.1 代码规范

- [ ] 无 hardcode 字符串/路径
- [ ] 所有 class 有类型定义
- [ ] 使用依赖注入
- [ ] 遵循单一职责

### 4.2 功能测试

- [ ] 数据库连接正常
- [ ] 任务增删改查
- [ ] 记忆存储和检索
- [ ] Heartbeat 定时触发
- [ ] opencode API 调用成功

### 4.3 集成测试

- [ ] 完整流程：触发 → 执行 → 存储

---

## 五、opencode 评审反馈

### 5.1 架构合理性 ✅

整体架构合理，Node.js 内置定时方案正确。

### 5.2 缺失组件（待补充）

| 缺失 | 建议 |
|------|------|
| **错误处理** | 添加重试机制、指数退避 |
| **日志系统** | 添加日志框架 |
| **健康检查** | 添加 /health 端点 |
| **优雅关闭** | SIGTERM 处理 |
| **配置校验** | schema 验证 |

### 5.3 编码规范补充

```typescript
// 当前
static readonly PENDING = 'pending';

// 建议
static readonly PENDING = 'pending' as const;
```

### 5.4 改进建议

**高优先级**：
1. 添加错误处理策略
2. 添加日志框架
3. 补充 graceful shutdown

**中优先级**：
1. 添加 health endpoint
2. 补充 bootstrap 文件列表

---

## 六、研究记录

### 1.1 测试过程

#### 测试 1：PG 任务表操作
```bash
# 创建任务表
CREATE TABLE tasks (...)

# 插入任务
INSERT INTO tasks (title, description) VALUES (...)

# 读取待执行任务
SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority LIMIT 1

# 更新任务状态
UPDATE tasks SET status = 'completed' WHERE id = ...
```
**结果**：✅ 通过

#### 测试 2：opencode API 激活
```bash
# 启动服务
opencode serve --port 4098

# 创建会话
curl -X POST http://127.0.0.1:4098/session

# 发送消息
curl -X POST .../session/{id}/message -d '{"parts":[{"type":"text","text":"..."}]}'
```
**结果**：✅ AI 响应正常

#### 测试 3：AI 自主分析项目
```
发送消息：Analyze this project. What is the current state?

AI 响应：读取了 README.md, package.json, src/ 下文件，分析出：
- 哪些模块完成了
- 哪些是空 stub
- 发现的问题
```
**结果**：✅ 真实 AI 自主分析

#### 测试 4：AI 修复 bug
```
AI 发现：src/daemon/heartbeat.ts 有 import 路径错误
AI 修复：./db/client.js → ../db/client.js
```
**结果**：✅ AI 自己发现问题并修复

#### 测试 5：AGENTS.md 影响 AI
```
创建 AGENTS.md，定义优先级：P0=研究龙虾，P1=实现

询问：What are the current priorities?

AI 响应：严格按照 AGENTS.md 的优先级回答
```
**结果**：✅ AI 遵守引导文件

#### 测试 6：HEARTBEAT.md 定义任务
```
让 AI 按格式创建 HEARTBEAT.md 任务列表
AI 更新了 HEARTBEAT.md，添加了 Check project status 等任务
```
**结果**：✅ 生效

### 1.2 测试结论

**持续工作可为** ✅

- opencode 可以被激活执行真实任务
- 通过 AGENTS.md/HEARTBEAT.md 可以引导 AI 行为
- AI 能够自主分析项目、发现问题、修复代码

### 1.3 持续工作实现模式

```
┌─────────────────────────────────────────────────────────────┐
│                      实现架构                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 引导文件（Bootstrap）                                   │
│     AGENTS.md    → 定义优先级、规则                         │
│     HEARTBEAT.md → 任务清单                                 │
│     MEMORY.md    → 长期记忆                                │
│                                                             │
│  2. 触发机制                                               │
│     Heartbeat Daemon (Node.js)                              │
│     - 定时读取 HEARTBEAT.md                                 │
│     - 调用 opencode API 执行任务                            │
│     - 结果存回 PG                                           │
│                                                             │
│  3. 执行引擎                                               │
│     opencode serve (HTTP API) ← 不需要 Gateway              │
│                                                             │
│  4. 存储                                                   │
│     PostgreSQL (任务、知识、记忆)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 Gateway 分析结论

**实验中用到的**：
- `opencode serve` - HTTP 服务器（不是 Gateway）
- `opencode run` - CLI 命令
- HTTP API 调用

**结论**：不需要 Gateway。

| OpenClaw Gateway 功能 | 我们的方案 |
|----------------------|-----------|
| WebSocket 连接 | ❌ 不需要，opencode 用 HTTP |
| 定时触发 | 自己写 Heartbeat Daemon |
| System Prompt 构建 | 通过 AGENTS.md 文件 |
| 消息路由 | opencode 内置 |

**可用 PG + 自己写的东西解决**：
- 任务存 PG
- Daemon 读取并调用 opencode API

---

## 二、待研究目标

### 2.1 永久记忆

#### OpenClaw 记忆机制

**记忆文件**：
```
~/.openclaw/workspace/
├── MEMORY.md        # 主记忆文件
├── memory.md        # 备选
└── memory/
    └── YYYY-MM-DD.md  # 每日记忆
```

**搜索工具**：
- `memory_search` - 语义搜索记忆
- `memory_get` - 读取具体内容

**向量数据库**：
- qmd (qdrant) - 需要额外服务
- builtin - 内置搜索

#### 我们的方案：PostgreSQL 增强

```
PostgreSQL 记忆表：
- memories (id, project_id, content, source, tags, created_at)
- 通过 project_id 隔离不同项目
```

**优势**：
- 不需要额外服务（qdrant）
- 与任务存储同一数据库
- 易于备份和迁移
- **不用担心混淆**：通过 project_id 查询即可获得任意层次的结果

### 2.2 自主工作

#### OpenClaw Skill 系统

**Skill 本质**：定义 AI 的行为规范和步骤化指导

**SKILL.md 格式**：
```yaml
---
name: skill-name
description: 技能描述
---

# 技能名称

## Overview
...

## Core rules
- 规则1
- 规则2

## Workflow (follow in order)
### 1) 步骤1
### 2) 步骤2
```

**示例**：healthcheck skill - 定义了安全审计的完整流程

#### 我们的方案

**简化版 Skill**：
- 项目目录下的 skills/ 文件夹
- SKILL.md 定义行为规范
- 供 AI 按需读取

**自主工作实现**：
- 通过 HEARTBEAT.md 触发自主任务
- AI 按照 Skill 定义工作
- 结果存入记忆

---

## 三、待解决问题

---

## 二、OpenClaw (龙虾) 机制分析

### 2.1 Heartbeat 核心流程

```
Gateway 启动
    ↓
每 30 分钟 (可配置)
    ↓
检查 HEARTBEAT.md 是否为空
    ↓ 有任务
执行任务 → 返回结果
    ↓ 无任务
回复 HEARTBEAT_OK
    ↓
等待下一次心跳
```

### 2.2 HEARTBEAT.md 任务入口

- Agent 被指示：**"Read HEARTBEAT.md if it exists, Follow it strictly"**
- 空文件直接跳过 API 调用（节省资源）
- 文件格式：Markdown 任务列表

### 2.3 System Prompt Bootstrap 文件

| 文件 | 作用 |
|------|------|
| AGENTS.md | Agent 定义和指令 |
| SOUL.md | 身份/角色 |
| TOOLS.md | 工具说明 |
| IDENTITY.md | 身份配置 |
| USER.md | 用户配置 |
| HEARTBEAT.md | 任务清单 |
| MEMORY.md | 长期记忆 |

### 2.4 Gateway 核心职责

1. WebSocket 连接管理（保持长连接）
2. 定时触发 heartbeat
3. 构建 system prompt
4. 消息路由和分发
5. 任务队列防并发

---

## 三、OpenCode 功能分析

### 3.1 持续运行

| 方法 | 说明 |
|------|------|
| `opencode serve` | 启动 headless HTTP 服务器，可持续运行 |
| `opencode web` | 启动带 Web 界面 |
| systemd 服务 | 社区方案：持久服务 |

### 3.2 Agent 模式

- `opencode --agent` 启用
- 可做决策、运行命令、读写文件
- 支持自定义 agent

### 3.3 扩展机制

| 机制 | 说明 |
|------|------|
| Plugins | 事件钩子（file.edited, session.created 等） |
| Skills | SKILL.md 行为规范 |
| MCP | Model Context Protocol 支持 |
| ACP | Agent Client Protocol |

### 3.4 外部集成

- HTTP REST API（完整）
- SSE 事件流
- 无原生 WebSocket

### 3.5 关键限制

| 功能 | 支持情况 |
|------|---------|
| 定时任务 | ❌ 无内置，需外部 cron |
| 任务队列 | ❌ 无内置 |
| WebSocket | ❌ 仅 HTTP/SSE |

---

## 四、PostgreSQL 最新功能分析

### 4.1 可用功能

| 功能 | 说明 | 状态 |
|------|------|------|
| LISTEN/NOTIFY | 事件通知 | ✅ 可用 |
| SKIP LOCKED | 并发任务队列 | ✅ 可用 |
| pg_cron | 定时任务 | ⚠️ 需安装扩展 |
| JSONB | 结构化数据 | ✅ 可用 |
| pgvector | 向量搜索 | ⚠️ 需安装扩展 |

### 4.2 LISTEN/NOTIFY 特性

```sql
-- 监听
LISTEN task_channel;

-- 通知
NOTIFY task_channel, '{"event": "task_created", "task_id": "xxx"}';
```

**优点**：
- 原生支持，无需额外依赖
- 低延迟

**缺点**：
- 需要保持数据库连接
- 断线丢失通知
- 不持久化

---

## 五、方案对比

### 方案 A：纯 PostgreSQL + Node.js

```
┌─────────────────────────────────────────┐
│           PostgreSQL                    │
│  ┌─────────────┐  ┌─────────────┐      │
│  │ task_queue  │  │ LISTEN/     │      │
│  │ 表          │  │ NOTIFY      │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
         ↑              ↑
         │              │
    ┌────┴────┐    ┌────┴────┐
    │ cron job │    │ Node.js │
    │ 定时写入 │    │ 监听通知 │
    └──────────┘    └──────────┘
```

**实现方式**：
1. 外部 cron 每 30 分钟写入 task_queue
2. Node.js 监听 NOTIFY
3. 读取 HEARTBEAT.md
4. 调用 opencode API 执行

**优点**：
- 充分利用 PG 最新功能
- 任务持久化存储
- 无需额外消息队列

**缺点**：
- 需要外部 cron
- 连接保持问题
- 复杂度较高

### 方案 B：外部 cron + opencode API

```
┌─────────────────────────────────────────┐
│  cron (每30分钟)                         │
│       ↓                                 │
│  读取 HEARTBEAT.md                      │
│       ↓                                 │
│  opencode serve API                     │
│       ↓                                 │
│  执行任务 → 写入结果                     │
└─────────────────────────────────────────┘
```

**实现方式**：
1. 系统 cron 每 30 分钟触发
2. 脚本读取 HEARTBEAT.md
3. 调用 opencode API 执行
4. 更新任务状态

**优点**：
- 简单直接
- 依赖少
- 易于理解和维护

**缺点**：
- 需要系统 cron 权限
- 任务不持久化

### 方案 C：Node.js 内置定时 + opencode API

```
┌─────────────────────────────────────────┐
│  Node.js 进程 (守护进程)                  │
│  ┌─────────────────────────────────┐   │
│  │ setInterval (30分钟)            │   │
│  │   ↓                            │   │
│  │ 读取 HEARTBEAT.md              │   │
│  │   ↓                            │   │
│  │ opencode API                   │   │
│  │   ↓                            │   │
│  │ 写入结果到 PG                   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**实现方式**：
1. Node.js 守护进程
2. setInterval 定时触发
3. 读取 HEARTBEAT.md
4. 调用 opencode API
5. 结果存入 PostgreSQL

**优点**：
- 无需系统 cron
- 可与 PG 深度集成
- 灵活控制

**缺点**：
- 需要保持进程运行
- 需要处理进程守护

### 方案 D：克隆 Gateway 定制版

```
┌─────────────────────────────────────────┐
│  自定义 Gateway (WebSocket Server)       │
│  ┌─────────────────────────────────┐   │
│  │ WebSocket 客户端连接             │   │
│  │ Heartbeat Runner (30分钟)        │   │
│  │ System Prompt Builder            │   │
│  │ 任务队列 (SKIP LOCKED)           │   │
│  │ PostgreSQL 存储                  │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**实现方式**：
1. 克隆 OpenClaw Gateway 源码
2. 移除消息通道，保留 heartbeat
3. 用 opencode API 替代 LLM 调用
4. 任务存储 PG

**优点**：
- 完全掌控
- 与 OpenClaw 机制一致
- 可定制化

**缺点**：
- 工作量大
- 需要维护定制版本

---

## 六、方案对比总结

| 维度 | 方案A (PG+Node) | 方案B (cron) | 方案C (Node定时) | 方案D (Gateway) |
|------|-----------------|--------------|------------------|----------------|
| 依赖 | PG | 系统cron | Node | 大量 |
| 复杂度 | 中 | 低 | 低 | 高 |
| 持久化 | ✅ | ❌ | ✅ | ✅ |
| 实时性 | ✅ | ⚠️ | ✅ | ✅ |
| 可维护性 | 中 | 高 | 高 | 低 |
| 任务队列 | ✅ | ❌ | ❌ | ✅ |

---

## 七、建议

### 首选方案：方案 C (Node.js 内置定时)

理由：
1. 简单可靠
2. 无需系统权限
3. 可与 PostgreSQL 深度集成
4. 易于迭代

### 备选方案：方案 D (Gateway 定制)

理由：
1. 完全复刻 OpenClaw 机制
2. 长期来看更稳定

---

## 八、下一步

1. **验证 opencode serve API 可用性**
2. **实现方案 C 原型**
3. **测试 HEARTBEAT.md 读取逻辑**
4. **集成 PostgreSQL 存储**

---

## 十、待研究问题

- [ ] opencode serve API 响应格式
- [ ] HEARTBEAT.md 解析逻辑
- [ ] 任务结果如何回写
- [ ] 进程守护方案
- [x] **持续工作本质：吸引编辑器 AI 注意并作出反应**

## 十一、实验验证结果

### 11.1 成功验证

| 环节 | 测试 | 结果 |
|------|------|------|
| PG 任务表 | 增删改查 | ✅ 通过 |
| opencode 激活 | 发送任务 | ✅ AI 响应 |
| AI 自主分析 | 读取项目分析状态 | ✅ 真实工作 |
| AI 修复 bug | 自己发现问题并修复 | ✅ 真实工作 |
| AGENTS.md 影响 | AI 读取并遵守优先级 | ✅ 生效 |
| HEARTBEAT.md | AI 读取并执行任务 | ✅ 生效 |

### 11.2 结论：持续工作可为 ✅

验证表明：
- opencode 可以被激活执行真实任务
- 通过 AGENTS.md/HEARTBEAT.md 可以引导 AI 行为
- AI 能够自主分析项目、发现问题、修复代码

---

## 三、待解决问题

### 问题 1：超时
- **现象**：opencode API 调用超时（>120s）
- **影响**：无法获取任务执行结果
- **方案**：
  - 轮询会话状态
  - 简化任务，分批执行

### 问题 2：权限
- **现象**：opencode 默认拒绝外部目录访问
- **龙虾做法**：需研究（记录在 TODO）
- **临时方案**：限制在读取权限

### 问题 3：任务结果回写
- **现象**：任务完成后状态更新问题
- **方案**：
  - 轮询检查文件变化
  - 使用 plugin 钩子
  - 简化：检查输出文件

---

## TODO：龙虾权限研究
- [ ] 龙虾如何管理权限
- [ ] 为什么龙虾可以给大模型极高权限
- [ ] opencode 权限机制
