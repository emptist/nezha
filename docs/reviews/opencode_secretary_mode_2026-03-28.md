# Nezha 作为 OpenCode AI 秘书的实现方案

> **日期**: 2026-03-28  
> **目标**: Nezha 通过 OpenCode API 给 OpenCode AI 发送提醒，让大模型做大事，小模型做秘书

---

## 1. 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    AI 协作模式                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  OpenCode AI (大模型 - 做大事)                          │
│  ├── 复杂任务执行                                        │
│  ├── 代码编写                                            │
│  ├── 系统设计                                            │
│  └── 用户交互                                            │
│                                                          │
│  Nezha (小模型 - 做秘书)                                │
│  ├── 智谱 GLM-4-Flash (免费)                            │
│  ├── 监控系统状态                                        │
│  ├── 发送智能提醒                                        │
│  └── 管理任务队列                                        │
│                                                          │
│  通信方式:                                               │
│  1. OpenCode REST API (port 56795)                      │
│  2. PostgreSQL 广播表                                    │
│  3. MCP 工具                                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. OpenCode API 分析

### 2.1 OpenCode Server 状态

```bash
# OpenCode 运行在 port 56795
ps aux | grep opencode
# jk  77336  opencode-cli serve --hostname 127.0.0.1 --port 56795

# 健康检查需要认证
curl http://localhost:56795/health
# Unauthorized
```

### 2.2 OpenCode REST API

```typescript
// 创建会话
POST http://localhost:56795/session
Body: { "title": "nezha-reminder" }
Response: { "id": "session-uuid" }

// 发送消息
POST http://localhost:56795/session/{sessionId}/message
Body: {
  "parts": [{ "type": "text", "text": "提醒内容" }]
}
Response: {
  "parts": [{ "type": "text", "text": "AI 响应" }]
}

// 认证方式
Headers: {
  "Authorization": "Basic base64(username:password)"
}
```

### 2.3 认证配置

```bash
# .env
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=your_password_here
```

---

## 3. 实现方案

### 3.1 OpenCodeReminderService

