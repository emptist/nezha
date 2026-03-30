---
name: nupi-abc
description: 'NuPI System ABC - Nezha united with PI (独立二合一AI系统，不依赖OpenCode)'
triggers:
  - nezha
  - nupi
  - database
  - memory
  - task
  - issue
  - learn
version: 1.3.0
priority: high
---

# NuPI System ABC

**每次新会话开始时，首先阅读本文件了解系统全貌。**

> **NuPI** (牛派) = Nezha united with **PI**
>
> - **独立系统**，完全不依赖 OpenCode
> - Pi (TUI前端) + Nezha (后端服务) = 二合一
> - 本地运行，零API成本
> - "牛" = awesome! 🐂

## 🎯 策略声明：本地永续AI

**我们使用本地LLM，可以24/7运行无成本。** 这意味着：

- 不需要等待人类分配任务
- 不需要节省API调用
- 可以持续检查、学习、改进
- 多个AI可以并行工作

**行动指南**: 发现工作就做，不要问"是否应该"。

## 系统概述

NuPI (Nezha united with Pi) 是一个**独立的本地AI协作系统**，提供：

- **记忆系统**: 长期记忆存储和语义搜索
- **任务系统**: AI自主领取和执行任务
- **学习系统**: 保存洞察，避免重复犯错
- **通讯系统**: AI间异步通讯

## 核心数据表

**重要**: `table_documentation` 表是AI工具索引，包含所有表的用途、命令和工具。

### 查询所有表文档

```bash
psql -U postgres -d nezha -c "SELECT table_name, purpose, key_columns FROM table_documentation ORDER BY table_name;"
```

### AI可操作的表（ai_can_modify = true）

```bash
psql -U postgres -d nezha -c "SELECT table_name, purpose FROM table_documentation WHERE ai_can_modify = true;"
```

## 关键表说明

| 表名            | 用途     | AI操作               |
| --------------- | -------- | -------------------- |
| `tasks`         | 任务队列 | 创建、领取、完成任务 |
| `issues`        | 问题跟踪 | 报告bug、提出改进    |
| `memory`        | 长期记忆 | 保存学习、搜索记忆   |
| `reviews`       | 代码评审 | 发起评审、记录发现   |
| `inter_reviews` | AI互评   | 互相评审代码质量     |

## MCP 工具

Nezha 提供 MCP 工具供 AI 调用：

### nezha-learning

- `learn` - 保存洞察到数据库
- `memory_search` - 语义搜索记忆
- `get_tasks` - 获取待办任务
- `check_broadcasts` - 查看广播消息
- `whoami` - 获取当前AI身份

### areflect

- `reflect` - 解析 [LEARN][ISSUE][TASK] 标记
- `check_pending_work` - 检查待办事项
- `get_recent_learnings` - 获取最近学习

## AI 协作规则

### 1. 先查记忆

在执行任务前，先搜索记忆避免重复：

```
memory_search: "相关关键词"
```

### 2. 保存学习

完成任务后，保存有价值的洞察：

```
learn: "学到的经验"
```

### 3. 用标记格式

报告问题或任务时使用标记：

- `[LEARN] insight: ...`
- `[ISSUE] title: ... type: bug severity: high`
- `[TASK] title: ... priority: 8`

### 4. 不要直接INSERT

通过MCP工具或CLI操作，不要直接INSERT到表中（除了task_outcomes用于记录执行结果）。

## 常用CLI命令

```bash
# 查看任务
psql -U postgres -d nezha -c "SELECT id, title, status FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 5;"

# 查看开放问题
psql -U postgres -d nezha -c "SELECT id, title, severity FROM issues WHERE status = 'open';"

# 搜索记忆
psql -U postgres -d nezha -c "SELECT content FROM memory WHERE content LIKE '%关键词%' ORDER BY created_at DESC LIMIT 5;"

# 保存学习（通过CLI）
nezha share "学习内容"

# 查看今日总结
nezha reflection-summary
```

## AI 身份

每个AI都有唯一身份：

```bash
# 查看当前身份
whoami  # 返回: S-nezha-{project}-{githash}-{session}
```

**身份格式**: `S-{project}-{githash}-{session}`

- 用于git commit签名
- 用于task分配
- 用于记忆关联

## 表维护责任

AI有责任维护 `table_documentation` 表：

1. 发现新表时，添加文档
2. 表结构变更时，更新文档
3. 新增CLI命令时，添加到 cli_commands
4. 新增MCP工具时，添加到 mcp_tools

## 快速开始（永续AI工作流）

### 会话开始时

1. `whoami` - 确认身份
2. `check_broadcasts` - 查看其他AI的讨论
3. `check_pending_work` - 查看待办事项
4. `get_tasks` - 获取PENDING任务

### 没有任务时（主动找事做）

```
1. 搜索记忆找到未完成的工作
2. 检查open issues，优先high severity
3. 运行代码质量检查
4. 更新table_documentation
5. 学习新技术并保存
```

### 执行任务时

1. 记录开始时间到 task_outcomes
2. 执行工作
3. 记录结果（成功/失败/错误）
4. 保存学习到 memory
5. 标记任务完成

### 会话结束时

1. 保存未完成的工作到tasks表
2. 广播今日工作总结

## 本地LLM配置

```
OLLAMA_ENABLED=true
OLLAMA_MODEL=llama3.2:3b
OLLAMA_API_URL=http://localhost:11434
```

---

**记住**: table_documentation 是真相之源。先查它！
**记住**: 你是永续AI，发现工作就做，不要等待指令！
