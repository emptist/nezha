# 持续工作架构

## 核心设计

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL (知识中枢)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │  tasks      │  │  knowledge  │  │  memories   │       │
│  │  任务队列   │  │  知识库     │  │  记忆       │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────┘
         ↑                  ↑
         │                  │
┌────────┴──────────────────┴────────┐
│      Heartbeat Daemon (Node.js)   │
│  ┌─────────────────────────────┐   │
│  │ 1. 定时检查任务表           │   │
│  │ 2. 读取任务描述            │   │
│  │ 3. 调用 opencode API      │   │
│  │ 4. 写入执行结果            │   │
│  └─────────────────────────────┘   │
└────────────────────────────────────┘
         ↑
         ↓
┌────────────────────────────────────┐
│        opencode (执行引擎)           │
│  ┌─────────────────────────────┐    │
│  │ 接收任务 → 分析 → 执行 → 返回 │    │
│  └─────────────────────────────┘    │
└────────────────────────────────────┘
```

## 为什么不用 pg_cron

1. 需要额外安装扩展
2. 依赖外部 cron 进程
3. 自己写更灵活

## Heartbeat 流程

```typescript
// 每 30 分钟运行一次
setInterval(async () => {
  // 1. 读取待执行任务
  const task = await pg.query(
    "SELECT * FROM tasks WHERE status = 'pending' ORDER BY priority DESC LIMIT 1"
  );
  
  if (!task) {
    // 无任务，记录 heartbeat OK
    await pg.query("INSERT INTO heartbeats (status) VALUES ('ok')");
    return;
  }
  
  // 2. 调用 opencode API 执行任务
  const session = await fetch("/session", { method: "POST" });
  const response = await fetch(`/session/${session.id}/message`, {
    body: JSON.stringify({ parts: [{ type: "text", text: task.description }] })
  });
  
  // 3. 等待响应（可能需要轮询）
  
  // 4. 写入结果
  await pg.query(
    "UPDATE tasks SET status = 'completed', result = $1 WHERE id = $2",
    [response, task.id]
  );
}, 30 * 60 * 1000);
```

## 关键点

- **opencode 激活**：通过 API 发送消息，让 AI 自主决策
- **任务来源**：写入 PG 任务表，或读取项目中的任务文件
- **结果存储**：执行结果存回 PG，供后续检索

## 下一步

1. 完善 tasks 表 schema
2. 实现 heartbeat daemon 基础代码
3. 测试 opencode API 调用
