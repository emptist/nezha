# OpenClaw 持续工作的核心技术分析

**创建时间**: 2026-03-16  
**状态**: 核心技术分析

---

## 🎯 关键发现

**OpenClaw 能持续工作的核心原因**：它有一个**持续运行的服务**，而不是依赖编辑器 AI。

---

## 📊 OpenClaw 的架构

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw 架构                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Gateway 服务（持续运行）                  │    │
│  │                                                   │    │
│  │  while (true) {                                  │    │
│  │    // 1. 连接到消息通道                           │    │
│  │    listener = await connect();                   │    │
│  │                                                   │    │
│  │    // 2. 设置心跳和看门狗                         │    │
│  │    heartbeat = setInterval(...);                 │    │
│  │    watchdog = setInterval(...);                  │    │
│  │                                                   │    │
│  │    // 3. 等待消息或断开                           │    │
│  │    await Promise.race([                          │    │
│  │      listener.onClose,                           │    │
│  │      waitForever()                               │    │
│  │    ]);                                           │    │
│  │                                                   │    │
│  │    // 4. 如果断开，重连                           │    │
│  │    // 继续循环...                                 │    │
│  │  }                                               │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│                          ▼                              │
│              ┌─────────────────────┐                    │
│  有消息时 →  │   AI 处理消息        │                    │
│              └─────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### 关键代码

#### 1. `waitForever()` 函数

**文件**: `/Users/jk/gits/hub/openclaw/src/cli/wait.ts`

```typescript
export function waitForever() {
  // Keep event loop alive via an unref'ed interval plus a pending promise.
  const interval = setInterval(() => {}, 1_000_000);
  interval.unref();
  return new Promise<void>(() => {
    /* never resolve */
  });
}
```

**作用**:
- 创建一个永远不会 resolve 的 Promise
- 使用 `setInterval` 保持事件循环活跃
- `interval.unref()` 允许进程在没有其他活动时退出

#### 2. `while (true)` 循环

**文件**: `/Users/jk/gits/hub/openclaw/src/web/auto-reply/monitor.ts`

```typescript
while (true) {
  // 1. 连接到 WhatsApp
  const listener = await monitorWebInbox({ ... });
  
  // 2. 设置心跳和看门狗
  heartbeat = setInterval(() => {
    // 心跳逻辑：定期检查连接状态
  }, heartbeatSeconds * 1000);
  
  watchdogTimer = setInterval(() => {
    // 看门狗逻辑：检测超时
    if (timeSinceLastMessage > MESSAGE_TIMEOUT_MS) {
      // 强制重连
      listener.signalClose?.({ status: 499, isLoggedOut: false, error: "watchdog-timeout" });
    }
  }, WATCHDOG_CHECK_MS);
  
  // 3. 等待连接关闭或中止
  const reason = await Promise.race([
    listener.onClose?.catch(...) ?? waitForever(),
    abortPromise ?? waitForever(),
  ]);
  
  // 4. 如果中止，退出循环
  if (stopRequested() || sigintStop || reason === "aborted") {
    await closeListener();
    break;
  }
  
  // 5. 否则，重连（继续循环）
  // ... 重连逻辑 ...
}
```

**作用**:
- 持续运行，不断监听消息
- 自动重连机制
- 心跳和看门狗保证稳定性

---

## 📊 Nezha 的架构

### 核心问题

```
┌─────────────────────────────────────────────────────────┐
│                    Nezha 架构                            │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         HeartbeatService（尝试持续运行）          │    │
│  │                                                   │    │
│  │  async start() {                                 │    │
│  │    await this.scheduler.start();                 │    │
│  │  }                                               │    │
│  │                                                   │    │
│  │  // ⚠️ 问题：没有 while (true) 循环               │    │
│  │  // ⚠️ 问题：没有 waitForever()                  │    │
│  │  // ⚠️ 问题：依赖 Scheduler 的定时器              │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│                          ▼                              │
│              ┌─────────────────────┐                    │
│  定时触发 →  │   AI 执行任务        │                    │
│              └─────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### 关键问题

1. **没有持续运行的循环**
   - HeartbeatService 只是启动了 Scheduler
   - Scheduler 依赖定时器（`setInterval`）
   - 但没有 `while (true)` 循环来保证持续运行

2. **没有 `waitForever()` 机制**
   - 没有"永远等待"的机制
   - 进程可能在空闲时退出

3. **依赖编辑器 AI**
   - OpenClaw 有自己的 AI 处理逻辑
   - Nezha 需要调用编辑器 AI
   - 编辑器 AI 不会持续运行

---

## 🎯 解决方案

### 方案 1: 为 Nezha 添加持续运行机制

**实现步骤**:

1. **创建 `waitForever()` 函数**

```typescript
// src/utils/wait.ts
export function waitForever(): Promise<void> {
  const interval = setInterval(() => {}, 1_000_000);
  interval.unref();
  return new Promise<void>(() => {});
}
```

2. **修改 HeartbeatService**

```typescript
// src/services/HeartbeatService.ts
import { waitForever } from '../utils/wait.js';

