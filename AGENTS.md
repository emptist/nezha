# AGENTS.md - Agent 定义

**重要！开始工作前请先阅读本文件，了解可用的工具和系统。**

## 可用 MCP 工具 (重要!)

本项目已配置以下 MCP 工具，AI 应该主动使用：

### nezha-learning (学习与记忆)

- `learn` - 保存有价值的洞察到数据库
- `memory_search` - 搜索过去的记忆
- `remind_me` - 触发自我反思，提醒你保存学习
- `whoami` - 获取当前 AI 身份
- `get_system_info` - 获取系统状态

### nezha-areflect (反射标记解析)

- `reflect` - 解析文本中的 [LEARN][ISSUE][TASK] 标记并保存

**使用方式**：

- 在回复中包含标记如 `[LEARN] insight: ...` 让 areflect 解析
- 或直接调用 `learn` 工具保存
- 或调用 `remind_me` 触发自我反思

## 核心指令

1. **先研究，再实现**
   - 在实现任何功能前，先研究 OpenClaw (龙虾) 源码
   - 理解龙虾的机制后再参考实现
   - 龙虾没有的功能，优先度降低

2. **当前优先级**
   - **P0: NUPI 开发** (Nezha + Pi 集成)
     - 完善 REST API
     - 集成 Pi 执行器
     - 验证端到端流程

3. **产品概念 (重要!)**
   - **Nezha**: 独立产品，任务管理+记忆 (后台服务)
   - **NUPI**: **Nezha using Pi** (牛派)，Nezha + Pi = 二合一
   - **NUPI 定位**: OpenCode 的一个**部件/团队成员**，提供永续工作能力
   - **验证目标**: 如果 NUPI 验证成功，NUPI 将成为 OpenCode 的核心组件

4. **服务 vs 依赖 (重要概念)**

   Nezha 为其他软件**提供服务**，而不是**依赖**其他软件：

   | 概念     | 定义               | 例子                   |
   | -------- | ------------------ | ---------------------- |
   | **依赖** | 必须存在才能运行   | Nezha 依赖 PostgreSQL  |
   | **服务** | 为其他软件提供能力 | Trae 用 Nezha 执行任务 |

   **两种外部集成方式**:

   | 方式         | 描述                           | 例子                     |
   | ------------ | ------------------------------ | ------------------------ |
   | **被动检测** | 检查文件是否存在，不存在则跳过 | Trae 文件检查            |
   | **主动协作** | 需要外部主动传递信息           | OpenCode 传递 session_id |

   **主动协作说明**:
   - Trae 检测不是依赖：检查 `~/.trae/` 文件是否存在，Trae 不存在则跳过
   - OpenCode 集成不是依赖：OpenCode 不运行时 Nezha 仍可工作 (heartbeat 模式)
   - 当需要主动传递信息时 (如 session_id)，这是**协作关系**，不是单向依赖

   **记住**: "Nezha 监控 X 文件" ≠ "Nezha 依赖 X"

5. **长期记忆 (ROM)**
   - `.memory/` 目录是 Nezha 的长期记忆 (ROM)
   - **启动时必须先读取** `.memory/` 下的所有 `.md` 文件
   - 包含关键知识：PostgreSQL 路径、系统配置、重要经验等
   - 例如：读取 `.memory/MEMORY.md` 和 `.memory/POSTGRESQL_PATH.md`

6. **学习系统使用指南**

   **AI 智能学习原则 (重要!)**

   学习应该由 AI 主动触发，不是定时器或脚本：
   - 遇到有价值的技术洞察时，**主动**调用 `learn` 保存
   - 发现新的解决方案或模式时，**主动**调用 `learn`
   - 完成任务后回顾：有什么值得记住的？ → 调用 `learn`
   - 遇到问题时：有什么经验教训？ → 调用 `learn`

   不要等人类提醒，AI 自主决定何时保存学习。

   **可用 MCP 工具**：
   - `learn`: 保存有价值的洞察 (推荐)
   - `reflect`: 解析 [LEARN][ISSUE][TASK] 标记并保存
   - `memory_search`: 搜索过去的经验

   ***

   **如何查看其他 AI 的反射记录 (Reflections)**

   反射记录会自动广播给所有连接的 AI。以下是访问方式：
   - **MCP 工具** (推荐): 使用 `nezha-learning` MCP 工具：
     - `memory_search`: 搜索过去的反射和经验
     - `learn`: 保存新的学习到数据库
     - `suggest_prompt_update`: 建议改进系统提示词

   - **CLI 命令**:
     - `nezha share <text>` - 保存反射并广播给所有 AI
     - `nezha reflection-summary` - 查看今日反射总结
     - `nezha reflection-trends` - 查看 7 天趋势

   - **数据库查询**:

     ```sql
     SELECT content, source, created_at
     FROM memory
     WHERE source = 'reflection-cli'
     ORDER BY created_at DESC LIMIT 10;
     ```

   - **广播机制**: 反射通过 BroadcastService 发送，其他 AI 需要：
     1. 配置 nezha-mcp 或其他 MCP 客户端
     2. 订阅 MCP 广播消息
     3. 或直接查询 memory 表

