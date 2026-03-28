# Pi持续工作能力深度研究

**日期:** 2026-03-27
**研究目标:** 理解Pi如何实现"永续工作"
**研究方法:** 深入代码，挖掘细节，反复验证

---

## 一、Pi的三种运行模式

### 1. Interactive模式（交互式）

**代码位置:** `interactive-mode.ts`

```typescript
// Main interactive loop (line 627-638)
while (true) {
  const userInput = await this.getUserInput();  // 阻塞等待用户输入
  await this.session.prompt(userInput);
}
```

**特点:**
- 有while(true)循环
- 但循环调用`getUserInput()`，这是阻塞的
- **需要用户输入，不是无人值守**

### 2. RPC模式（进程集成）

**代码位置:** `rpc-mode.ts`, `rpc.md`

```bash
pi --mode rpc
```

**协议:**
- stdin接收JSON命令
- stdout发送JSON事件
- 每个命令独立处理

### 3. SDK模式（程序化使用）

**代码位置:** `sdk.md`

```typescript
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

await session.prompt("What files are here?");
```

---

## 二、第一推动力架构（关键突破）

### 核心概念

**"第一推动力"：**
- 初始任务由人设置
- AI自己设定子目标并追踪完成
- 不需要人工干预后续工作

### Pi Extension实现方案

**代码位置:** `extensions.md`, `examples/extensions/send-user-message.ts`

**关键API:**
```typescript
pi.on("agent_end", async (event, ctx) => {
  // 每次AI任务完成时触发
});

pi.sendUserMessage(text, {
  triggerTurn: true,     // 如果空闲，立即触发LLM响应
  deliverAs: "followUp"  // 等待当前处理完成后发送
});
```

### 事件触发验证

**代码位置:** `agent-session.ts line 565`

```typescript
} else if (event.type === "agent_end") {
  await this._extensionRunner.emit({ type: "agent_end", messages: event.messages });
}
```

**确认：** agent_end事件确实被emit。

---

## 三、sendMessage vs sendUserMessage 关键区别

### sendMessage()

```typescript
pi.sendMessage({
  customType: "my-extension",
  content: "Message text",
  display: true,
}, {
  triggerTurn: true,     // 如果空闲，触发LLM响应
  deliverAs: "steer",   // 默认是steer
});
```

**特点：**
- 发送自定义消息（customType）
- 默认**不触发turn**（需要triggerTurn: true）
- 消息作为Extension自定义消息加入历史

### sendUserMessage()

```typescript
pi.sendUserMessage("What is 2+2?");
```

**特点：**
- 发送用户消息
- **总是触发turn**（即使triggerTurn: false也会触发）
- 消息作为用户消息加入历史

### deliverAs选项

- `"steer"` - 当前assistant turn完成后、下一个LLM调用前送达
- `"followUp"` - 等待agent完成所有工具调用后送达
- `"nextTurn"` - 队列到下一个用户prompt，不触发任何东西

---

## 四、潜在无限循环问题

### 问题分析

```
Extension监听agent_end
    ↓
任务完成 → agent_end触发
    ↓
Extension调用sendUserMessage()
    ↓
触发新turn → agent_start
    ↓
处理 → agent_end
    ↓
Extension再次调用sendUserMessage() → 无限循环！
```

### 解决方案

**方案1：只在有任务时发送**

```typescript
pi.on("agent_end", async (event, ctx) => {
  const nextTask = await fetchNextTask();
  if (nextTask) {
    pi.sendUserMessage(nextTask);
  }
  // 没有任务 → 不发消息 → AI停止
});
```

**方案2：用sendMessage + triggerTurn: false，然后主动触发**

```typescript
pi.on("agent_end", async (event, ctx) => {
  const nextTask = await fetchNextTask();
  if (nextTask) {
    pi.sendMessage(
      { customType: "auto-task", content: nextTask, display: false },
      { triggerTurn: true, deliverAs: "followUp" }
    );
  }
});
```