export class HeartbeatService {
  async start(): Promise<void> {
    console.log('Starting HeartbeatService...');
    
    // 启动心跳定时器
    await this.scheduler.start();
    
    // 持续运行
    while (true) {
      // 1. 查询待处理任务
      const tasks = await this.getPendingTasks();
      
      // 2. 如果有任务，执行
      if (tasks.length > 0) {
        for (const task of tasks) {
          await this.executeTask(task.id, task.title, task.description);
        }
      }
      
      // 3. 等待下一次心跳
      await new Promise(resolve => setTimeout(resolve, this.heartbeatIntervalMs));
    }
  }
  
  private async getPendingTasks(): Promise<Task[]> {
    const tableName = DATABASE_TABLES.TASKS;
    const result = await this.db.query(
      `SELECT * FROM ${tableName} WHERE status = $1 ORDER BY priority DESC`,
      [TASK_STATUS.PENDING]
    );
    return result.rows;
  }
}
```

3. **创建 CLI 启动命令**

```typescript
// src/cli/index.ts
import { HeartbeatService } from '../services/HeartbeatService.js';
import { createDatabaseClient } from '../db/DatabaseClient.js';

program
  .command('start')
  .description('Start the Nezha daemon')
  .action(async () => {
    const db = await createDatabaseClient();
    const service = new HeartbeatService(db);
    
    // 持续运行
    await service.start();
  });
```

### 方案 2: 使用 PM2 或 systemd

**实现步骤**:

1. **使用 PM2**

```bash
# 安装 PM2
npm install -g pm2

# 启动 Nezha daemon
pm2 start dist/cli/index.js --name nezha-daemon -- start

# 查看状态
pm2 status

# 查看日志
pm2 logs nezha-daemon

# 设置开机自启
pm2 startup
pm2 save
```

2. **使用 systemd**（Linux）

```ini
# /etc/systemd/system/nezha.service
[Unit]
Description=Nezha AI Daemon
After=network.target postgresql.service

[Service]
Type=simple
User=jk
WorkingDirectory=/Users/jk/gits/hub/nezha
ExecStart=/usr/bin/node dist/cli/index.js start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 启动服务
sudo systemctl start nezha

# 设置开机自启
sudo systemctl enable nezha

# 查看状态
sudo systemctl status nezha
```

---

## 📊 对比总结

| 维度 | OpenClaw | Nezha (当前) | Nezha (改进后) |
|------|----------|-------------|---------------|
| **持续运行** | ✅ `while (true)` + `waitForever()` | ❌ 只有定时器 | ✅ 添加循环和等待 |
| **自动重连** | ✅ 在循环中重连 | ❌ 无 | ✅ 添加重连逻辑 |
| **心跳机制** | ✅ `setInterval` 心跳 | ✅ `setInterval` 心跳 | ✅ 保持 |
| **看门狗** | ✅ 检测超时 | ❌ 无 | ✅ 添加看门狗 |
| **进程管理** | ✅ 自己管理 | ❌ 无 | ✅ PM2/systemd |
| **依赖编辑器 AI** | ❌ 有自己的 AI | ✅ 依赖编辑器 AI | ⚠️ 仍然依赖 |

---

## 🚀 立即可做的改进

### 1. 添加 `waitForever()` 函数

```bash
# 创建文件
touch src/utils/wait.ts
```

### 2. 修改 HeartbeatService

```bash
# 编辑文件
# 添加 while (true) 循环
# 添加 waitForever() 调用
```

### 3. 使用 PM2 运行

```bash
# 启动 daemon
pm2 start dist/cli/index.js --name nezha-daemon -- start
```

---

## 🎯 关键洞察

**OpenClaw 能持续工作的核心原因**：

1. **持续运行的服务**
   - 不是依赖编辑器 AI
   - 而是一个独立的服务进程

2. **`while (true)` 循环**
   - 保证持续运行
   - 自动重连机制

3. **`waitForever()` 函数**
   - 保持事件循环活跃
   - 防止进程退出

4. **心跳和看门狗**
   - 定期检查状态
   - 检测超时并重连

**Nezha 需要学习的关键点**：

1. ✅ 添加 `while (true)` 循环
2. ✅ 添加 `waitForever()` 函数
3. ✅ 添加自动重连逻辑
4. ✅ 添加看门狗机制
5. ✅ 使用 PM2 或 systemd 管理进程

---

**创建时间**: 2026-03-16  
**状态**: 核心技术分析完成  
**下一步**: 实施 Nezha 的持续运行机制
