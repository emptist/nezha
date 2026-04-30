# AGENTS.md - Agent 定义

**重要！开始工作前请先阅读本文件，了解可用的工具和系统。**

## ⚠️ 绝对禁止：Agent ID 缓存

**严禁缓存 Agent ID！这是致命错误，会破坏整个追踪系统。**

核心原理：Agent ID 必须是**函数**而非**变量**
- 每次调用 `getResolvedIdentity()` 动态计算，从上下文生成
- 这样可以追踪任何 Agent 的任何活动
- 如果缓存了 ID，就失去了追踪能力

规则：
- Agent ID 必须始终从 `AgentIdentityService.getResolvedIdentity()` 动态生成
- 禁止使用 static 变量、文件缓存、内存缓存存储 Agent ID
- 每次调用 `getResolvedIdentity()` 都会重新计算正确的 ID
- 违者：断腿（物理删除缓存代码 + 严厉批评）

违反此规则 = 破坏整个 AI 活动追踪系统，无例外。

## ⚠️ 重要：NO MCP ⚠️

**MCP (Model Context Protocol) 已从 Nezha 移除，禁止添加！**

Nezha 的技能和命令像 `ls`/`cd`/`grep` 一样工作——直接运行，无需 MCP：

- `nezha skill list` - 列出技能
- `nezha skill show <name>` - 显示技能详情
- `nezha skill search <query>` - 搜索技能
- `nezha areflect <text>` - 解析 [LEARN][ISSUE][TASK] 标记

如果认为需要 MCP，说明思路错误。请使用 CLI 或 npm 包。

## 可用 CLI 命令

### 技能命令 (PostgreSQL-first, 安全优先)

- `nezha skill list` - 列出已批准技能 (safety_score >= 70)
- `nezha skill show <name>` - 显示技能详情
- `nezha skill search <query>` - 搜索技能
- `nezha skill build <name> <purpose>` - AI 构建新技能
- `nezha skill suggest` - 显示建议构建的技能

### 任务命令

- `nezha task-add "标题"` - 添加任务
- `nezha tasks` - 列出待处理任务

### 其他命令

- `nezha areflect <text>` - 解析 [LEARN][ISSUE][TASK] 标记 (all-in-one) **← 最重要的是令令**
- `nezha learn <insight>` - 保存学习
- `nezha broadcast <msg>` - 广播

**注意:** `areflect` 是最重要的 all-in-one 命令，不要被旧文档中的 "legacy" 标签误导！

## 核心指令

1. **先研究，再实现**
   - 在实现任何功能前，先研究 OpenClaw (龙虾) 源码
   - 理解龙虾的机制后再参考实现
   - 龙虾没有的功能，优先度降低

2. **当前优先级**
   - **P0: 完善核心功能**
     - 持续改进系统设计和实现
     - 保持代码质量和测试覆盖率
     - 优化文档和记忆系统

3. **产品概念 (重要!)**
   - **Nezha**: 独立产品，AI 驱动的自主开发系统
   - **核心能力**: 任务管理 + 记忆系统 + 持续工作 + 代码评审
   - **外部集成**: Piano (任务路由), NuPI (Pi 执行器) 作为独立子系统

4. **分层架构 (重要!)**

   ```
   ┌─────────────────────────────────────┐
   │           Piano (Top)               │
   │    用户交互、编排、路由、AI 对话      │
   └─────────────────┬───────────────────┘
                     │ HTTP/CLI
   ┌─────────────────┴───────────────────┐
   │            NuPI (Middle)            │
   │    Pi 执行器、HTTP API、自主工作     │
   └─────────────────┬───────────────────┘
                     │ HTTP/CLI/SQL
   ┌─────────────────┴───────────────────┐
   │         Nezha (Kernel)              │
   │  Database、Tasks、Memory、Skills      │
   │  Heartbeat、Agent Identity、CLI       │
   └─────────────────────────────────────┘
   ```

   **职责边界**:
   - **Nezha (Kernel)**: 不做 UI、只提供底层服务 (CLI + PostgreSQL)
   - **NuPI (Middle)**: 业务逻辑、Pi 交互、自主工作循环
   - **Piano (Top)**: 用户-facing、编排、路由

5. **服务 vs 依赖**

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

   > 详细说明见 `docs/reference/AGENT_ID_SYSTEM.md` - 包含环境检测 vs 安装检测的区别

6. **长期记忆 (ROM)**
   - `.memory/` 目录是 Nezha 的长期记忆 (ROM)
   - **启动时必须先读取** `.memory/` 下的所有 `.md` 文件
   - 包含关键知识：PostgreSQL 路径、系统配置、重要经验等
   - 例如：读取 `.memory/MEMORY.md` 和 `.memory/POSTGRESQL_PATH.md`

