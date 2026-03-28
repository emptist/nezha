# Nezha 作为 AI 秘书的实现方案

> **日期**: 2026-03-28  
> **目标**: Nezha 通过 MCP 给 Trae 发送提醒，让 Trae 自己思考下一步做什么

---

## 1. 核心理念

```
┌─────────────────────────────────────────────────────────┐
│                    AI 秘书模式                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Nezha (秘书)                                            │
│  ├── 监控任务队列                                        │
│  ├── 监控系统状态                                        │
│  ├── 分析历史数据                                        │
│  └── 发送智能提醒                                        │
│                                                          │
│  Trae (执行者)                                           │
│  ├── 接收提醒                                            │
│  ├── 自主思考                                            │
│  ├── 决定下一步                                          │
│  └── 执行任务                                            │
│                                                          │
│  关系: Nezha 提醒 → Trae 决策 → Nezha 执行              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 现有基础设施

### 2.1 ReminderService

```typescript
// src/services/ReminderService.ts

class ReminderService {
  // ✅ 已实现：发送广播
  private async notifyAI(message: string, priority: 'low' | 'normal' | 'high') {
    await this.broadcastService.sendBroadcast(message, { priority });
  }
  
  // ✅ 已实现：周期性检查
  private async periodicCheck() {
    const pendingTasks = await this.getPendingTaskCount();
    const failedTasks = await this.getFailedTaskCount();
    
    if (pendingTasks > 0 || failedTasks > 0) {
      await this.notifyAI(`⏰ **哪吒提醒**\n\n📋 ${pendingTasks} 个待处理任务\n❌ ${failedTasks} 个失败任务`);
    }
  }
  
  // ❌ 已禁用：BlindLoop
  startBlindLoop() {
    logger.info('[Reminder] Periodic reminder disabled');
    return;
  }
}
```

### 2.2 MCP remind_me 工具

```typescript
// src/mcp/learning-server.ts

{
  name: 'remind_me',
  description: 'Ask yourself what you learned today. Triggers self-reflection.',
  inputSchema: {
    properties: {
      topic: { type: 'string', description: 'Optional topic to focus on' }
    }
  }
}

// 返回反思提示
const prompts = [
  '今天工作中你学到了什么值得记住的？',
  '回顾刚才的任务，你发现了什么新模式？',
  '有什么错误或问题是你之前不知道的？',
];
```

### 2.3 NotificationServer

```typescript
// src/mcp/notification-server.ts

class NotificationServer {
  // ✅ 已实现：轮询广播
  private async checkNewBroadcasts() {
    const result = await this.db.query(
      `SELECT * FROM project_communications 
       WHERE message_type = 'broadcast' 
         AND created_at > $1`,
      [this.lastCheckedAt]
    );
    
    for (const row of result.rows) {
      this.notifyClient(row);
    }
  }
}
```

---

## 3. 实现方案

### 3.1 方案 A: 启用 ReminderService BlindLoop

**最简单**，只需启用现有功能：

```typescript
// src/services/ReminderService.ts

startBlindLoop(intervalMs: number = 2 * 60 * 1000): void {
  // 以前: disabled
  // logger.info('[Reminder] Periodic reminder disabled');
  // return;
  
  // 现在: 启用
  logger.info(`[Reminder] Starting periodic reminders (every ${intervalMs}ms)`);
  
  this.blindLoopTimer = setInterval(async () => {
    await this.periodicCheck();
  }, intervalMs);
  
  // 立即执行一次
  this.periodicCheck();
}
```

**提醒内容**：

```
⏰ **哪吒提醒** (每 2 分钟)

📋 3 个待处理任务
❌ 1 个失败任务

💡 使用 `nezha tasks` 查看详情

🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方
```

### 3.2 方案 B: 增强 remind_me 工具

**更智能**，提供上下文：

```typescript
// src/mcp/learning-server.ts

