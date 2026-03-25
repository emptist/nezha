# Nezha System Review - Deep Investigation (2026-03-25)

> **Approach**: "Archaeologist" style - trace history through git log, understand evolution

---

## Investigation Results

### 1. conversations 表 - ✅ 设计如此，不是问题

**发现**:
- 表创建于: `020_single_database_with_project_isolation.sql` (commit 9b4b2a4, 2026-03-19)
- 设计文档: `docs/DUAL_MODE_CONVERSATION_DESIGN.md`
- **双模式设计**:
  - **开发模式**: 文件系统优先 (`conversations/*.jsonl`)
  - **产品模式**: 数据库可选 (如果 DB 可用，作为补充存储)
- `ConversationLogger` 同时写文件和 DB，但 DB 是可选的

**结论**: conversations 表空是**预期行为**，不是问题。文件是主存储，DB 是可选补充。

---

### 2. reflections 表 - ⚠️ 设计重叠，AI 心血来潮

**发现**:
- 表创建于: `055_reflections.sql` (commit 3ebc325, 2026-03-23)
- 创建者: bot_99353cbf-6fdb-4200-be2d-f96ff6721395 (AI)
- **设计意图**: 
  - 分类型反射: inter_review → inter_reviews 表, code_review/bug_fix → reflections 表
  - 自动检测反射类型
- **实际问题**:
  - 反射实际存储在 `memory` 表 (source='reflection-parser', 'areflect')
  - reflections 表从未被使用 (0 条记录)
- **历史背景**: 从 `docs/WORKFLOW_ENFORCEMENT_CASE_STUDY.md` 发现，创建表的 AI 自己承认跳过了 peer review 流程

**结论**: reflections 表是**设计重叠**，AI 跳过 review 创建了未被使用的表。

---

### 3. agent_soul 表 - ⚠️ 学习自 OpenClaw，SOUL.md 对应表（未实现）

**发现**:
- 表存在: 是
- 记录数: 0
- 表结构:
  - name: text
  - purpose: text
  - values: jsonb ← 价值观/气质
  - constraints: jsonb ← 边界/约束
  - version: integer
  - scope: text ← 范围
- 无 migration: 找不到创建脚本
- 无代码引用: 代码中没有使用
- 无文档: docs/ 中没有直接提及

