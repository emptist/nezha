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

| Option | Description |
|--------|-------------|
| `--mode` | Agent mode: all, primary, subagent |
| `--tools` | Comma-separated tools: bash, read, write, edit, list, glob, grep, webfetch, task, todowrite, todoread |
| `--model` | Model to use: provider/model |
| `--description` | What the agent should do |

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
  "id":"ses_abc123def456",
  "title":"my-task-session",
  "directory":"/Users/jk/project",
  "version":"1.2.27"
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
  "info":{"role":"assistant","finish":"stop"},
  "parts":[
    {"type":"text","text":"闭包是指..."}
  ]
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
    const data = await response.json() as { id: string };
    return data.id;
  }

  // 发送消息
  private async sendMessage(sessionId: string, message: string): Promise<string> {
    const response = await fetch(`${this.serverUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }]
      }),
    });
    const data = await response.json() as { 
      parts?: Array<{ type: string; text: string }> 
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
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}
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

| 操作 | 命令 |
|------|------|
| 健康检查 | `GET /global/health` |
| 创建会话 | `POST /session` |
| 列出会话 | `GET /session` |
| 发送消息 | `POST /session/:id/message` |
| 删除会话 | `DELETE /session/:id` |
| 列出命令 | `GET /command` |
| 搜索文件 | `GET /find?pattern=*.ts` |
| 读取文件 | `GET /file/content?path=src/main.ts` |

---

## 性能数据

| 指标 | 数值 |
|------|------|
| 单任务执行时间 | 10-60 秒 |
| 成功率 | >95% |
| 会话创建延迟 | <1 秒 |
| API 响应延迟 | <100ms |

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

| 操作 | 命令 |
|------|------|
| 查看任务状态 | `psql ... -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"` |
| 查看运行中任务 | `psql ... -c "SELECT * FROM tasks WHERE status = 'RUNNING';"` |
| 重置卡住任务 | `psql ... -c "UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING';"` |
| 查看日志 | `tail -20 .nezha.log` |
| 重启 daemon | `pkill -f "node dist/cli/index.js start" && nohup node dist/cli/index.js start > .nezha.log 2>&1 &` |
| 测试 API | `curl http://localhost:4096/global/health` |

- OpenCode 官方文档: https://opencode.ai/docs/server
- API 完整规范: http://localhost:4096/doc

---

*本文档最后更新: 2026-03-18*