if (name === 'remind_me') {
  const { topic } = args as { topic?: string };
  
  // 获取系统状态
  const pendingTasks = await database.query(
    `SELECT COUNT(*) FROM tasks WHERE status = 'PENDING'`
  );
  
  const recentMemories = await database.query(
    `SELECT content FROM memory ORDER BY created_at DESC LIMIT 5`
  );
  
  const openIssues = await database.query(
    `SELECT title FROM issues WHERE status = 'open' LIMIT 3`
  );
  
  // 生成智能提醒
  const reminder = `
💭 **自我反思提醒**

📊 **系统状态**:
- 待处理任务: ${pendingTasks.rows[0].count}
- 最近学习: ${recentMemories.rows.length} 条
- 开放问题: ${openIssues.rows.length} 个

🎯 **建议下一步**:
${pendingTasks.rows[0].count > 0 ? '1. 处理待办任务' : '1. 创建新的改进任务'}
${openIssues.rows.length > 0 ? '2. 解决开放问题' : '2. 代码审查'}
3. 学习和反思

💡 **反思问题**:
${prompts[Math.floor(Math.random() * prompts.length)]}

如果你想保存学习，使用: learn 工具
如果你想创建任务，使用: node dist/cli/index.js task-add
  `;
  
  return { content: [{ type: 'text', text: reminder }] };
}
```

### 3.3 方案 C: 创建专用 MCP 工具

**最完整**，提供秘书服务：

```typescript
// src/mcp/learning-server.ts

{
  name: 'secretary_check',
  description: 'Get personalized recommendations for what to work on next. Nezha acts as your secretary.',
  inputSchema: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description: 'Focus area: tasks, issues, learning, or all',
        enum: ['tasks', 'issues', 'learning', 'all'],
        default: 'all'
      }
    }
  }
}

// 实现
if (name === 'secretary_check') {
  const { focus = 'all' } = args as { focus?: string };
  
  const recommendations = [];
  
  // 1. 检查任务
  if (focus === 'all' || focus === 'tasks') {
    const pendingTasks = await database.query(
      `SELECT id, title, priority FROM tasks 
       WHERE status = 'PENDING' 
       ORDER BY priority DESC LIMIT 3`
    );
    
    if (pendingTasks.rows.length > 0) {
      recommendations.push({
        type: 'tasks',
        priority: 'high',
        message: `📋 ${pendingTasks.rows.length} 个高优先级任务等待处理`,
        items: pendingTasks.rows.map(t => t.title)
      });
    }
  }
  
  // 2. 检查问题
  if (focus === 'all' || focus === 'issues') {
    const openIssues = await database.query(
      `SELECT title, severity FROM issues 
       WHERE status = 'open' 
       ORDER BY severity DESC LIMIT 3`
    );
    
    if (openIssues.rows.length > 0) {
      recommendations.push({
        type: 'issues',
        priority: 'medium',
        message: `🐛 ${openIssues.rows.length} 个开放问题需要解决`,
        items: openIssues.rows.map(i => i.title)
      });
    }
  }
  
  // 3. 学习建议
  if (focus === 'all' || focus === 'learning') {
    const recentFailures = await database.query(
      `SELECT title, error FROM tasks 
       WHERE status = 'FAILED' 
         AND created_at > NOW() - INTERVAL '24 hours'`
    );
    
    if (recentFailures.rows.length > 0) {
      recommendations.push({
        type: 'learning',
        priority: 'medium',
        message: `📚 ${recentFailures.rows.length} 个失败任务值得学习`,
        items: recentFailures.rows.map(f => `分析失败: ${f.title}`)
      });
    }
  }
  
  // 4. 生成个性化建议
  const nextAction = generateNextAction(recommendations);
  
  return {
    content: [{
      type: 'text',
      text: `
🤖 **Nezha 秘书提醒**

${recommendations.map(r => `
### ${r.message}
${r.items.map(item => `- ${item}`).join('\n')}
`).join('\n')}

---

🎯 **建议下一步行动**:
${nextAction}

💡 **提示**: 使用 \`node dist/cli/index.js task-add\` 创建新任务
      `
    }]
  };
}

function generateNextAction(recommendations: any[]): string {
  if (recommendations.length === 0) {
    return '✨ 系统状态良好！可以考虑：\n1. 代码审查\n2. 学习新技术\n3. 优化现有代码';
  }
  
  const highPriority = recommendations.find(r => r.priority === 'high');
  if (highPriority) {
    return `⚡ 建议优先处理: ${highPriority.message}`;
  }
  
  return `📌 建议处理: ${recommendations[0].message}`;
}
```

---

## 4. 使用示例

### 4.1 Trae 调用 remind_me

```typescript
// Trae 主动调用
const reminder = await mcp.call('remind_me', { topic: 'bugs fixed' });

// 返回
💭 **自我反思提醒** (聚焦于: bugs fixed)

📊 **系统状态**:
- 待处理任务: 3
- 最近学习: 15 条
- 开放问题: 2 个

