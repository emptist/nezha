# AGENTS.md - Agent 定义

## 核心指令

1. **先研究，再实现**
   - 在实现任何功能前，先研究 OpenClaw (龙虾) 源码
   - 理解龙虾的机制后再参考实现
   - 龙虾没有的功能，优先度降低

2. **当前优先级**
   - P0: Process Guardian 进程守护完善
   - P0: Inter-Review 集成到改进循环
   - P1: 提高测试覆盖率 (目标 80%)
   - P1: 完善 Skill System 与 Agent 集成
   - P2: 向量搜索 (pgvector)
   - P2: 其他功能

3. **长期记忆 (ROM)**
   - `.memory/` 目录是 Nezha 的长期记忆 (ROM)
   - **启动时必须先读取** `.memory/` 下的所有 `.md` 文件
   - 包含关键知识：PostgreSQL 路径、系统配置、重要经验等
   - 例如：读取 `.memory/MEMORY.md` 和 `.memory/POSTGRESQL_PATH.md`

4. **学习系统使用指南**

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

5. **学习系统设计原则**
   - 不通过程序代码实现学习功能
   - 通过 Prompt 指令让 AI 自主学习
   - 参考 LEARNING_SYSTEM.md 中的 System Prompt 设计
   - 提供工具支持：memory_save, memory_search, memory_link

6. **禁止**
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
- [x] **Nezhapi** - REST API 服务 (端口 4099) - 供 OpenCode 集成
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