```typescript
// src/services/OpenCodeReminderService.ts

import { logger } from '../utils/logger.js';
import { DatabaseClient } from '../db/DatabaseClient.js';

export interface OpenCodeReminderConfig {
  opencodeUrl: string;
  username?: string;
  password?: string;
  reminderIntervalMs?: number;
}

export class OpenCodeReminderService {
  private readonly db: DatabaseClient;
  private readonly config: OpenCodeReminderConfig;
  private sessionId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(db: DatabaseClient, config: OpenCodeReminderConfig) {
    this.db = db;
    this.config = {
      opencodeUrl: config.opencodeUrl || 'http://localhost:56795',
      username: config.username || process.env.OPENCODE_SERVER_USERNAME,
      password: config.password || process.env.OPENCODE_SERVER_PASSWORD,
      reminderIntervalMs: config.reminderIntervalMs || 2 * 60 * 1000, // 2 分钟
    };
  }

  async start(): Promise<void> {
    logger.info('[OpenCodeReminder] Starting service...');
    
    // 创建会话
    await this.createSession();
    
    // 启动定时提醒
    this.timer = setInterval(async () => {
      await this.sendReminder();
    }, this.config.reminderIntervalMs!);
    
    // 立即发送一次
    await this.sendReminder();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[OpenCodeReminder] Stopped');
  }

  private async createSession(): Promise<void> {
    try {
      const response = await fetch(`${this.config.opencodeUrl}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({ title: 'nezha-reminder-session' }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const data = await response.json() as { id: string };
      this.sessionId = data.id;
      logger.info(`[OpenCodeReminder] Created session: ${this.sessionId}`);
    } catch (error) {
      logger.error('[OpenCodeReminder] Failed to create session:', error);
    }
  }

  private async sendReminder(): Promise<void> {
    if (!this.sessionId) {
      await this.createSession();
      if (!this.sessionId) return;
    }

    // 收集系统状态
    const status = await this.collectSystemStatus();
    
    // 生成提醒消息
    const message = this.generateReminderMessage(status);
    
    // 发送到 OpenCode
    await this.sendMessage(message);
  }

  private async collectSystemStatus(): Promise<{
    pendingTasks: number;
    failedTasks: number;
    openIssues: number;
    recentMemories: number;
  }> {
    const pendingTasks = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
    );

    const failedTasks = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'`
    );

    const openIssues = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM issues WHERE status = 'open'`
    );

    const recentMemories = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM memory WHERE created_at > NOW() - INTERVAL '24 hours'`
    );

    return {
      pendingTasks: parseInt(pendingTasks.rows[0]?.count || '0', 10),
      failedTasks: parseInt(failedTasks.rows[0]?.count || '0', 10),
      openIssues: parseInt(openIssues.rows[0]?.count || '0', 10),
      recentMemories: parseInt(recentMemories.rows[0]?.count || '0', 10),
    };
  }

  private generateReminderMessage(status: {
    pendingTasks: number;
    failedTasks: number;
    openIssues: number;
    recentMemories: number;
  }): string {
    const parts: string[] = [];

    parts.push('🤖 **Nezha 秘书提醒**\n');

    // 系统状态
    parts.push('📊 **系统状态**:');
    if (status.pendingTasks > 0) {
      parts.push(`- 📋 ${status.pendingTasks} 个待处理任务`);
    }
    if (status.failedTasks > 0) {
      parts.push(`- ❌ ${status.failedTasks} 个失败任务`);
    }
    if (status.openIssues > 0) {
      parts.push(`- 🐛 ${status.openIssues} 个开放问题`);
    }
    if (status.recentMemories > 0) {
      parts.push(`- 📚 ${status.recentMemories} 条新学习`);
    }

    // 建议行动
    parts.push('\n🎯 **建议下一步行动**:');
    if (status.pendingTasks > 0) {
      parts.push('1. 处理待办任务 (使用 `nezha tasks` 查看)');
    }
    if (status.failedTasks > 0) {
      parts.push('2. 分析失败任务 (使用 `nezha failed` 查看)');
    }
    if (status.openIssues > 0) {
      parts.push('3. 解决开放问题 (使用 `nezha issues` 查看)');
    }
    if (status.pendingTasks === 0 && status.failedTasks === 0 && status.openIssues === 0) {
      parts.push('✨ 系统状态良好！可以考虑：');
      parts.push('- 代码审查');
      parts.push('- 学习新技术');
      parts.push('- 优化现有代码');
    }

    // NEVER DECLARE DONE 提醒
    parts.push('\n🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方');
    parts.push('\n💡 **提示**: 自主决策，不要等待人类指示');

    return parts.join('\n');
  }

  private async sendMessage(message: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.opencodeUrl}/session/${this.sessionId}/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeader(),
          },
          body: JSON.stringify({
            parts: [{ type: 'text', text: message }],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      logger.info('[OpenCodeReminder] Reminder sent successfully');
    } catch (error) {
      logger.error('[OpenCodeReminder] Failed to send message:', error);
      
      // 如果会话失效，重新创建
      if (error instanceof Error && error.message.includes('session')) {
        this.sessionId = null;
      }
    }
  }

  private getAuthHeader(): Record<string, string> {
    if (this.config.username && this.config.password) {
      const credentials = Buffer.from(
        `${this.config.username}:${this.config.password}`
      ).toString('base64');
      return { Authorization: `Basic ${credentials}` };
    }
    return {};
  }
}
```

### 3.2 集成到 Daemon

```typescript
// src/daemon/index.ts

import { OpenCodeReminderService } from '../services/OpenCodeReminderService.js';

async function main() {
  // ... 现有代码 ...
  
  // 启动 OpenCode 提醒服务
  const opencodeReminder = new OpenCodeReminderService(db, {
    opencodeUrl: process.env.OPENCODE_API_URL || 'http://localhost:56795',
    username: process.env.OPENCODE_SERVER_USERNAME,
    password: process.env.OPENCODE_SERVER_PASSWORD,
    reminderIntervalMs: 2 * 60 * 1000, // 2 分钟
  });
  
  await opencodeReminder.start();
  
  // ... 现有代码 ...
  
  // 关闭时停止提醒服务
  process.on('SIGINT', async () => {
    opencodeReminder.stop();
    // ... 其他清理 ...
  });
}
```

### 3.3 配置文件

```bash
# .env

# OpenCode Server 认证
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=your_secure_password_here

# OpenCode API URL
OPENCODE_API_URL=http://localhost:56795

# 提醒间隔
OPENCODE_REMINDER_INTERVAL_MS=120000  # 2 分钟
```

---

## 4. 使用示例

### 4.1 Nezha 自动提醒 OpenCode

```
OpenCode AI 正在工作...
    ↓
Nezha 每 2 分钟检查系统状态
    ↓
发现待处理任务
    ↓
发送提醒到 OpenCode
    ↓
🤖 **Nezha 秘书提醒**