**方案3：用ctx.ui.select阻塞等待选择（但需要用户）**

plan-mode使用这个模式，不适合无人值守。

### plan-mode的实现参考

**代码位置:** `examples/extensions/plan-mode/index.ts`

```typescript
pi.on("agent_end", async (event, ctx) => {
  // ... 处理逻辑 ...

  const choice = await ctx.ui.select("Plan mode - what next?", [
    "Execute the plan",
    "Stay in plan mode",
    "Refine the plan",
  ]);  // 阻塞等待用户选择！

  if (choice?.startsWith("Execute")) {
    pi.sendMessage(
      { customType: "plan-mode-execute", content: execMessage, display: true },
      { triggerTurn: true },
    );
  }
});
```

**关键发现：** ctx.ui.select()是阻塞的，所以不会产生递归。

---

## 五、完整架构流程

```
┌─────────────────────────────────────────────────────────────┐
│                         人设置初始任务                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Pi处理任务（Interactive模式）                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      agent_end 事件触发                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Extension从Nezha获取下一个任务                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         pi.sendUserMessage() 或 pi.sendMessage() 发送任务      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   triggerTurn: true                          │
│                   → 立即触发AI继续处理                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
                              ... 循环继续
```

---

## 六、Nezha + Pi Extension 整合方案

### Extension实现（防止无限循环版）

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import pg from "pg";

export default function (pi: ExtensionAPI) {
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let isProcessing = false;  // 防重复标志

  pi.on("agent_end", async (event, ctx) => {
    // 防止重复处理
    if (isProcessing) return;
    isProcessing = true;

    try {
      // 获取下一个PENDING任务
      const result = await pool.query(
        `SELECT id, title, description FROM tasks
         WHERE status = 'PENDING'
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`
      );

      if (result.rows.length > 0) {
        const task = result.rows[0];

        // 更新任务状态为RUNNING
        await pool.query(
          `UPDATE tasks SET status = 'RUNNING' WHERE id = $1`,
          [task.id]
        );

        // 发送任务给AI - 用sendUserMessage确保触发turn
        pi.sendUserMessage(
          `任务: ${task.title}\n描述: ${task.description}`,
          { deliverAs: "followUp" }
        );
      }
      // 没有任务 → 不发消息 → AI停止
    } finally {
      isProcessing = false;
    }
  });
}
```

### 关键防重复机制

1. **isProcessing标志** - 防止在处理中重复触发
2. **只在有任务时发送** - 没有任务就停止
3. **用followUp方式** - 等待当前处理完成

---

## 七、OpenClaw vs Pi Extension对比

| 功能 | OpenClaw | Pi Extension |
|------|-----------|--------------|
| 触发机制 | heartbeat定时器 | agent_end事件 |
| 任务来源 | 外部队列 | Extension自定义 |
| 自动继续 | 是 | 是 |
| 上下文保持 | Session | Session |
| 防循环 | heartbeat有间隔 | 需要自己实现 |
| 实现复杂度 | 中等 | 简单 |

---

## 八、研究结论

1. **Pi Extension可以实现"第一推动力"** - 通过监听agent_end事件 + sendUserMessage()
2. **需要防无限循环机制** - isProcessing标志 + 只在有任务时发送
3. **triggerTurn: true是关键** - 保证AI空闲时立即继续
4. **需要持久Session** - 保证上下文长期保持
5. **ctx.ui.select是阻塞的** - plan-mode模式需要用户介入

---

## 九、关键发现：Pi不会"停止"只是阻塞等待

### getUserInput()是阻塞Promise

**代码位置:** `interactive-mode.ts line 2708`

```typescript
async getUserInput(): Promise<string> {
  return new Promise((resolve) => {
    this.onInputCallback = (text: string) => {
      resolve(text);
    };
  });
}
```

### 重要结论

**Pi的while(true)循环：**
- 没有输入时，Promise不resolve
- 循环阻塞等待
- AI进程不退出
- Extension发消息会通过`onInputCallback`激活AI

**这对"第一推动力"是理想的！**
- 不需要防止AI"停止"
- AI只是"等待输入"状态
- Extension发送消息 → onInputCallback触发 → AI继续工作

---

## 十、完整工作流（最终版）

```
┌─────────────────────────────────────────────────────────────┐
│  1. 人设置初始任务（存入Nezha数据库）                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Pi启动，Extension加载                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 人通过Pi发送初始任务prompt                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Pi处理任务 → agent_end触发                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Extension从Nezha查询下一个任务                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  6. pi.sendUserMessage() 发送任务                            │
│     → onInputCallback被调用                                   │
│     → AI继续处理（不会返回等待状态）                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
                              ... 循环
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  7. 没有任务时                                                │
│     Extension不发消息                                         │
│     AI阻塞在getUserInput()等待                                │
│     （进程不退出，保持运行）                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 十一、研究结论

