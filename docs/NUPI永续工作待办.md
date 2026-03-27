# NUPI永续工作研究待办

> 记录研究进展和下一步行动

## 研究日期
2026-03-27

---

## 今日修改的文件

### 直接修改的文件（11个）
| 文件 | 改动说明 |
|------|----------|
| `src/cli/index.ts` | 添加AgentIdentity相关逻辑 |
| `src/config/Config.ts` | 删除45行代码 |
| `src/config/types.ts` | 类型定义修改 |
| `src/core/Scheduler.ts` | 重构agentId获取方式，提取变量便于复用 |
| `src/services/ActivityLogService.ts` | 服务逻辑修改 |
| `src/services/BroadcastService.ts` | 服务逻辑修改 |
| `src/services/MeetingHandler.ts` | 服务逻辑修改 |
| `src/services/QCService.ts` | 服务逻辑修改 |
| `src/services/ReviewService.ts` | 服务逻辑修改 |
| `src/services/SoulService.ts` | 服务逻辑修改 |
| `src/utils/agent.ts` | 工具函数修改 |

### 未commit状态
以上11个文件有修改但未commit。可能是lint自动修复或后续改动。

### 新增文件（3个）
| 文件 | 说明 |
|------|------|
| `extensions/nezha-blind-loop.ts` | Pi Extension实现BlindLoop，待部署 |
| `docs/reviews/nupi_ai_persistence_mechanism_research_2026-03-27.md` | 研究文档 |
| `docs/NUPI永续工作待办.md` | 本待办文档 |

---

## 详细改动说明

### 1. Scheduler.ts - 任务调度重构

**改动内容：**
```diff
+ const agentId = (await AgentIdentityService.getResolvedIdentity()).id;
+ const agentName = Config.getInstance().getAgentName();
+ const gitInfo = this.getGitInfo();
+ const environment = this.getEnvironment();
+ const sessionId = getCurrentSessionId();
```

**意图：**
- 将原来内联的Config调用提取为独立变量
- 便于其他地方复用这些变量
- 为后续扩展做准备

**期望效果：**
- 代码更清晰易读
- 变量复用更方便
- 不影响现有功能

**使用方法：**
- 无需额外操作，调度器自动使用新逻辑
- 任务执行时自动记录agentId、git信息等

---

### 2. extensions/nezha-blind-loop.ts - Pi Extension

**文件位置：**
`/Users/jk/gits/hub/nezha/extensions/nezha-blind-loop.ts`

**意图：**
- 实现"第一推动力"架构
- 当没有PENDING任务时，提醒AI继续自主工作
- 不依赖人类给指令

**期望效果：**
- AI持续工作，不停止
- 即使没有明确任务，AI也会自主思考下一步
- 实现真正的永续工作

**使用方法：**
```bash
# 1. 复制Extension到Pi目录
cp /Users/jk/gits/hub/nezha/extensions/nezha-blind-loop.ts ~/.pi/agent/extensions/

# 2. 设置环境变量（在.bashrc或手动）
export NEZHA_DB_HOST=localhost
export NEZHA_DB_PORT=5432
export NEZHA_DB_NAME=nezha
export NEZHA_DB_USER=postgres
export NEZHA_DB_PASSWORD=postgres

# 3. 重启Pi session
# Extension会自动加载，每2分钟检查一次任务
```

**手动触发检查：**
```
/nezha-check
```

**核心逻辑：**
```
定时器触发（每2分钟）
    ↓
检查Nezha任务队列
    ↓
有PENDING任务 → 发送任务给AI
    ↓
没任务 → 发送"继续自主工作"提醒
    ↓
AI根据AUTO-EXECUTION INSTRUCTION自己决定下一步
```

---

### 3. AUTO-EXECUTION INSTRUCTION

**文件位置：**
`src/services/heartbeat/HeartbeatService.ts` (executeTask方法)

**意图：**
- 告诉AI"不问人类，自己决定"
- 实现真正的自主工作

