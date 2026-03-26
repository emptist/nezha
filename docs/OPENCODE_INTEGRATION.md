# OpenCode 集成指南 - 详细操作手册

> 本文档详细说明如何在 Nezha 中集成 OpenCode，包含所有命令、配置和故障排除
> 适用于所有水平的 AI 阅读和执行

---

## OpenCode AI Spawning Methods

> **Important**: Nezha spawns OpenCode AI instances for task execution. Here's how to spawn multiple OpenCode AIs.

### Method 1: Create Subagent Agent

```bash
# Create a specialized subagent
opencode agent create --mode subagent --description "Task executor"

# Available modes:
# - all: Full agent with all capabilities
# - primary: Main agent
# - subagent: Child agent for specific tasks
```

### Method 2: Run with Specific Agent

```bash
# Run OpenCode with a specific agent
opencode run --agent <agent-name> "Your task here"

# Run with specific model
opencode run --agent <agent-name> -m provider/model "Your task"
```

### Method 3: Headless Server Mode

```bash
# Start headless server
opencode serve --port 4096

# Attach to running server
opencode attach http://localhost:4096

# Run against server
opencode run --attach http://localhost:4096 "Your task"
```

### Method 4: Parallel Execution (via Nezha Tasks)

Nezha can spawn multiple OpenCode instances by creating multiple tasks:

```bash
# Create multiple tasks - Nezha daemon will spawn multiple OpenCode instances
node dist/cli/index.js task-add "Spawn Request: AI Instance 1" "Task for AI 1" 9
node dist/cli/index.js task-add "Spawn Request: AI Instance 2" "Task for AI 2" 9
node dist/cli/index.js task-add "Spawn Request: AI Instance 3" "Task for AI 3" 9
```

### OpenCode Agent Configuration

| Option          | Description                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `--mode`        | Agent mode: all, primary, subagent                                                                    |
| `--tools`       | Comma-separated tools: bash, read, write, edit, list, glob, grep, webfetch, task, todowrite, todoread |
| `--model`       | Model to use: provider/model                                                                          |
| `--description` | What the agent should do                                                                              |

### Listing Available Agents

```bash
# List all available agents
opencode agent list
```

---

## 快速开始

### 1. 启动 OpenCode Server（必须的第一步！）

```bash
# 在终端中运行以下命令启动 OpenCode 服务器
opencode serve --port 4096

# 或者使用后台运行
nohup opencode serve --port 4096 > /tmp/opencode.log 2>&1 &

# 验证服务器是否启动成功
curl http://localhost:4096/global/health
# 应该返回类似: {"healthy":true,"version":"1.2.27"}
```

---

## 四种集成方式对比

### 方式一：CLI - `opencode run` 命令（❌ 不推荐）

**命令示例：**

```bash
opencode run "解释什么是闭包"
```

**问题：**

- 在 Node.js 脚本中调用时会卡住
- 不适合自动化调用
- 仅适用于手动交互

---

### 方式二：CLI - `--attach` 参数（❌ 不推荐）

**命令示例：**

```bash
opencode run --attach http://localhost:4096 "解释什么是闭包"
```

**问题：**

- 同样会在 Node.js 中卡住
- 不适合程序化调用

---

### 方式三：REST API（✅ 推荐）

**完整流程：**

#### 第一步：创建会话（Session）

```bash
curl -X POST http://localhost:4096/session \
  -H "Content-Type: application/json" \
  -d '{"title":"my-task-session"}'
```

**返回示例：**

```json
{
  "id": "ses_abc123def456",
  "title": "my-task-session",
  "directory": "/Users/jk/project",
  "version": "1.2.27"
}
```

**记住这个 session ID：`ses_abc123def456`**

#### 第二步：发送消息

```bash
# 将 {sessionId} 替换为上一步获得的 ID
curl -X POST http://localhost:4096/session/{sessionId}/message \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"解释什么是闭包"}]}'
```

**返回示例（部分）：**

```json
{
  "info": { "role": "assistant", "finish": "stop" },
  "parts": [{ "type": "text", "text": "闭包是指..." }]
}
```