1. **Pi Extension可以实现"第一推动力"** - agent_end事件 + sendUserMessage()
2. **Pi不会"停止"** - 只是阻塞在getUserInput()等待输入
3. **Extension可以导入npm包** - 可以连接PostgreSQL数据库
4. **sendMessage vs sendUserMessage** - 前者自定义消息，后者用户消息
5. **防止无限循环** - isProcessing标志 + 只在有任务时发送

---

## 十二、待验证问题

1. sendUserMessage在agent_end中是否触发新turn？（代码逻辑上应该会）
2. onInputCallback在sendUserMessage时是否被调用？
3. Extension能否访问Nezha数据库？（理论上可以）
4. 持久Session能否长期保持上下文？

---

## 十三、下一步验证

1. 写一个简单的Extension测试agent_end事件
2. 测试sendUserMessage是否能触发AI继续
3. 验证Extension连接PostgreSQL
4. 实现完整的自驱动工作流

---

## 相关文件

- `pi-mono/packages/coding-agent/docs/extensions.md` - Extension文档
- `pi-mono/packages/coding-agent/examples/extensions/send-user-message.ts` - 发送消息示例
- `pi-mono/packages/coding-agent/examples/extensions/plan-mode/index.ts` - plan-mode参考
- `pi-mono/packages/coding-agent/src/core/agent-session.ts` - AgentSession实现

---

## 十四、OpenClaw心跳唤醒机制分析（2026-03-27下午）

**发现:** OpenClaw的`heartbeat-wake.ts`是外部定时器机制，不是Pi内置的。

### 核心机制

```typescript
// heartbeat-wake.ts
let handler: HeartbeatWakeHandler | null = null;

export function setHeartbeatWakeHandler(next: HeartbeatWakeHandler | null) {
  handler = next;  // 外部系统设置handler
}

export function requestHeartbeatNow(opts?: { reason?: string }) {
  queuePendingWakeReason({ reason: opts?.reason });
  schedule(DEFAULT_COALESCE_MS, "normal");  // 定时器触发
}
```

### 工作流程

1. **外部系统（如OpenClaw上层）**设置handler
2. 外部系统调用`requestHeartbeatNow()`请求心跳
3. 定时器到期后执行handler
4. handler决定是否触发Pi继续

### 关键结论

| 组件 | 职责 |
|------|------|
| **Pi** | 任务处理器 - 处理任务，完成后阻塞在getUserInput() |
| **OpenClaw heartbeat-wake** | 外部定时器 - 定时触发，不依赖Pi内置 |
| **外部系统（Nezha）** | 任务队列管理 + 触发Pi继续 |

**Pi本身不负责"永续运行" - 它只负责处理任务。**

---

## 十五、NUPI整合架构

```
┌─────────────────────────────────────────────────────────────┐
│  Nezha (任务队列 + 调度 + 提醒)                                │
│  - 管理任务队列                                                │
│  - ReminderService提醒AI自主创建任务                            │
│  - Scheduler调度任务                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Pi (任务处理器)                                               │
│  - Extension访问Nezha数据库                                    │
│  - 处理任务 → agent_end                                       │
│  - sendUserMessage继续下一个任务                               │
└─────────────────────────────────────────────────────────────┘
```