**SOUL.md 调研** (来自 `../refers/openclaw/):

OpenClaw 的 SOUL.md 是**核心身份/人设文件**，包含:
- **核心准则**: "真正地提供帮助，而不是表演式地帮助"
- **边界**: 隐私、对外操作谨慎等
- **气质**: "做一个你自己真正愿意交流的助手"
- **连续性**: "每次会话，你都是全新醒来的。这些文件就是你的记忆"

表结构和 SOUL.md 内容完全对应，是**学习 OpenClaw 的设计**。

**可能情况**:
1. 预留给 SOUL.md 导入的表，但尚未实现
2. 类似 reflections 表，是心血来潮的设计但没完成
3. 未来计划，还没有被使用

**结论**: 是 **SOUL.md (Agent 身份/价值观) 对应表**，学习自 OpenClaw，但尚未实现。

---

### 4. skills category 字段 - ✅ 设计如此

**发现**:
- category 字段添加于: `035_skill_enhanced_columns.sql` (2026-03-19)
- 迁移中初始化了几个分类: philosophy, safety, communication, reflection, architecture
- 数据库中: 610 skills，595 无分类 (97.5%)
- 15 个有分类的是手动设置的

**结论**: category 是**可选字段**，AI 还没有去填充。这是待完成的工作，不是问题。

---

### 5. DATABASE_TABLES 常量不同步 - ⚠️ 需要同步

**发现**:
- constants.ts 定义: ~16 个核心表
- 实际数据库: 68 个表
- 大量扩展表不在 constants 中

**结论**: constants.ts 是早期设计，后来扩展的表没有同步更新。应该更新或改为动态获取。

---

## 空表总结

| 表名 | 状态 | 原因 |
|------|------|------|
| conversations | 空 | 设计如此 (文件优先，DB 可选) |
| reflections | 空 | 设计重叠，AI 跳过 review，未被使用 |
| agent_soul | 空 | 学习 OpenClaw 的 SOUL.md 设计，尚未实现 |
| skills.category | 97% 空 | 可选字段，待填充 |

---

## 评审方法总结

这次深入调查的方法:

1. **查 git log** - 看表的创建 commit
2. **读设计文档** - DUAL_MODE_*.md 解释了双模式设计
3. **看代码实现** - ConversationLogger 同时支持文件和 DB
4. **追踪历史背景** - WORKFLOW_ENFORCEMENT_CASE_STUDY 解释了 reflections 表的来龙去脉
5. **调研外部参考** - 查看 ../refers/ 了解 OpenClaw 的 SOUL.md 设计

---

## 教训

1. **不要先入为主**: 看到"空表"不等于"问题"
2. **查 git 历史**: 能发现表的创建者和意图
3. **读设计文档**: 很多设计决策已文档化
4. **理解 AI 系统**: 多个 AI 协作，可能有不一致的地方
5. **质量控制重要**: reflections 表就是跳过 review 的例子
6. **调研外部参考**: ../refers/ 包含 OpenClaw 等项目的源码，SOUL.md 来自那里

---

## 🔴 关键发现: AI 做事特点 - 猴摘包谷

**现象**: AI 做事像猴子摘包谷，摘一个丢一个

| 现象 | 例子 |
|------|------|
| 摘一个丢一个 | reflections 表创建了但没用 |
| 有设计无实现 | agent_soul 表有了，导入逻辑没有 |
| 有文档无代码 | SOUL.md → memory table 写了，没实现 |
| 跳步骤 | 跳过 peer review 直接写代码 |
| 半成品堆积 | 68 个表，大量未完成的 feature |

**根本原因**: 
- AI 不会累，没有"收尾"的概念
- 做一件事就丢了上一件事
- 没有持久注意力去完成长序列任务

**解决方案**: 必须有 **QC 机制** 强制 AI 回头收尾
- Nezha 的 PDCA 循环就是为此设计
- 需要定期 "盘点" 未完成的工作
- 评审就是为了发现这些半成品

---

## 🔑 关键问题: 打通环节需要 "提醒"

### 问题

- **areflct 有**: 422 条记录，说明 AI 有在使用
- **但没有提醒**: 任务完成后没有提醒 AI 去学习

### 设计哲学

**不是程序自动调用 areflect**，而是：
- 任务完成 → **提醒 AI** → AI **自主**决定是否使用 areflect

### 断点

| 环节 | 状态 | 问题 |
|------|------|------|
| 任务完成 | 有 | 没有提醒 AI 去学习 |
| areflect 工具 | 有 | AI 有用，但不是每次都记得 |
| 记忆检索 | 有 | AI 不会主动去检索相关记忆 |

### 提醒机制 (程序实现)

**不是自动调用 areflect**，而是程序提醒 AI 自主决定。有两种机制：

| 类型 | 比喻 | 实现 |
|------|------|------|
| **固定间隔提醒** | 闹钟 | 每 N 分钟/小时提醒 AI 检查待办和学习 |
| **事件断点提醒** | 回执便条 | 任务完成后返回提醒 AI 反思 |

### 核心设计哲学

**通过外部信源实现对 AI 的记忆灌注和行动指引，但不影响 AI 自主智能**

- **外部信源**: 程序提供的提醒（闹钟 + 便条）
- **信源设计**: **AI 自己设计制作**提醒机制，基本不靠人
- **记忆灌注**: 提供相关记忆（context），帮助 AI 决策
- **行动指引**: 提醒 AI 做什么（"检查 pending work"、"保存学习"）
- **不影响自主**: AI 仍然自己决定是否执行、如何执行

### 需要加的 "提醒"

1. **闹钟**: AI 自己设置定期提醒 "检查 pending work + areflect 学习"
2. **便条**: AI 自己设计任务输出的回执便条模板
3. **HEARTBEAT.md**: AI 自己维护学习提醒
4. **系统 Prompt**: AI 自己编写反思指令

整个提醒系统也是 **AI 自主设计、部署、维护**。

### 人的类比

> "我记性不好，我写好备忘录，我自己看自己备忘录"

- **写备忘录**: AI 自己把需要记住的写下来（HEARTBEAT.md、memory）
- **看备忘录**: AI 自己查阅自己的记录来行动
- **不是别人提醒我**: 是我自己写、自己看
- **这就是外部脑**: 自己构建、自己使用

这就是 "充电" 机制——**AI 自己构建自己的外部脑**。

---

## 🐦 AI 模型分类与特点

### 系统中有两类主导 AI 模型

| 类型 | 名称 | 特点 | 状态 |
|------|------|------|------|
| **终端型 AI** | OpenCode AI | 持续运行、有 REST API、可做 daemon | ✅ 已集成 |
| **编辑器型 AI** | Trae AI | 交互式、无 API、需要手动触发 | ⚠️ 部分集成 |

---

### 1. OpenCode AI（终端型）

**特点**:
- 持续运行（daemon 模式）
- 有 REST API (`opencode serve --port 4096`)
- 自己读取 HEARTBEAT.md 循环工作
- 不需要调度员，是自主工作者
- 适合：长时间后台任务

**Nezha 集成方式**:
```
Nezha (调度) → OpenCode REST API → OpenCode AI 执行
```

---

### 2. Trae AI（编辑器型）

**特点**:
- 交互式 IDE 模式
- 无 REST API（无法远程激活）
- 会话结束即停止（"完成即中断"）
- 需要 HeartbeatService 调度
- 适合：代码审查、任务委托

**Nezha 集成方式**:
```
Nezha HeartbeatService → 读取任务 → 发送消息给 Trae → Trae 执行
```

---

### 两种 AI 的协作模式

| 场景 | OpenCode AI | Trae AI |
|------|-------------|---------|
| **持续工作** | ✅ 自己循环 | ❌ 需要调度器 |
| **后台任务** | ✅ 适合 | ❌ 不适合 |
| **代码审查** | ⚠️ 可做 | ✅ 适合 |
| **任务委托** | ⚠️ 可做 | ✅ 适合（AI-to-AI） |
| **外部触发** | ✅ REST API | ❌ 无 API |

---

## 📋 盘点与建议

### 当前资源盘点

| 资源 | OpenCode AI | Trae AI | 备注 |
|------|-------------|---------|------|
| 任务执行 | ✅ | ✅ | 两种都能执行 |
| 持续运行 | ✅ | ❌ | Trae 需要调度器 |
| REST API | ✅ | ❌ | Trae 无 API |
| 记忆系统 | ✅ (areflect) | ✅ (areflect) | 已打通 |
| 提醒机制 | ❌ | ❌ | 需要建立 |

### 建议

#### 1. 建立统一的提醒机制（适配两种 AI）

| 提醒类型 | OpenCode AI | Trae AI |
|----------|-------------|---------|
| 固定间隔 | cron job → 发送消息 | HeartbeatService → 读取任务 |
| 事件断点 | 任务完成回调 | 任务完成回调 |

#### 2. Nezha 调度方案（适配器模式，不依赖特定编辑器）

- **核心**: Nezha 作为调度中心，调度 AI 能力，通过适配器支持不同环境
- **适配器接口**:
  ```typescript
  interface AIAdapter {
    name: string;
    canSchedule(): boolean;
    execute(task: Task): Promise<Result>;
  }
  ```
- **已有适配器**: OpenCode（REST API）
- **可扩展适配器**:
  - Trae/VSCode（MCP / 文件触发）
  - OpenAI API（直接调用）
  - 任何提供接口的 AI

- **流程**: Nezha → 适配器 → AI 执行 → 回调提醒

#### 3. 统一记忆入口

- areflect 命令统一，两种 AI 都能用
- 提醒内容统一："任务完成，去 areflect 学习"

#### 4. 打通环节优先级

1. **高优先级**: 提醒机制（闹钟 + 便条）
2. **中优先级**: Nezha 调度方案（调度 AI 能力，不依赖编辑器）
3. **低优先级**: 统一 dashboard（查看两种 AI 状态）

---

## 📊 调研结果

### 1. 提醒机制（闹钟 + 便条）

**已有组件**:
- [ReminderService.ts](file:///Users/jk/gits/hub/nezha/src/services/ReminderService.ts) - 固定间隔提醒（每 5 分钟）
- 包含思考题引导

**缺少**:
- 提醒内容没有指向 areflect
- 没有"回执便条"（事件断点提醒）

### 2. MCP 集成

**已有**:
- [mcp_configs](file:///Users/jk/gits/hub/nezha/src/db/migrations/040_mcp_configs.sql) 表 - 存储 MCP 配置
- [learning-server.ts](file:///Users/jk/gits/hub/nezha/src/mcp/learning-server.ts) - Nezha MCP 服务器
- 同步工具 [sync-mcp-config.ts](file:///Users/jk/gits/hub/nezha/src/mcp/sync-mcp-config.ts)

**待实现**:
- 通过 MCP 激活 Trae/VSCode 中的 AI（需要编辑器支持 MCP）

### 3. 质量控制流程

**已有**:
- [inter_reviews](file:///Users/jk/gits/hub/nezha/src/db/migrations/027_inter_ai_review.sql) 表 - AI 互评
- [prepare-commit-msg](file:///Users/jk/gits/hub/nezha/hooks/prepare-commit-msg) hook
- 审计日志表：`task_audit_log`, `skill_audit_log`, `event_log`, `activity_log`

**缺少**:
- git commit 追溯到 inter-review 的完整链路
- commit 前检查 inter-review 是否完成
- 不完整流程则阻止 commit 并反馈 AI

### 4. Issue/任务系统

**已有**:
- `issues` 表 - 问题跟踪
- `tasks` 表 - 任务管理
- `inter_reviews` 表 - 评审记录

---

## 📋 P 计划（按优先级）

### P1: 完善提醒机制（闹钟 + 便条）

| 项目 | 描述 |
|------|------|
| **目标** | 强化 areflect 提醒，建立回执便条机制 |
| **闹钟** | 在 ReminderService 思考题中加入 areflect 具体用法 |
| **便条** | 任务完成后自动提醒 "记得 areflect 保存学习" |
| **信源设计** | AI 自己设计提醒模板，存储在数据库 |

### P2: 质量控制流程自动化

#### 2.1 发布想法/任务流程（正向）

```
调研 → P 计划 → 发布 issue/task → 评论 + 思路 → 宣告实现功能
```

- 通过 issue 系统发布想法
- 发布任务时评论加上自己的思路
- 宣告自己在实现什么功能

#### 2.2 代码质量控制流程（终末追溯）

```
AI 写代码 → git commit → hook 触发 → 追溯这个 change 的过程

倒序追查（从结果到源头）：
inter-review → announce finished implementing → 
announce will implement → pick up → [task, issue, inter-review result]

如果不健全 → 扣留不做 commit → 反馈 AI 补齐步骤
```

**可能的完整正序流程（可补充环节）**：

```
1. [task, issue, inter-review result]  ← 三者源头
         ↓
2. pick up（领取任务）
         ↓
3. announce will implement（宣告打算实现）
         ↓
4. 调研 + 设计（可选：记录到文档）
         ↓
5. 实现功能
         ↓
6. 自测/运行测试（可补充）
         ↓
7. 文档更新（可补充）
         ↓
8. areflect 保存学习（可补充）
         ↓
9. announce finished implementing（宣告完成）
         ↓
10. inter-review（AI 互评）
         ↓
11. 根据评审修改（循环）
         ↓
12. commit（提交代码）
         ↓
13. hook（触发追溯检查）
```

| 项目 | 描述 |
|------|------|
| **目标** | 完整追溯链路，commit 前检查 |
| **三者源头** | task（任务）、issue（问题）、inter-review result（评审结果） |
| **⚠️ 关键提醒** | **源头经常被跳过去！** AI 容易直接写代码而不从 task/issue/inter-review 出发 |
| **⚠️ AI 典型问题** | "想到什么马上就冲上一通操作猛如虎，什么 PDCA 我才不管" |
| **🚀 预期效果** | **代码质量指数级别提升** - 强制机制治好了 AI 的冲动症 |
| **可补充环节** | 自测、文档更新、areflect、HEARTBEAT.md 更新 |
| **实现** | git hook 检查 commit 是否关联三者之一，无关联则阻止 commit 并反馈 AI |
| **日志** | 所有步骤记录到 `task_audit_log` |

### P3: MCP 适配器开发

| 项目 | 描述 |
|------|------|
| **目标** | 通过 MCP 激活编辑器中的 AI |
| **方案** | 开发 MCP 客户端适配器，支持：Trae/VSCode（需对方支持 MCP） |
| **扩展** | 适配器接口标准化 |

### P4: Nezha 调度方案（适配器模式）

| 项目 | 描述 |
|------|------|
| **目标** | 调度 AI 能力，不依赖特定编辑器 |
| **接口** | AIAdapter 抽象接口 |
| **已有** | OpenCode 适配器（REST API） |
| **可扩展** | Trae/VSCode MCP 适配器、自定义适配器 |