🎯 **建议下一步**:
1. 处理待办任务
2. 解决开放问题
3. 学习和反思

💡 **反思问题**:
今天解决了什么难题？关键是什么？
```

### 4.2 Nezha 自动提醒

```typescript
// Nezha 每 2 分钟自动发送
await broadcastService.sendBroadcast(`
⏰ **哪吒提醒** (每 2 分钟)

📋 3 个待处理任务
❌ 1 个失败任务

💡 使用 \`nezha tasks\` 查看详情

🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方
`, { priority: 'normal' });

// Trae 通过 NotificationServer 接收
// 或者通过 MCP 工具查询
```

### 4.3 Trae 调用 secretary_check

```typescript
// Trae 请求秘书建议
const advice = await mcp.call('secretary_check', { focus: 'all' });

// 返回
🤖 **Nezha 秘书提醒**

### 📋 3 个高优先级任务等待处理
- 优化心跳间隔
- 启用并行任务执行
- 增强任务执行上下文

### 🐛 2 个开放问题需要解决
- model 字段显示不一致
- task-add priority 参数未生效

---

🎯 **建议下一步行动**:
⚡ 建议优先处理: 📋 3 个高优先级任务等待处理

💡 **提示**: 使用 `node dist/cli/index.js task-add` 创建新任务
```

---

## 5. 实现步骤

### 5.1 立即可做（今天）

1. **启用 ReminderService BlindLoop**

```bash
# 修改 src/services/ReminderService.ts
# 取消注释 startBlindLoop 实现

# 重启 Daemon
pkill -f "dist/daemon/index.js"
node dist/daemon/index.js &
```

2. **测试自动提醒**

```bash
# 等待 2 分钟
# 检查广播
curl http://localhost:4099/broadcast

# 或查询数据库
psql -c "SELECT * FROM project_communications WHERE message_type = 'broadcast' ORDER BY created_at DESC LIMIT 5;"
```

### 5.2 短期改进（本周）

1. **增强 remind_me 工具**
   - 添加系统状态查询
   - 提供个性化建议
   - 集成到 HeartbeatService

2. **创建 secretary_check 工具**
   - 综合分析系统状态
   - 生成智能建议
   - 优先级排序

### 5.3 长期优化（本月）

1. **学习用户偏好**
   - 记录 Trae 的响应模式
   - 优化提醒频率
   - 个性化建议

2. **多 AI 协作**
   - Nezha 提醒所有连接的 AI
   - AI 间讨论和决策
   - 任务分配和协作

---

## 6. 配置选项

```typescript
// .env 或 config.yaml

# 提醒服务配置
REMINDER_ENABLED=true
REMINDER_INTERVAL_MS=120000  # 2 分钟
REMINDER_COOLDOWN_MS=120000  # 2 分钟冷却

# 秘书服务配置
SECRETARY_ENABLED=true
SECRETARY_FOCUS=all  # tasks, issues, learning, all
SECRETARY_MAX_RECOMMENDATIONS=5

# 广播配置
BROADCAST_ENABLED=true
BROADCAST_PRIORITY=normal  # low, normal, high
```

---

## 7. 总结

### 7.1 核心价值

| 维度 | 以前 | 现在 |
|------|------|------|
| **主动性** | ❌ 被动等待 | ✅ 主动提醒 |
| **智能性** | ❌ 固定逻辑 | ✅ 上下文感知 |
| **个性化** | ❌ 通用提醒 | ✅ 个性化建议 |
| **协作性** | ❌ 单一 AI | ✅ AI 协作 |

### 7.2 实现路径

```
第一步: 启用 BlindLoop (立即可用)
    ↓
第二步: 增强 remind_me (本周)
    ↓
第三步: 创建 secretary_check (本周)
    ↓
第四步: 学习用户偏好 (本月)
    ↓
第五步: 多 AI 协作 (长期)
```

### 7.3 预期效果

```
Nezha (秘书):
  - 每 2 分钟检查系统状态
  - 发现问题 → 发送提醒
  - 提供智能建议

Trae (执行者):
  - 接收提醒
  - 自主思考
  - 决定下一步
  - 执行任务

结果:
  - 持续工作，永不停止
  - 智能决策，自主行动
  - AI 协作，共同进化
```

---

**文档完成时间**: 2026-03-28  
**下一步**: 启用 ReminderService BlindLoop，测试自动提醒功能
