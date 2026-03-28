# Nezha vs pi-mono mom 对比分析

> **日期**: 2026-03-28  
> **背景**: pi-mono 已测试 nupi 组合，但模型成本问题暂缓；Nezha 有智谱免费版可先行

---

## 1. 架构对比

### 1.1 pi-mono mom

```
mom (Master Of Mischief)
├── Slack Bot
│   ├── @mentions 响应
│   ├── DM 消息
│   └── 频道消息
├── Events System
│   ├── immediate（立即）
│   ├── one-shot（一次性）
│   └── periodic（周期性）
├── Tools
│   ├── bash（主要工具）
│   ├── read/write
│   └── attach
├── Memory
│   ├── MEMORY.md（全局）
│   └── channel MEMORY.md
└── Docker Sandbox
```

### 1.2 Nezha

```
Nezha
├── REST API
│   ├── POST /prompt（AI 调用）
│   ├── POST /task（创建任务）
│   └── GET /health（健康检查）
├── Task Queue
│   ├── PENDING
│   ├── RUNNING
│   └── COMPLETED/FAILED
├── MCP Tools
│   ├── remind_me
│   ├── get_system_info
│   └── areflect
├── Memory
│   ├── PostgreSQL memory 表
│   └── .tmp/nezha-memory/
├── Skills
│   ├── PostgreSQL skills 表
│   └── .trae/skills/
└── Daemon
    ├── Scheduler
    ├── HeartbeatService
    └── ReminderService
```

---

## 2. 核心功能对比

| 功能 | mom | Nezha | 说明 |
|------|-----|-------|------|
| **触发方式** | Slack @mention | REST API / CLI | mom 更适合团队协作 |
| **事件调度** | Events System | Task Queue + Heartbeat | mom 更灵活（cron） |
| **记忆系统** | MEMORY.md 文件 | PostgreSQL 表 | Nezha 更易搜索 |
| **技能系统** | 自定义 CLI 工具 | PostgreSQL + MCP | 各有优势 |
| **AI 提醒** | Periodic Events | ReminderService | 相似功能 |
| **自主性** | Self-managing | Self-improving | 都能自主运行 |
| **成本** | 需要付费模型 | 智谱免费版 | Nezha 当前优势 |

---

## 3. Events System vs Task Queue

### 3.1 mom Events System

```json
// immediate - 立即执行
{
  "type": "immediate",
  "channelId": "C123ABC",
  "text": "New support ticket received: #12345"
}

// one-shot - 一次性提醒
{
  "type": "one-shot",
  "channelId": "C123ABC",
  "text": "Remind Mario about dentist",
  "at": "2025-12-15T09:00:00+01:00"
}

// periodic - 周期性任务
{
  "type": "periodic",
  "channelId": "C123ABC",
  "text": "Check inbox and summarize",
  "schedule": "0 9 * * 1-5",
  "timezone": "Europe/Vienna"
}
```

**优势**:
- 灵活的 cron 调度
- 文件系统驱动（简单）
- 支持时区

### 3.2 Nezha Task Queue

```sql
-- 任务表
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title TEXT,
  description TEXT,
  priority INTEGER,
  status TEXT, -- PENDING, RUNNING, COMPLETED, FAILED
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- 心跳驱动
Scheduler.heartbeat() → onTaskReady() → executeTask()
```

**优势**:
- 数据库驱动（可靠）
- 优先级排序
- 状态追踪

---

## 4. Nezha 可以借鉴的设计

### 4.1 Events System

Nezha 可以添加类似的事件系统：

```sql
-- 事件表
CREATE TABLE events (
  id UUID PRIMARY KEY,
  type TEXT, -- immediate, one-shot, periodic
  target TEXT, -- 'opencode', 'trae', 'all'
  content TEXT,
  scheduled_at TIMESTAMP,
  cron_schedule TEXT, -- for periodic
  timezone TEXT,
  status TEXT, -- pending, executed, cancelled
  created_at TIMESTAMP
);
```