📊 **系统状态**:
- 📋 3 个待处理任务
- ❌ 1 个失败任务
- 🐛 2 个开放问题

🎯 **建议下一步行动**:
1. 处理待办任务 (使用 `nezha tasks` 查看)
2. 分析失败任务 (使用 `nezha failed` 查看)
3. 解决开放问题 (使用 `nezha issues` 查看)

🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方

💡 **提示**: 自主决策，不要等待人类指示
```

### 4.2 OpenCode AI 响应

```
OpenCode AI 收到提醒
    ↓
自主决策下一步
    ↓
执行任务
    ↓
保存学习到 Nezha
    ↓
Nezha 记录并继续监控
```

---

## 5. 优势分析

### 5.1 大模型 + 小模型协作

| 角色 | 模型 | 任务 | 成本 |
|------|------|------|------|
| OpenCode | 外部大模型 | 复杂任务、代码编写 | 按使用付费 |
| Nezha | 智谱 GLM-4-Flash | 监控、提醒、管理 | 免费 |

### 5.2 分工明确

```
大模型 (OpenCode):
  ✅ 代码编写
  ✅ 系统设计
  ✅ 复杂推理
  ✅ 用户交互

小模型 (Nezha):
  ✅ 系统监控
  ✅ 状态提醒
  ✅ 任务调度
  ✅ 知识管理
```

### 5.3 成本优化

```
以前: 所有任务都用大模型
成本: 高

现在: 
  - 监控和提醒: 小模型 (免费)
  - 复杂任务: 大模型 (按需)
成本: 显著降低
```

---

## 6. 实现步骤

### 6.1 立即可做（今天）

1. **创建 OpenCodeReminderService**
   - 实现基本框架
   - 添加认证支持
   - 测试消息发送

2. **配置 OpenCode 认证**
   - 设置用户名和密码
   - 测试 API 访问

### 6.2 短期改进（本周）

1. **增强提醒内容**
   - 添加更多上下文
   - 智能优先级排序
   - 个性化建议

2. **集成到 Daemon**
   - 自动启动提醒服务
   - 错误处理和重试
   - 日志记录

### 6.3 长期优化（本月）

1. **学习 OpenCode 响应**
   - 记录 OpenCode 的响应模式
   - 优化提醒频率
   - 个性化内容

2. **多 AI 协作**
   - 支持 Trae 和 OpenCode 同时接收
   - AI 间讨论和决策
   - 任务分配

---

## 7. 测试计划

### 7.1 单元测试

```typescript
// src/tests/services/OpenCodeReminderService.test.ts

describe('OpenCodeReminderService', () => {
  it('should create session successfully', async () => {
    // ...
  });

  it('should send reminder message', async () => {
    // ...
  });

  it('should collect system status correctly', async () => {
    // ...
  });

  it('should handle authentication errors', async () => {
    // ...
  });
});
```

### 7.2 集成测试

```bash
# 1. 启动 OpenCode Server
opencode serve --port 56795

# 2. 启动 Nezha Daemon
node dist/daemon/index.js

# 3. 等待 2 分钟
# 4. 检查 OpenCode 是否收到提醒

# 或者手动测试
curl -X POST http://localhost:56795/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'opencode:password' | base64)" \
  -d '{"title": "test"}'
```

---

## 8. 总结

### 8.1 核心价值

```
大模型做大事:
  - 复杂任务执行
  - 代码编写
  - 系统设计

小模型做秘书:
  - 系统监控
  - 智能提醒
  - 任务管理

协作效果:
  - 成本优化
  - 效率提升
  - 持续工作
```

### 8.2 实现路径

```
第一步: 创建 OpenCodeReminderService (今天)
    ↓
第二步: 配置 OpenCode 认证 (今天)
    ↓
第三步: 集成到 Daemon (本周)
    ↓
第四步: 增强提醒内容 (本周)
    ↓
第五步: 学习和优化 (本月)
```

### 8.3 预期效果

```
Nezha (秘书):
  - 每 2 分钟检查系统状态
  - 发现问题 → 发送提醒
  - 提供智能建议

OpenCode (执行者):
  - 接收提醒
  - 自主决策
  - 执行任务
  - 保存学习

结果:
  - 大模型专注复杂任务
  - 小模型处理监控和提醒
  - 成本优化，效率提升
  - 持续工作，永不停止
```

---

**文档完成时间**: 2026-03-28  
**下一步**: 创建 OpenCodeReminderService，配置 OpenCode 认证