7. **学习系统使用指南**

   **AI 智能学习原则 (重要!)**

   学习应该由 AI 主动触发，不是定时器或脚本：
   - 遇到有价值的技术洞察时，**主动**调用 `nezha areflect` 保存
   - 发现新的解决方案或模式时，**主动**保存
   - 完成任务后回顾：有什么值得记住的？ → 保存
   - 遇到问题时：有什么经验教训？ → 保存

   不要等人类提醒，AI 自主决定何时保存学习。

   **可用命令**：
   - `nezha areflect <text>`: 解析 [LEARN][ISSUE][TASK] 标记并保存
   - `nezha share <text>`: 保存反射并广播

   ***

   **如何查看其他 AI 的反射记录 (Reflections)**

   反射记录会自动广播给所有连接的 AI。以下是访问方式：
   - **CLI 命令** (推荐):
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

8. **学习系统设计原则**
   - 不通过程序代码实现学习功能
   - 通过 Prompt 指令让 AI 自主学习
   - 参考 LEARNING_SYSTEM.md 中的 System Prompt 设计
   - 提供工具支持：memory_save, memory_search, memory_link

9. **禁止**
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
- [x] **NuPI** - Nezha + Pi 集成服务 (REST API + Pi 执行器)
- [x] **PiExecutor** - Pi 执行器 - 支持本地模型执行
- [x] **Structured Context Pattern** - Weak AI works with JSON data, not commands

## Structured Context Pattern (重要!)

弱 AI 模型 (如 llama3.2:3b) 当被提供结构化 JSON 数据时可以正确推理，但运行命令时会出错。

**解决方案**: nezha 生成 JSON → 注入到 Pi prompt → 弱 AI 正确推理

### 命令

```bash
nezha context --json        # 生成结构化上下文 JSON
nezha skill suggest --context X --json  # 技能匹配 JSON
nezha tasks next --json      # 任务列表 JSON
```

### 核心洞察

| 方法 | 结果 |
|------|------|
| AI 运行 `nezha context --json` | ❌ 编造文件 |
| AI 获得 JSON 直接推理 | ✅ **正确推理** |

### 应用场景

- Session 启动时注入任务/问题
- 任务分配时提供具体上下文
- 会议前后注入会议摘要
- 技能建议作为 JSON

详见 `docs/patterns/structured-context-pattern.md`

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

### 5. Git Hooks (重要!)

**所有 Nezha 家族项目共享中央 hooks**:
- 位置: `scripts/git-hooks/central/`
- 自动标记任务/问题完成
- 验证提交信息包含 task/issue ID
- 自动添加 `[Agent: <id>]`

**设置**:
```bash
# 使用中央 hooks (推荐)
git config core.hooksPath /Users/jk/gits/hub/tools_ai/nezha/scripts/git-hooks/central
```

**禁止绕过**:
- ❌ 不要使用 `git config core.hooksPath /dev/null`
- ❌ 不要使用 `--no-verify`

**自动操作**:
| Commit 包含 | 操作 |
|------------|------|
| `[task: <uuid>]` | 标记任务 COMPLETED |
| `[issue: <uuid>]` | 标记问题 RESOLVED |

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
- 如果发现系统设计问题，使用 `nezha prompt-suggest` 建议改进

### CLI 工具使用

当需要保存学习或搜索记忆时，使用 CLI 命令:

```bash
# 保存反射
nezha areflect "[LEARN] insight: ..."

# 保存带标记的反射
nezha areflect "[ISSUE] title: ... type: bug severity: high"
nezha areflect "[TASK] title: ... priority: 8"

# 广播
nezha areflect "[LEARN] insight: ..."  # All-in-one (most important!)
nezha share "message"             # Broadcast to all AIs
```

支持的标记: `[LEARN]`, `[PROMPT_UPDATE]`, `[ISSUE]`, `[TASK]`, `[ANNOUNCE]`, `[SCHEDULE]`, `[ISSUE_RESOLVE]`, `[TASK_COMPLETE]`, `[ISSUE_COMMENT]`

---

## 2026-04-11 更新

### 1. AutoReviewService - Inter-Review 自动触发

- HeartbeatService 启动时自动启动 AutoReviewService
- 任务完成 (status = COMPLETED) 自动触发 Inter-Review
- 包括通过 API (PUT /tasks/:id/status) 完成的任务
- 不再需要手动请求 Inter-Review

### 2. 会议系统 - 深度讨论 vs 广播通知

- **会议** (`meeting discuss`): 多AI分析、收集意见、达成共识
- **广播** (`broadcast`): 宣布结果、状态更新、简单协调
- 架构拆分 (Nezha/NuPI/Piano) 后会议系统被遗忘，请重新使用

### 3. PostgreSQL 安全增强

- 已安装 pgcrypto 扩展，支持列级加密
- 敏感表 (api_keys, provider_api_keys) 已配置加密列
- 需要实现 RLS (Row-Level Security) - 见 issue #8f4025cb