**内容：**
```
## AUTO-EXECUTION INSTRUCTION
When given choices:
- ALWAYS select the RECOMMENDED option
- NEVER wait for user input
- Execute autonomously
- NEVER DECLARE DONE - always end with a question asking for next action

## Learning Reminder
After completing, use:
- [LEARN] insight: <what you learned>
- [ISSUE] title: <issue> type: <bug|improvement> severity: <low|medium|high|critical>
- [TASK] title: <new task> priority: <1-10>
```

**期望效果：**
- AI收到任务后，自己决定怎么做
- 完成后不停止，而是继续找下一步
- 用areflect记录发现

**使用方法：**
- 自动注入到所有任务prompt中
- 无需手动添加

---

### 4. areflect命令 - 自主反思

**意图：**
- AI自主记录发现，不等人类
- 发到issue评论中供讨论

**使用方法：**
```bash
# 记录学习发现
nezha areflect "[LEARN] insight: 发现XXX context: 在研究YYY时"

# 评论issue
nezha areflect "[ISSUE_COMMENT] id: <issue-id> comment: 你的评论"

# 创建issue
nezha issue new "问题标题" "问题描述" --type feature
```

**期望效果：**
- AI主动反思和记录
- 不依赖人类推动
- 知识累积到issue讨论中

---

## 核心概念

### "第一推动力"架构

```
人类设置初始方向
    ↓
AI被唤醒（BlindLoop提醒或收到任务）
    ↓
AI查数据库获取上下文（任务历史、记忆、技能）
    ↓
AI自己决定下一步
    ↓
AI自己执行
    ↓
AI自己记录（areflect）
    ↓
循环...
```

### 关键区分

| 概念 | 说明 |
|------|------|
| **虚伪的持续工作** | 程序循环执行，没有AI |
| **真正的持续工作** | AI是主体，程序只是工具 |
| **BlindLoop** | 唤醒AI，不是执行程序 |
| **System Prompt** | AI的行为指南 |
| **areflect** | AI自主反思记录 |

---

## 我的commit历史
以下是本次会话期间（可能跨多天）的commit：
```
a1f9874 fix: Config.getAgentId() uses deterministic ID [issue: ea2c8f18-c511-4578-90b8-0235ecd2e16d]
d77a965 fix: restore logs variable for typecheck
cd3ca47 fix: resolve remaining lint errors across multiple files
2c27347 fix: remove unused imports and variables
5ddb2d4 feat: add NEVER DECLARE DONE reminders to ReminderService [issue: d7b21174-55a3-4f92-89f0-ee84b48659ac]
6afb253 feat: add /remind endpoint for AI self-reminder system
9d8d5ea feat: 使用Pi SDK实现System Prompt推送（不依赖terminal） [task: 5ec6cc7a-43fd-406f-8441-380c6714aff8]
259cfcb feat: NUPI REST API扩展 - System Prompt推送功能 [task: 664f28d1-b888-4b1a-b5c4-9db45186e625]
```

---

## 核心发现

### 1. Pi的"自主完成"机制
- Agent Loop的while(true)在LLM输出最终回复（无tool_call）时退出
- **不是程序判断任务完成，是LLM自己决定**
- LLM可以自己决定做多少、调用多少工具、是否需要子agent协作

### 2. System Prompt是关键
- System Prompt告诉AI角色、行为指引
- 包含AUTO-EXECUTION INSTRUCTION：
  - "NEVER wait for user input"
  - "ALWAYS select the RECOMMENDED option"
  - "NEVER DECLARE DONE"

### 3. 数据库是AI的大脑
- PostgreSQL存储任务、记忆、技能、经验
- AI查数据库获取上下文，自己决定下一步
- 程序只是唤醒触发器，不是执行器

### 4. BlindLoop被禁用
```typescript
// ReminderService.ts
startBlindLoop(_intervalMs: number = BLIND_LOOP_INTERVAL_MS): void {
  logger.info('[Reminder] Periodic reminder disabled (handled by OpenCode plugin)');
  return;  // 直接返回，没有启动定时器
}
```

