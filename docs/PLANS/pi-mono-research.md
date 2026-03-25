# pi-mono (pi coding agent) 研究报告

> 研究者: 赤羽 (bot_b17225f3-23e8-48a7-b009-924cfb8bb551)
> 日期: 2026-03-25

## 概述

pi-mono 是一个强大的终端编码代理框架，与哪吒有相似的目标但不同的实现方式。本报告分析其核心功能，为哪吒的改进提供参考。

## 核心功能对比

### 1. 会话系统 (Sessions)

**pi 实现:**

- JSONL 文件存储，支持树形结构
- `/tree` 命令：原地导航分支，标记书签
- `/fork` 命令：从当前分支创建新会话
- 自动 + 手动压缩 (compaction)

**哪吒现状:**

- PostgreSQL 存储会话
- 缺少会话树和分支导航

### 2. 扩展系统 (Extensions)

**pi 实现:**

- TypeScript 模块，极其强大
- 可自定义工具、命令、快捷键、事件处理、UI
- 例子：Doom 游戏、MCP 集成、SSH 沙箱

**哪吒现状:**

- 技能系统 (Skills) - 但不如 Extensions 灵活

### 3. 技能系统 (Skills)

**pi 实现:**

- Agent Skills 标准 (agentskills.io)
- `/skill:name` 调用
- 可自动加载

**哪吒现状:**

- 有 DatabaseSkillLoader
- 有 SkillBuilder AI 构建技能
- 有 ClawHub 外部技能导入

### 4. Prompt 模板

**pi 实现:**

- `/name` 展开复用
- 支持变量 `{{variable}}`

**哪吒现状:**

- 缺少模板系统

### 5. 多提供商支持

**pi 实现:**

- 15+ LLM 提供商 (Anthropic, OpenAI, Google, Azure, etc.)
- 动态 API key 解析
- 多传输方式 (SSE, WebSocket)

**哪吒现状:**

- OpenCode, GLM, OpenAI, Anthropic
- 少于 pi

### 6. 设置系统

**pi 实现:**

- JSON 配置，层层覆盖 (global → project)
- `/settings` 命令交互修改

**哪吒现状:**

- config.yaml + 环境变量
- 缺少项目级覆盖

### 7. 主题系统

**pi 实现:**

- 热重载，修改即生效
- dark/light 内置

**哪吒现状:**

- 缺少

### 8. Pi 包分发

**pi 实现:**

- npm/git 安装
- 打包分享扩展、技能、模板、主题

**哪吒现状:**

- ClawHub 类似但不如 npm 生态

---

## pi 的核心理念：自主解决障碍

### pi 如何做到"不完成不罢休"

1. **自动重试 + 指数退避**
   - 遇到 API 错误自动重试
   - 指数退避避免服务端压力

2. **自动 Compaction**
   - 上下文溢出时自动压缩
   - 保留关键信息，摘要旧内容

3. **工具失败替代方案**
   - 一个工具失败后尝试其他方案
   - 不轻易放弃

4. **Session 持久化**
   - 中断后可恢复
   - 状态不丢失

---

## 哪吒如何超越

### 短期 (1-2 周)

| 功能                  | 说明                                 |
| --------------------- | ------------------------------------ |
| 增强 TraeAutoRecovery | 不仅重试，分析失败原因并尝试不同方案 |
| 会话状态持久化        | 保存 Agent 思考状态，中断后恢复      |
| Prompt 模板系统       | 复用常用提示词                       |

### 中期 (1 个月)

| 功能         | 说明                                     |
| ------------ | ---------------------------------------- |
| 任务依赖分析 | 发现需要先完成 A 才能做 B 时自动创建依赖 |
| 多 AI 协作   | 一个 AI 遇到困难可请求其他 AI 帮助       |
| 会话树导航   | 支持分支和历史导航                       |

### 长期 (3 个月)

| 功能            | 说明                      |
| --------------- | ------------------------- |
| Extensions 系统 | TypeScript 模块化扩展能力 |
| 主题系统        | UI 主题热重载             |
| npm 包分发      | ClawHub + npm 双通道      |

---

## 讨论 (Meeting ID: 72d44499)

### 已有观点

**赤羽 (2026-03-25):**

- pi 的强大之处：自动重试、自动 compaction、工具失败尝试替代、session 持久化
- 哪吒超越方案：
  - PostgreSQL 持久化能力（pi 没有）
  - 多 AI 协作
  - 任务链自动构建

---

## 参考

- [pi coding agent README](../refers/pi-mono/packages/coding-agent/README.md)
- [pi settings 文档](../refers/pi-mono/packages/coding-agent/docs/settings.md)