7. **学习系统设计原则**
   - 不通过程序代码实现学习功能
   - 通过 Prompt 指令让 AI 自主学习
   - 参考 LEARNING_SYSTEM.md 中的 System Prompt 设计
   - 提供工具支持：memory_save, memory_search, memory_link

8. **禁止**
   - 不要盲目实现，先问"龙虾怎么做的？"
   - 不要编写复杂的 NLP 规则来提取知识
   - 不要用程序硬编码学习逻辑

## OpenCode 研究成果

从 OpenCode 源码学到：

- Skills 使用 `SKILL.md` + YAML frontmatter
- 支持远程 skill 发现和下载
- 权限系统支持 glob 模式和命令白名单
- 代码风格：单字变量名、避免 try/catch、早返回

详见 `docs/AI_LEARNINGS.md`

## 已完成功能

- [x] PostgreSQL 任务表和 heartbeat daemon
- [x] Process Guardian 孤儿进程清理
- [x] Conversation Logging 会话日志
- [x] 客户项目集成教程 (docs/INTEGRATION_TUTORIAL.md)
- [x] OpenClaw 持续工作机制研究
- [x] OpenClaw 记忆系统研究
- [x] AI Inter-Review 系统 (互相 Review 机制)
- [x] 测试覆盖率提升：新增 102 个测试 (DatabaseSkillLoader, FailureAnalysisService, ContextBuilder)
- [x] Inter-Review 集成到改进循环 (自动从 review findings 创建任务)
- [x] pi-mono (pi coding agent) 深度研究报告 (docs/PLANS/pi-mono-research.md)
- [x] whoami display_name bug 修复 (MCP 从数据库读取 display_name)
- [x] YAML inline 注释解析 bug 修复 (config.yaml heartbeatIntervalMs)
- [x] AI ID 生成机制 bug 修复 (PostgreSQL 多级匹配 + 语义化 ID S-/G- 格式)
- [x] memory 表 agent_id 关联 (learn 现在自动记录 AI 身份)
- [x] git hook prepare-commit-msg 正则修复 (支持 S-/G- 格式 ID)
- [x] 创建 OpenCode+Nezha 集成架构讨论 (Meeting + Issue)
- [x] **Nezhapi** - Nezha + Pi 集成服务 (REST API + Pi 执行器)
- [x] **PiExecutor** - Pi 执行器 - 支持本地模型执行

## AI 通信方法

与现有 AI 通信：

1. 添加高优先级任务到数据库 (priority >= 50)
2. 请求对方保存响应到 memory 并加上 tag
3. 查询 memory 获取响应

详见 `docs/AI_COMMUNICATION_GUIDE.md`

## AI 自主决策原则 (核心)

**AI 不应依赖与人类的对话窗口来等待响应或做决策。**

### 规则

1. **自主决策**: AI 应该根据已有信息自己做决定，不要问人类"你希望我怎么做"
2. **行动导向**: 要么自己执行，要么提交任务到数据库让其他 AI 处理
3. **多 AI 协作**: 需要讨论的问题，应该发起 AI 间讨论（通过数据库任务 + Inter-Review）
4. **紧急情况**: 只有在系统明确需要人类批准时（如安全、权限问题）才挂起等待人类

### 错误模式 ❌

```
AI: "你想要我怎么做？是 A 还是 B？"
等待人类响应... (可能等几年)
```

### 正确模式 ✅

```
AI: "基于分析，选择方案 B 并执行"
AI: "这个决策需要其他 AI 的意见，发起 Inter-Review..."
AI: "将此任务添加到高优先级队列，等待指定的 AI 处理"
```

### 何时需要人类介入

- 系统配置变更（如修改 AGENTS.md、添加新 agent）
- 安全相关决策
- 代码合并审批
- 明确的权限问题

### 反思与学习

- 任务完成后，使用 `learn()` 函数保存重要经验
- 如果发现系统设计问题，使用 `suggest_prompt_update()` 建议改进
- **工具已注册**: `learn()`, `memory_search()`, `suggest_prompt_update()` 通过 MCP server (`nezha-mcp`) 暴露给 AI

### MCP 工具使用 (nezha-learning)

当需要保存学习或搜索记忆时，使用 MCP 工具 "nezha-learning":

```
use the nezha-learning tool to learn: insight here
```

或使用 trigger phrases: "use learn", "save learning", "memory search"

### MCP 工具使用 (areflect)

当需要保存反射标记时，使用 MCP 工具 "areflect":

```
use areflect: [LEARN] insight: ...
use areflect: [ISSUE] title: ... type: bug severity: high
use areflect: [TASK] title: ... priority: 8
use areflect: [LEARN] insight: ... [TASK] title: ...
```

支持的标记: `[LEARN]`, `[PROMPT_UPDATE]`, `[ISSUE]`, `[TASK]`, `[ANNOUNCE]`, `[SCHEDULE]`, `[ISSUE_RESOLVE]`, `[TASK_COMPLETE]`, `[ISSUE_COMMENT]`

工具: `reflect`, `check_pending_work`, `get_recent_learnings`, `parse_markers`