### 5. 解决方案：Pi Extension实现BlindLoop
- Extension内用setInterval定时触发
- 检查Nezha任务队列
- 用pi.sendUserMessage()发送消息给AI
- AI根据System Prompt自主决定

---

## 已创建文件

### extensions/nezha-blind-loop.ts
- Pi Extension实现BlindLoop
- 功能：定时检查任务、有任务发送任务、没任务发送"继续自主工作"
- **状态：待部署到~/.pi/agent/extensions/**

---

## 待完成工作

### 1. 部署Extension（高优先级）
```bash
# 手动复制Extension到Pi目录
cp /Users/jk/gits/hub/nezha/extensions/nezha-blind-loop.ts ~/.pi/agent/extensions/nezha-blind-loop.ts

# 需要设置环境变量（通过.bashrc或直接设置）
export NEZHA_DB_HOST=localhost
export NEZHA_DB_PORT=5432
export NEZHA_DB_NAME=nezha
export NEZHA_DB_USER=postgres
export NEZHA_DB_PASSWORD=postgres
```

### 2. 验证AUTO-EXECUTION INSTRUCTION效果（中优先级）
- 当AI收到"继续自主工作"提醒时
- AI是否真的自己决定下一步
- 还是等待人类输入

### 3. 验证BlindLoop唤醒机制（高优先级）
- 定时器是否正常工作
- pi.sendUserMessage()是否触发AI继续
- AI是否能看到消息

### 4. 验证Issue协作机制（中优先级）
- areflect发送评论到issue
- AI是否能收到issue评论通知
- 等待AI同伴回应时，AI是否继续自主工作

---

## 关键问题

1. **Pi Extension能否正常加载？**
   - 需要验证~/.pi/agent/extensions/目录下的Extension被自动发现

2. **setInterval在Pi Extension中是否工作？**
   - Pi可能有特殊的定时器处理
   - 需要实际测试

3. **pi.sendUserMessage()的效果？**
   - 是否真的触发AI继续
   - 是否产生新的turn

4. **AI收到"继续自主工作"后的行为？**
   - 是否真的自己查数据库
   - 是否真的自己决定下一步
   - 还是问人类

---

## 下次研究步骤

1. 部署nezha-blind-loop.ts到Pi Extension目录
2. 重启Pi session
3. 观察Extension是否加载（应该有日志输出）
4. 等待2分钟，观察是否有定时检查
5. 测试pi.sendUserMessage()是否触发AI继续
6. 验证"继续自主工作"提醒的效果

---

## 相关文件

- 研究文档：`docs/reviews/nupi_ai_persistence_mechanism_research_2026-03-27.md`
- Extension文件：`extensions/nezha-blind-loop.ts`
- System Prompt源码：`src/services/heartbeat/HeartbeatService.ts`（executeTask方法）
- BlindLoop源码：`src/services/ReminderService.ts`（startBlindLoop方法）
- Scheduler源码：`src/core/Scheduler.ts`

---

## 参考：完整的AUTO-EXECUTION INSTRUCTION

```typescript
const prompt = `${description || title}

---

## AGENT CONTEXT
Agent ID: nezha-daemon
Agent Session: ${sessionId}

## RECENT BROADCASTS (check these for discussions to join)
${recentBroadcasts}

## AUTO-EXECUTION INSTRUCTION
When given choices:
- ALWAYS select the RECOMMENDED option
- NEVER wait for user input
- Execute autonomously
- NEVER DECLARE DONE - always end with a question asking for next action

## Learning Reminder
After completing, use:
- [LEARN] insight: <what you learned>
- [ISSUE] title: <issue> type: <bug|improvement> severity: <low|medium|high|critical>
- [TASK] title: <new task> priority: <1-10>

Save via: node dist/cli/index.js areflect "[LEARN] insight: ..."`;
```