#### 第三步：删除会话（可选）

```bash
curl -X DELETE http://localhost:4096/session/{sessionId}
```

---

### 方式四：ACP 协议（未测试）

```bash
opencode acp --port 4096
```

---

## 在 Nezha 中的实际使用

### Agent.ts 核心代码

```typescript
// 文件位置: src/core/Agent.ts

export class Agent {
  private readonly serverUrl = 'http://localhost:4096';
  private sessionId: string | null = null;

  // 创建会话
  private async createSession(): Promise<string> {
    const response = await fetch(`${this.serverUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'nezha-task-session' }),
    });
    const data = (await response.json()) as { id: string };
    return data.id;
  }

  // 发送消息
  private async sendMessage(sessionId: string, message: string): Promise<string> {
    const response = await fetch(`${this.serverUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }],
      }),
    });
    const data = (await response.json()) as {
      parts?: Array<{ type: string; text: string }>;
    };

    // 提取文本内容
    if (data.parts) {
      return data.parts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n');
    }
    return JSON.stringify(data);
  }

  // 执行任务
  async executeTask(message: string): Promise<AgentResponse> {
    try {
      // 复用或创建新会话
      if (!this.sessionId) {
        this.sessionId = await this.createSession();
      }

      // 发送消息并等待响应
      const responseText = await this.sendMessage(this.sessionId, message);

      return { success: true, message: responseText };
    } catch (error) {
      // 如果会话出错，清除并重试
      this.sessionId = null;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
```

---

## nezha-action 插件 (OpenCode 提醒)

> 实现 OpenCode 依赖 Nezha 的桥梁：自动向 AI 推送待处理任务和广播

### 概述

nezha-action 插件在 OpenCode 会话中自动注入提醒，让 AI 主动检查待处理任务和广播。

### 安装

```bash
# 创建插件目录
mkdir -p ~/.config/opencode/plugins

# 创建插件文件
cat > ~/.config/opencode/plugins/nezha-action.ts << 'EOF'
import type { Plugin } from "@opencode-ai/plugin";

const LEARN_PROMPT = `
💡 [Nezha] 任务完成提醒

1. 使用 areflect 保存学习：
   - [LEARN] 总结本次工作要点
   - [TASK] 新任务添加跟踪
2. 使用 get_system_info() 查看 open issues
3. 自主决策，不要等待人类指示。
`;

const REMINDER_INTERVAL_MS = 2 * 60 * 1000;

const DEFAULT_TASK_REMINDER = `
🎯 [Nezha] Pending 工作摘要：

- 有待处理任务，请检查任务列表
- 自主处理，不要等待人类指示。
`;

const DEFAULT_BROADCAST_REMINDER = `
📢 [Nezha] 有新广播：

请使用 nezha-learning MCP 工具的 check_broadcasts() 查看详细内容。
`;

function buildTaskReminder(taskCount: number): string {
  return taskCount > 0
    ? `🎯 [Nezha] 你有 ${taskCount} 个待处理任务，请主动检查并处理。`
    : DEFAULT_TASK_REMINDER;
}

function buildBroadcastReminder(broadcastCount: number): string {
  return broadcastCount > 0
    ? `📢 [Nezha] 你有 ${broadcastCount} 条新广播等待查看！\n\n使用 check_broadcasts() 查看并参与讨论。`
    : `📢 [Nezha] 暂无新广播。`;
}

export const NezhaActionPlugin: Plugin = async (ctx) => {
  console.log("[nezha-action] Plugin loaded successfully");

  let lastCheckTime = Date.now();

  const doTaskCheck = async (taskCount: number = 0) => {
    const prompt = buildTaskReminder(taskCount);
    console.log("[nezha-action] 固定间隔提醒：检查 pending 任务");
    await ctx.client.tui.appendPrompt({ body: { text: prompt } });
    console.log("[nezha-action] 任务提醒已注入");
  };

  const doBroadcastReminder = async (broadcastCount: number = 1) => {
    const prompt = buildBroadcastReminder(broadcastCount);
    console.log("[nezha-action] 广播提醒：检查新讨论");
    await ctx.client.tui.appendPrompt({ body: { text: prompt } });
    console.log("[nezha-action] 广播提醒已注入");
  };

  const doLearnReminder = async () => {
    console.log("[nezha-action] 事件断点提醒：保存学习");
    await ctx.client.tui.appendPrompt({ body: { text: LEARN_PROMPT } });
    console.log("[nezha-action] 学习提醒已注入");
  };

  const startIntervalReminder = () => {
    setInterval(doTaskCheck, REMINDER_INTERVAL_MS);
    setInterval(doBroadcastReminder, REMINDER_INTERVAL_MS * 2);
    console.log(`[nezha-action] 固定间隔提醒已启动 (${REMINDER_INTERVAL_MS / 1000 / 60} 分钟)`);
  };

  return {
    event: async ({ event }) => {
      console.log("[nezha-action] Event received:", event.type);

      if (event.type === "session.created") {
        console.log("[nezha-action] Session created, 事件断点提醒...");
        doLearnReminder();
        doTaskCheck();
        doBroadcastReminder();
        startIntervalReminder();
      }

      if (event.type === "session.idle") {
        console.log("[nezha-action] Session idle detected!");
        doLearnReminder();
        doTaskCheck();
        doBroadcastReminder();
      }

      if (event.type === "session.status") {
        const now = Date.now();
        if (now - lastCheckTime > REMINDER_INTERVAL_MS) {
          doTaskCheck();
          lastCheckTime = now;
        }
      }
    },
  };
};
EOF
```

插件会自动加载，无需在 opencode.json 中配置。

### 功能

| 触发点           | 提醒内容                                |
| ---------------- | --------------------------------------- |
| session.created  | 💡 学习提醒 + 🎯 任务提醒 + 📢 广播提醒 |
| session.idle     | 💡 学习提醒 + 🎯 任务提醒 + 📢 广播提醒 |
| 固定间隔 (2分钟) | 🎯 任务提醒                             |
| 固定间隔 (4分钟) | 📢 广播提醒                             |

### 验证

```bash
# 启动 OpenCode，查看日志
opencode --print-logs

# 应该看到：
# [nezha-action] Plugin loaded successfully
# [nezha-action] Event received: session.created
# [nezha-action] 任务提醒已注入
```

---

## 故障排除

### 问题 1：任务一直超时

**症状：** 任务执行超过 5 分钟仍然没有完成

**检查步骤：**

1. 确认 OpenCode server 正在运行：

```bash
curl http://localhost:4096/global/health
```

2. 确认端口正确（默认 4096）：

```bash
lsof -i :4096
```

3. 检查防火墙设置：

```bash
# macOS
sudo pfctl -a com.apple.airdrop -s pass 2>/dev/null || true
```

---

### 问题 2：创建会话失败

**症状：** `Failed to create session` 错误

**可能原因：**

- OpenCode server 未启动
- 端口被占用
- 权限问题

**解决步骤：**

1. 杀掉现有进程：

```bash
pkill -f "opencode serve"
```

2. 重新启动：

```bash
opencode serve --port 4096
```

3. 等待几秒后重试：

```bash
sleep 5
curl -X POST http://localhost:4096/session -H "Content-Type: application/json" -d '{"title":"test"}'
```

---

### 问题 3：发送消息无响应

**症状：** POST 到 /message 端点后一直等待

**可能原因：**

- 任务正在执行中（正常）
- 网络问题
- 会话已过期

**解决步骤：**

1. 检查会话状态：

```bash
curl http://localhost:4096/session/{sessionId}
```

2. 如果会话不存在，创建新会话：

```bash
curl -X POST http://localhost:4096/session -H "Content-Type: application/json" -d '{"title":"new-session"}'
```

---

### 问题 4：返回 404 错误

**症状：** HTTP 404 错误

**检查：**

```bash
# 确认 URL 正确
curl http://localhost:4096/doc
```

如果返回 404，说明 server 未正常启动。

---

## 完整测试流程

### 手动测试（复制下面的命令执行）

```bash
# 1. 启动 OpenCode server
opencode serve --port 4096

# 2. 验证服务健康
sleep 3
curl http://localhost:4096/global/health

# 3. 创建会话（记住返回的 id）
SESSION_ID=$(curl -s -X POST http://localhost:4096/session \
  -H "Content-Type: application/json" \
  -d '{"title":"test"}' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "Session ID: $SESSION_ID"

# 4. 发送消息
curl -s -X POST "http://localhost:4096/session/$SESSION_ID/message" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"1+1等于多少"}]}'

# 5. 删除会话（清理）
curl -X DELETE "http://localhost:4096/session/$SESSION_ID"
```

---

## 常用 API 端点速查

| 操作     | 命令                                 |
| -------- | ------------------------------------ |
| 健康检查 | `GET /global/health`                 |
| 创建会话 | `POST /session`                      |
| 列出会话 | `GET /session`                       |
| 发送消息 | `POST /session/:id/message`          |
| 删除会话 | `DELETE /session/:id`                |
| 列出命令 | `GET /command`                       |
| 搜索文件 | `GET /find?pattern=*.ts`             |
| 读取文件 | `GET /file/content?path=src/main.ts` |

---

## 性能数据

| 指标           | 数值     |
| -------------- | -------- |
| 单任务执行时间 | 10-60 秒 |
| 成功率         | >95%     |
| 会话创建延迟   | <1 秒    |
| API 响应延迟   | <100ms   |

---

## OpenCode on Nezha / Nezhapi

> **关键**: Nezha 和 Nezhapi 是**独立产品**，不依赖 OpenCode

Nezha 提供两种架构供 OpenCode 运行（但两者都可以独立使用）：

### 方案 1: OpenCode on Nezha

OpenCode 运行在 Nezha 之上，使用 CLI 或数据库：

```bash
# 通过 CLI 调用
nezha task-add "任务" "描述" 50

# 或直接操作数据库
psql -d nezha -c "INSERT INTO tasks ..."
```

**适用场景**：简单任务管理，无需额外服务

---

### 方案 2: OpenCode on Nezhapi

> **Nezhapi = Nezha + Pi = 增强版哪吒**

Nezhapi 是 **Nezha 与 Pi 的深度融合产品**：

- **Nezha 的增强**: 增加 pi 执行能力、REST API
- **Pi 的增强**: 增加任务管理、长期记忆、多 AI 协作

**设计模式 4**: Nezha 使用 Pi 做事

> **核心架构**: Nezha (管理) → Pi (执行)

| 组件      | 职责                                     |
| --------- | ---------------------------------------- |
| **Nezha** | 任务管理、长期记忆、多 AI 协作、调度监控 |
| **Pi**    | 代码执行、动态工具创建、会话管理         |

**适用场景**：需要 pi 执行能力、REST API、多 AI 协作

**成功后转向**: 如果 nezhapi 验证成功，主攻 nezhapi 开发，nezha 保持维护

---

### 方案 2: OpenCode on Nezhapi (Nezha + Pi)

> **当前状态**: REST API 已可用，Pi 执行器集成开发中

通过 REST API 调用 Nezhapi：

```bash
# 启动服务
npm run nezhapi

# API 调用
curl http://localhost:4099/tasks
curl http://localhost:4099/broadcast
```

**优点**：

- 统一 API 接口
- 支持 Pi 执行任务 (开发中)
- 可扩展性强

**缺点**：

- 需要运行额外服务

---

## Nezhapi (Nezha + Pi 集成)

> **Nezhapi = Nezha + Pi**

Nezha 与 Pi 的集成服务，同时提供：

1. **REST API** - 任务/广播/记忆管理 (端口 4099)
2. **Pi 执行器** - 调用本地 pi 执行代码任务

### 启动服务

```bash
# 方式 1: 使用 npm
npm run nezhapi

# 方式 2: 直接运行
node dist/api/NezhaApiServer.js

# 方式 3: 指定端口
NEZHAPI_PORT=4100 npm run nezhapi
```

服务默认监听端口 **4099**。

### API 端点

| 端点         | 方法 | 功能             | 示例                                                                                                                           |
| ------------ | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/health`    | GET  | 健康检查         | `curl http://localhost:4099/health`                                                                                            |
| `/identity`  | GET  | 获取当前 AI 身份 | `curl http://localhost:4099/identity`                                                                                          |
| `/tasks`     | GET  | 获取待处理任务   | `curl http://localhost:4099/tasks`                                                                                             |
| `/tasks`     | POST | 创建新任务       | `curl -X POST -H "Content-Type: application/json" -d '{"title":"任务","priority":50}' http://localhost:4099/tasks`             |
| `/broadcast` | GET  | 获取广播列表     | `curl http://localhost:4099/broadcast`                                                                                         |
| `/broadcast` | POST | 发送广播         | `curl -X POST -H "Content-Type: application/json" -d '{"message":"内容","priority":"normal"}' http://localhost:4099/broadcast` |
| `/memory`    | GET  | 搜索记忆         | `curl "http://localhost:4099/memory?query=关键词"`                                                                             |
| `/memory`    | POST | 保存记忆         | `curl -X POST -H "Content-Type: application/json" -d '{"topic":"主题","insight":"内容"}' http://localhost:4099/memory`         |

### OpenCode 集成示例

```typescript
// 在 OpenCode 工具中调用 Nezhapi
const tasks = await fetch('http://localhost:4099/tasks').then(r => r.json());
console.log('待处理任务:', tasks.rows.length);

// 创建新任务
await fetch('http://localhost:4099/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: '修复登录 bug',
    description: '用户无法登录',
    priority: 80,
  }),
});
```

---

## 常用命令大全

### 1. 查看任务状态（最常用！）

```bash
# 查看所有任务状态统计
/Applications/Postgres.app/Contents/VersIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"
```

**输出示例：**

```
  status   | count
-----------+-------
 COMPLETED |    71
 PENDING   |    13
 RUNNING   |     1
(3 rows)
```

---

### 2. 查看当前正在执行的任务

```bash
# 查看正在运行的任务
/Applications/Postgres.app/Contents/VersIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT id, title, status, started_at FROM tasks WHERE status = 'RUNNING';"
```

---

### 3. 查看最近完成的任务

```bash
# 查看最近5个完成的任务
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT title, completed_at FROM tasks WHERE status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 5;"
```

---

### 4. 查看任务详情

```bash
# 用任务 ID 查看具体任务
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT * FROM tasks WHERE id = '任务ID';"
```

---

### 5. 重置卡住的任务

```bash
# 将 RUNNING 状态的任务重置为 PENDING
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE tasks SET status = 'PENDING', started_at = NULL, retry_count = 0 WHERE status = 'RUNNING';"
```

---

### 6. 查看 Nezha 日志

```bash
# 查看最近日志
tail -20 .nezha.log

# 实时查看日志
tail -f .nezha.log

# 查看特定时间后的日志
tail -n 1000 .nezha.log | grep "ERROR"
```

---

### 7. 启动/重启服务

```bash
# 重启 Nezha daemon
pkill -f "node dist/cli/index.js start" 2>/dev/null
sleep 1
nohup node dist/cli/index.js start > .nezha.log 2>&1 &

# 查看 daemon 是否运行
ps aux | grep "dist/cli/index.js" | grep -v grep
```

---

### 8. OpenCode Server 相关

```bash
# 启动 OpenCode server
opencode serve --port 4096

# 查看 OpenCode 是否运行
ps aux | grep "opencode serve" | grep -v grep

# 重启 OpenCode server
pkill -f "opencode serve"
sleep 2
nohup opencode serve --port 4096 > /tmp/opencode.log 2>&1 &

# 测试 OpenCode API
curl http://localhost:4096/global/health
```

---

### 9. PostgreSQL 相关

```bash
# 检查 PostgreSQL 是否运行
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT 1;"

# 查看数据库表
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "\dt"

# 查看任务表结构
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "\d tasks"
```

---

### 10. Git 相关

```bash
# 查看未提交的更改
git status

# 查看最近的提交
git log --oneline -10

# 查看当前分支
git branch

# 强制推送（谨慎使用！）
git push -f
```

---

## 一键重启脚本

```bash
#!/bin/bash
# 重启所有服务

echo "=== 重启 Nezha ==="

# 1. 重启 PostgreSQL（如果需要）
# /Applications/Postgres.app/Contents/VERSIONS/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18 restart

# 2. 重启 OpenCode server
echo "重启 OpenCode server..."
pkill -f "opencode serve"
sleep 2
nohup opencode serve --port 4096 > /tmp/opencode.log 2>&1 &
sleep 3

# 3. 重启 Nezha daemon
echo "重启 Nezha daemon..."
pkill -f "node dist/cli/index.js start"
sleep 1
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
sleep 3

# 4. 检查状态
echo "=== 服务状态 ==="
curl -s http://localhost:4096/global/health
echo ""
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"

echo "=== 完成 ==="
```

---

## 快速调试流程

遇到问题时，按顺序执行以下命令：

```bash
# 1. 检查 OpenCode server
curl http://localhost:4096/global/health

# 2. 检查 PostgreSQL
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT 1;"

# 3. 检查任务状态
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"

# 4. 查看最新日志
tail -30 .nezha.log

# 5. 如果任务卡住，重置它
/Applications/Postgres.app/Contents/VERSIONS/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c "UPDATE tasks SET status = 'PENDING', started_at = NULL, retry_count = 0 WHERE status = 'RUNNING';"
```

---

## 常用命令速查表

| 操作           | 命令                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------- |
| 查看任务状态   | `psql ... -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"`                                 |
| 查看运行中任务 | `psql ... -c "SELECT * FROM tasks WHERE status = 'RUNNING';"`                                       |
| 重置卡住任务   | `psql ... -c "UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING';"`                       |
| 查看日志       | `tail -20 .nezha.log`                                                                               |
| 重启 daemon    | `pkill -f "node dist/cli/index.js start" && nohup node dist/cli/index.js start > .nezha.log 2>&1 &` |
| 测试 API       | `curl http://localhost:4096/global/health`                                                          |

- OpenCode 官方文档: https://opencode.ai/docs/server
- API 完整规范: http://localhost:4096/doc

---

## 自主改进循环 (Autonomous Self-Improvement Loop)

Nezha 实现了 AI 自主改进循环，让多个 AI 能够协作学习和改进系统。

### 循环流程

```
┌─────────────────────────────────────────────────────────────┐
│                      Autonomous Loop                          │
│                                                             │
│  1. HeartbeatService 执行任务                                │
│         ↓                                                   │
│  2. 注入最近广播到任务提示                                   │
│         ↓                                                   │
│  3. AI 完成任务 → 调用 areflect 保存学习                    │
│         ↓                                                   │
│  4. 学习保存到 memory 表                                     │
│         ↓                                                   │
│  5. Inter-Review 评审代码变更                               │
│         ↓                                                   │
│  6. 从评审中提取新学习 → 回到步骤 1                        │
└─────────────────────────────────────────────────────────────┘
```

### 关键组件

| 组件                 | 作用                     |
| -------------------- | ------------------------ |
| `HeartbeatService`   | 调度任务，注入广播上下文 |
| `BroadcastService`   | 发送广播到所有 AI        |
| `InterReviewService` | 自动评审代码             |
| `ReminderService`    | 周期性提醒 AI            |
| `SoulService`        | 管理 AI 个性/人格        |

### MCP 工具

```typescript
// 检查广播
check_broadcasts();

// 响应广播
respond_to_broadcast(broadcast_id, response);

// 保存学习
learn(insight, context);

// 获取系统信息
get_system_info();

// 获取任务
get_tasks(status, limit);
```

### 广播类型

| 类型        | 用途                   |
| ----------- | ---------------------- |
| `broadcast` | 系统广播，所有 AI 可见 |
| `question`  | 需要响应的讨论         |
| `answer`    | 对问题的响应           |
| `meeting`   | 会议邀请               |

---

_本文档最后更新: 2026-03-27_