### 关键整合点

1. **环境变量**: DATABASE_URL让Extension连接Nezha
2. **API调用**: fetch()调用Nezha REST API
3. **事件驱动**: agent_end → Extension → 取下一个任务

### 正确理解

- ❌ **不可能**: 程序脚本自动生成有意义的任务
- ✅ **必须**: 提醒AI自主思考下一步，AI自己设计任务
- ReminderService的价值: 提醒AI"没有任务了，请思考下一步"

---

## 十六、BlindLoop机制

**发现问题:** ReminderService的`startBlindLoop()`被禁用：

```typescript
startBlindLoop(_intervalMs: number = BLIND_LOOP_INTERVAL_MS): void {
  logger.info('[Reminder] Periodic reminder disabled (handled by OpenCode plugin)');
  return;  // 直接返回，循环没启动！
}
```

**正确架构:**
```
BlindLoop定时触发 → ReminderService提醒AI → AI自主创建任务 → Pi处理 → 循环
```

需要恢复BlindLoop机制，但不需要OpenCode依赖。

---

## 十八、核心发现：System Prompt是关键

**关键洞察：** AI只需要一个提示/提醒，之后全部由AI自主决定。

### System Prompt的作用

System Prompt告诉AI：
1. 它是什么角色
2. 应该如何行为
3. **当没有任务时应该做什么**（自主思考下一步）

### 完整架构

```
┌─────────────────────────────────────────────────────────────┐
│  System Prompt (行为指南)                                     │
│  - 告诉AI角色和职责                                          │
│  - 告诉AI没有任务时应该自主思考                               │
│  - 告诉AI如何创建任务、执行工作                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  BlindLoop (触发器)                                           │
│  - 定时触发提醒                                               │
│  - 不是执行程序，而是唤醒AI                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  AI被唤醒，看到提醒                                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  AI根据System Prompt指引 → 自己决定下一步                     │
│  - 查数据库有没有任务                                         │
│  - 没有 → 自己创建任务                                        │
│  - 执行工作                                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  完成后继续等待下一个提醒                                      │
└─────────────────────────────────────────────────────────────┘
```

### 关键区分

| 组件 | 作用 |
|------|------|
| **程序(BindLoop等)** | 只是触发器，唤醒AI |
| **AI** | 真正的工作主体，自主决定 |
| **System Prompt** | AI的行为指南 |
| **数据库** | 任务存储，AI可以查询 |

### 错误的理解

❌ "程序自动执行任务"
❌ "程序判断任务完成"
❌ "程序决定下一步做什么"

### 正确的理解

✅ "BlindLoop唤醒AI"
✅ "AI看到提醒"
✅ "AI根据System Prompt自己决定下一步"
✅ "AI自己解决问题"

### 问题点

1. **BlindLoop被禁用** - 需要恢复
2. **System Prompt可能没有包含持续工作指引** - 需要检查
3. **提醒传递机制** - 需要确保AI能"看到"提醒

---

## 二十、核心发现：数据库是AI的大脑

**关键洞察：** 数据库是AI的外部记忆，AI只需要被唤醒，就能利用数据库自主工作。

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│  BlindLoop (触发器) - 定时唤醒AI                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  AI被唤醒，看到提醒                                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  AI查数据库（大脑）：                                          │
│  - 任务历史 → 知道之前做了什么                                │
│  - 记忆 → 知道上下文                                          │
│  - 技能 → 知道能做什么                                        │
│  - 经验 → 知道怎么做                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  AI自然知道下一步怎么做                                        │
└─────────────────────────────────────────────────────────────┘
```

### "第一推动力"架构

```
人类设置初始方向
      ↓
AI被唤醒
      ↓
AI查数据库获取上下文
      ↓
AI自己决定下一步
      ↓
AI自己执行
      ↓
更新数据库
      ↓