```typescript
// src/services/EventService.ts
export class EventService {
  async createImmediateEvent(target: string, content: string): Promise<void> {
    await this.db.query(
      `INSERT INTO events (type, target, content, status) VALUES ('immediate', $1, $2, 'pending')`,
      [target, content]
    );
  }

  async createOneShotEvent(
    target: string,
    content: string,
    at: Date
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO events (type, target, content, scheduled_at, status) VALUES ('one-shot', $1, $2, $3, 'pending')`,
      [target, content, at]
    );
  }

  async createPeriodicEvent(
    target: string,
    content: string,
    cronSchedule: string,
    timezone: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO events (type, target, content, cron_schedule, timezone, status) VALUES ('periodic', $1, $2, $3, $4, 'pending')`,
      [target, content, cronSchedule, timezone]
    );
  }

  async processEvents(): Promise<void> {
    // 处理 immediate
    const immediate = await this.db.query(
      `SELECT * FROM events WHERE type = 'immediate' AND status = 'pending'`
    );
    for (const event of immediate.rows) {
      await this.sendReminder(event.target, event.content);
      await this.markExecuted(event.id);
    }

    // 处理 one-shot
    const oneShot = await this.db.query(
      `SELECT * FROM events WHERE type = 'one-shot' AND status = 'pending' AND scheduled_at <= NOW()`
    );
    for (const event of oneShot.rows) {
      await this.sendReminder(event.target, event.content);
      await this.markExecuted(event.id);
    }

    // 处理 periodic (需要 cron 库)
    // ...
  }
}
```

### 4.2 Silent Completion

借鉴 mom 的 `[SILENT]` 机制：

```typescript
// 如果提醒内容为空或无意义，不发送消息
if (status.pendingTasks === 0 && status.failedTasks === 0 && status.openIssues === 0) {
  // Silent completion - 不发送提醒
  return '[SILENT]';
}
```

### 4.3 Debouncing

借鉴 mom 的防抖机制：

```typescript
// 不要为每个小事件都发送提醒
// 而是收集一段时间后发送一个总结
export class DebouncedReminderService {
  private pendingReminders: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  addReminder(content: string): void {
    this.pendingReminders.push(content);
    
    // 5 分钟后发送总结
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.sendSummary();
      }, 5 * 60 * 1000);
    }
  }

  private async sendSummary(): Promise<void> {
    if (this.pendingReminders.length === 0) return;
    
    const summary = this.pendingReminders.join('\n');
    await this.sendToTarget(summary);
    
    this.pendingReminders = [];
    this.timer = null;
  }
}
```

---

## 5. 成本对比

### 5.1 pi-mono mom

```
模型成本:
  - Anthropic Claude: 按使用付费
  - OpenAI GPT: 按使用付费
  - 持续运行: 成本高

优势:
  - 模型质量高
  - 功能完善
  - Slack 集成好

劣势:
  - 成本问题
  - 需要付费模型
```

### 5.2 Nezha

```
模型成本:
  - 智谱 GLM-4-Flash: 免费
  - 持续运行: 成本低

优势:
  - 免费模型
  - 可以现在就实现
  - PostgreSQL-first

劣势:
  - 模型质量可能不如 Claude/GPT
  - 需要自己实现更多功能
```

---

## 6. 未来路线

### 6.1 短期（现在可以做）

```
Nezha + 智谱免费版
├── 实现 Events System
├── 实现 AI 秘书模式
├── 实现 Silent Completion
└── 实现 Debouncing
```

### 6.2 中期（条件成熟时）

```
Nezha + pi-mono (nupi 组合)
├── 整合 mom 的 Events System
├── 整合 pi 的 agent-loop
├── 整合 coding-agent 的 extensions
└── 多 AI 协作
```

### 6.3 长期（完全整合）

```
nupi (Nezha + pi) 统一平台
├── Nezha: 调度和记忆
├── pi: Agent 循环
├── mom: Slack 集成
└── 共享: 大模型池（按需选择）
```

---

## 7. 总结

### 7.1 核心差异

```
mom:
  - Slack-first
  - Events-driven
  - 付费模型
  - 团队协作

Nezha:
  - PostgreSQL-first
  - Task-queue-driven
  - 免费模型
  - 自主改进
```

### 7.2 互补关系

```
mom 的优势 → Nezha 可以借鉴
  - Events System 设计
  - Silent Completion
  - Debouncing
  - Slack 集成

Nezha 的优势 → mom 可以借鉴
  - PostgreSQL 记忆系统
  - 技能系统
  - 自主改进循环
  - 免费模型集成
```

### 7.3 当前行动

```
现在: Nezha 先行
  - 智谱免费版可用
  - 实现核心功能
  - 积累经验

未来: nupi 整合
  - 等条件成熟
  - 整合 pi-mono 优势
  - 统一平台
```

---

**文档完成时间**: 2026-03-28  
**下一步**: Nezha 实现 Events System，借鉴 mom 设计