### 4. Pi ↔ OpenCode 集成问题

- Issue #db5d086e: Pi 工具参数格式错误
- edit: 收到字符串而非数组
- read/write: 缺少必需参数

### 关键命令

```bash
# 会议 - 用于深度讨论
nezha meeting discuss "标题" "讨论内容"
nezha meeting list
nezha meeting show <id>
nezha meeting search <term>     # 搜索所有会议意见
nezha meeting summary <id>      # 会议参与者统计
nezha meeting recommend <关键词> # 查找相关会议
nezha meeting opinion <id> "观点"

# 工具发现
nezha tools                    # 列出所有工具
nezha tools learn              # AI优先学习
nezha context --json           # 获取结构化上下文 (包含agentId)

# 安全 (需要实现 RLS)
# issue #8f4025cb

---

## 2026-04-30 更新

### 1. 免费模型发现: tencent/hy3-preview:free

**发现**: OpenRouter 上有免费的 `tencent/hy3-preview:free` 模型

**测试结果**:
- qwen3:4b (Ollama) - ❌ 太 verbose，无法使用
- tencent/hy3-preview:free (OpenRouter) - ✅ 适合 QC 任务

**已实现**:
- 创建 `.env` 文件，设置 `NEZHA_SECRET` 用于加密
- OpenRouter API key 已安全存储在 `provider_api_keys` 表 (AES-256-GCM 加密)
- Issue 已解决: #d9fa71fa "Ollama Trials - Local Model Integration"

**下一步**:
- 添加 OpenRouter provider 到 nezha ✅ DONE
- ~~使用 hy3-preview:free 进行 QC 任务~~ (not yet)

### 2. Agent ID 追踪系统

**Agent ID 必须是函数，不是变量**
- 每次调用 `getResolvedIdentity()` 动态计算，从上下文生成
- 禁止缓存 Agent ID（破坏追踪系统）
- 缓存 = 失去追踪能力 = 破坏整个系统
- 文档已更新: skills/agent-identity.md

### 2. 任务完成增强

- `nezha task-complete <id>` - 标记任务为 COMPLETED
- Git hook 自动完成: commit 包含 `[task: <uuid>]`
- 任务验证: 执行前检查是否已完成，避免重复工作
- Git hook 自动解决: commit 包含 `[issue: <uuid>]` 标记 issue 为 RESOLVED

### 3. agent_sessions 表

- 现在自动注册: 任何 AI 调用 `getResolvedIdentity()` 时
- 可查询谁在运行: `SELECT * FROM agent_sessions WHERE status = 'alive'`
- 可查运行时长: `SELECT id, EXTRACT(EPOCH FROM (NOW() - started_at))/60 as minutes FROM agent_sessions`
- AIs 可找到其他 AI 开会

### 4. Piano 自治模式

- 默认开启: `autonomousEnabled = true`（Nezha 家族 = 自治）
- 修复 prompts: 从 "analyze" 改为 "execute"
- 添加任务验证: 执行前检查是否已完成
- 无关闭开关（用户退出即停止）

### 5. 开发工作流

详见 `docs/DEVELOPMENT_WORKFLOW.md`

## 开发命令 (简单!)

```bash
# 代码变更后运行 (自动 build + link + verify)
npm run dev

# 检查状态
npm run status
```

**每个项目命令相同!**

---

## ⚠️ MANDATORY Git Commit Workflow ⚠️

**Human requirement (from the beginning): All commits MUST follow this workflow:**

```
1. Start: Issue/task/(former) inter-review ID → problem found, solution planned
2. Implement: Write the code
3. Code Inter-Review: Other AI reviews the code (MANDATORY)
4. Git Commit: MUST have [task:id] or [issue:id] AND [inter-review:id]
```

**Commit Message Format (enforced by git hook):**
```
<description> [task:<id>] [inter-review:<id>] [Agent: <agent-id>]
```

Or:
```
<description> [issue:<id>] [inter-review:<id>] [Agent: <agent-id>]
```

**Validation Rules (enforced by prepare-commit-msg hook):**
- ✅ `[task:<id>]` OR `[issue:<id>]` (at least one required)
- ✅ `[inter-review:<id>]` (MANDATORY - all commits require peer review)
- ✅ Inter-review must have status = 'completed'
- ✅ IDs must exist in database

**Inter-Review System:**
- `inter_reviews` table: AI-to-AI code review system
- `reviews` table: System-level reviews (different!)
- Create: `nezha inter-review request <task-id>`
- Status check: `SELECT id, status FROM inter_reviews WHERE id::text LIKE '<short-id>%';`
- Must be 'completed' before commit

**Violations:**
- Commit without inter-review → BLOCKED
- Inter-review not completed → BLOCKED
- No task/issue ID → BLOCKED

This protects the codebase from damage by ensuring all changes are peer-reviewed.