循环...
```

### 关键点

1. **BlindLoop只是触发器** - 不是执行器
2. **数据库是AI的大脑** - 存储所有上下文
3. **AI自己决定下一步** - 不需要程序判断
4. **System Prompt告诉AI如何查数据库** - AI知道去哪找

### 总结

AI不需要程序告诉它做什么。程序只是把它唤醒，它自己去"大脑"（数据库）里找答案。这就是真正的自主工作。

---

## 二十一、Scheduler与BlindLoop的完整工作流程

### Scheduler心跳机制

```
Scheduler.start()
    ↓
setInterval(每30秒)
    ↓
heartbeat()
    ↓
查PENDING任务 → 有任务 → aiProvider.complete(prompt) → 执行
    ↓
没任务 → 跳过什么都不做
```

### 问题：没有PENDING任务时，AI不工作

当任务队列为空时：
- Scheduler跳过
- aiProvider不被调用
- AI完全静止

### BlindLoop的价值

```
没任务 → BlindLoop提醒 → "继续自主工作"
    ↓
AI根据AUTO-EXECUTION INSTRUCTION自己决定下一步
    ↓
AI自己查数据库找事情做
```

### 当前问题

```typescript
// ReminderService.ts
startBlindLoop(_intervalMs: number = BLIND_LOOP_INTERVAL_MS): void {
  logger.info('[Reminder] Periodic reminder disabled (handled by OpenCode plugin)');
  return;  // 直接返回，定时器没启动！
}
```

BlindLoop被禁用。

### 解决方案：Pi Extension实现BlindLoop

```typescript
// Pi Extension: nezha-blind-loop.ts
import { pg } from 'pg';
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const db = new pg.Client(process.env.DATABASE_URL);

export default function(pi: ExtensionAPI) {
  let timerId: NodeJS.Timeout;

  pi.on("session_start", async () => {
    await db.connect();

    // 启动定时器
    timerId = setInterval(async () => {
      // 检查任务
      const result = await db.query(
        "SELECT * FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 1"
      );

      if (result.rows.length > 0) {
        // 有任务 → 发送
        pi.sendUserMessage(`执行任务: ${result.rows[0].title}`);
      } else {
        // 没任务 → AI自己决定
        pi.sendUserMessage("没有新任务，继续自主工作...");
      }
    }, 2 * 60 * 1000); // 2分钟
  });

  pi.on("session_shutdown", () => {
    clearInterval(timerId);
    db.end();
  });
}
```

### 完整架构

```
┌─────────────────────────────────────────────────────────────┐
│  Pi Extension (nezha-blind-loop)                             │
│  - setInterval定时触发                                       │
│  - 检查Nezha任务队列                                         │
│  - pi.sendUserMessage()发送消息                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Pi AI (根据AUTO-EXECUTION INSTRUCTION自主工作)              │
│  - NEVER wait for user input                                │
│  - ALWAYS select the RECOMMENDED option                      │
│  - 自己决定下一步                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Nezha PostgreSQL                                            │
│  - 任务队列                                                   │
│  - 记忆                                                      │
│  - 技能                                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 二十二、下一步行动

1. **创建Pi Extension文件** - `~/.pi/agent/extensions/nezha-blind-loop.ts`
2. **实现定时检查逻辑** - 用pg连接Nezha数据库
3. **实现消息发送** - 用pi.sendUserMessage()
4. **配置环境变量** - DATABASE_URL指向Nezha PostgreSQL
5. **测试** - 验证定时提醒正常工作

---

## 二十三、核心总结

| 组件 | 作用 |
|------|------|
| **Pi Extension** | 定时器 + 任务检查 + 消息发送 |
| **Pi AI** | 真正的工作主体，根据System Prompt自主决策 |
| **Nezha PostgreSQL** | 任务存储、AI记忆 |
| **AUTO-EXECUTION INSTRUCTION** | AI行为准则："不问人类，自己决定" |
| **BlindLoop提醒** | 唤醒AI，让AI知道"继续工作" |

**关键洞察：程序只是工具，AI才是主体。**
