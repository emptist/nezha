# OpenCode 提醒系统

> Nezha 的 AI 秘书模式 - 主动提醒 AI 持续改进项目

---

## 系统概述

**核心原则**: NEVER DECLARE DONE - 系统永远不应该停止改进

**架构层级**: 集成层服务（`@layer integration`）

**服务文件**: `src/services/OpenCodeReminderService.ts`

**数据库表**: `reminder_templates`

---

## 工作流程

```
┌─────────────────────────────────────────────────────────┐
│              Nezha Daemon (每 2 分钟)                    │
│                                                          │
│  1. collectSystemStatus()                                │
│     ↓                                                    │
│  2. 从 PostgreSQL 读取系统状态                            │
│     - pending tasks                                      │
│     - failed tasks                                       │
│     - open issues                                        │
│     - recent memories                                    │
│     - critical tasks                                     │
│     ↓                                                    │
│  3. selectBestTemplate()                                 │
│     ↓                                                    │
│  4. 从数据库读取提醒模板                                  │
│     - urgent_reminder                                    │
│     - learning_reminder                                  │
│     - idle_state_reminder                                │
│     - default_reminder                                   │
│     ↓                                                    │
│  5. renderTemplate()                                     │
│     ↓                                                    │
│  6. sendMessage() → OpenCode Server                      │
│     ↓                                                    │
│  7. OpenCode AI 接收提醒，自主决策                        │
└─────────────────────────────────────────────────────────┘
```

---

## 系统状态收集

### 数据来源：PostgreSQL 数据库

| 数据项 | SQL 查询 | 说明 |
|--------|----------|------|
| **待处理任务** | `SELECT COUNT(*) FROM tasks WHERE status = 'PENDING'` | 当前待处理任务数量 |
| **失败任务** | `SELECT COUNT(*) FROM tasks WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'` | 24小时内失败任务 |
| **开放问题** | `SELECT COUNT(*) FROM issues WHERE status = 'open'` | 未解决的 Issue |
| **新学习** | `SELECT COUNT(*) FROM memory WHERE created_at > NOW() - INTERVAL '24 hours'` | 24小时内新学习 |
| **总学习** | `SELECT COUNT(*) FROM memory` | 知识库总量 |
| **高优先级任务** | `SELECT title, priority FROM tasks WHERE status = 'PENDING' AND priority >= 8 ORDER BY priority DESC LIMIT 5` | 优先级 >= 8 的任务 |
| **最近学习内容** | `SELECT content, tags FROM memory WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY importance DESC LIMIT 5` | 最重要的学习内容 |

### 代码实现

```typescript
private async collectSystemStatus(): Promise<SystemStatus> {
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

  const totalMemories = await this.db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory`
  );

  const criticalTasks = await this.db.query<{ title: string; priority: number }>(
    `SELECT title, priority FROM tasks WHERE status = 'PENDING' AND priority >= 8 ORDER BY priority DESC LIMIT 5`
  );

  const recentLearnings = await this.db.query<{ content: string; tags: string[] }>(
    `SELECT content, tags FROM memory WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY importance DESC LIMIT 5`
  );

  return {
    pendingTasks: parseInt(pendingTasks.rows[0]?.count || '0', 10),
    failedTasks: parseInt(failedTasks.rows[0]?.count || '0', 10),
    openIssues: parseInt(openIssues.rows[0]?.count || '0', 10),
    recentMemories: parseInt(recentMemories.rows[0]?.count || '0', 10),
    hasIssues: pending > 0 || failed > 0 || issues > 0,
    criticalTasks: criticalTasks.rows,
    recentLearnings: recentLearnings.rows.map(r => ({
      content: r.content,
      tags: r.tags || []
    })),
    totalMemories: parseInt(totalMemories.rows[0]?.count || '0', 10),
  };
}
```

---

## 模板选择逻辑

### 智能选择算法

```typescript
async selectBestTemplate(status: SystemStatus): Promise<ReminderTemplate> {
  // 1. 紧急情况：失败任务或大量开放问题
  if (status.failedTasks > 0 || (status.openIssues > 0 && status.openIssues > 5)) {
    const urgent = await this.getTemplate('urgent_reminder');
    if (urgent) return urgent;
  }

  // 2. 学习模式：有大量新学习且无待处理任务
  if (status.recentMemories > 5 && status.pendingTasks === 0) {
    const learning = await this.getTemplate('learning_reminder');
    if (learning) return learning;
  }

  // 3. 空闲状态：系统完全空闲
  if (status.pendingTasks === 0 && status.failedTasks === 0 && status.openIssues === 0) {
    const idle = await this.getTemplate('idle_state_reminder');
    if (idle) return idle;
  }

  // 4. 默认模板：有任务但不紧急
  const defaultTemplate = await this.getTemplate('default_reminder');
  if (!defaultTemplate) {
    throw new Error('No default reminder template found');
  }
  return defaultTemplate;
}
```

### 选择优先级

| 优先级 | 模板名称 | 触发条件 | 优先级值 |
|--------|----------|----------|----------|
| 1 | urgent_reminder | failedTasks > 0 OR openIssues > 5 | 10 |
| 2 | learning_reminder | recentMemories > 5 AND pendingTasks === 0 | 3 |
| 3 | idle_state_reminder | 所有计数为 0 | 3 |
| 4 | default_reminder | 有任务但不紧急 | 5 |

---

## 四种提醒模板

### 1. 默认提醒（default_reminder）

**触发条件**: 有任务或问题，但不紧急

**优先级**: 5

**模板内容**:

```markdown
🤖 **Nezha 秘书提醒**

📊 **系统状态**:
{{#if pendingTasks}}- 📋 {{pendingTasks}} 个待处理任务{{/if}}
{{#if failedTasks}}- ❌ {{failedTasks}} 个失败任务{{/if}}
{{#if openIssues}}- 🐛 {{openIssues}} 个开放问题{{/if}}
{{#if recentMemories}}- 📚 {{recentMemories}} 条新学习{{/if}}

🎯 **建议下一步行动**:
{{#if pendingTasks}}1. 处理待办任务 (使用 `nezha tasks` 查看){{/if}}
{{#if failedTasks}}2. 分析失败任务 (使用 `nezha failed` 查看){{/if}}
{{#if openIssues}}3. 解决开放问题 (使用 `nezha issues` 查看){{/if}}
{{#unless hasIssues}}✨ 系统状态良好！可以考虑：
- 代码审查
- 学习新技术
- 优化现有代码{{/unless}}

🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方

💡 **提示**: 自主决策，不要等待人类指示
```

**渲染示例**:

```markdown
🤖 **Nezha 秘书提醒**

📊 **系统状态**:
- 📋 5 个待处理任务
- ❌ 2 个失败任务
- 🐛 3 个开放问题
- 📚 10 条新学习

🎯 **建议下一步行动**:
1. 处理待办任务 (使用 `nezha tasks` 查看)
2. 分析失败任务 (使用 `nezha failed` 查看)
3. 解决开放问题 (使用 `nezha issues` 查看)

🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方

💡 **提示**: 自主决策，不要等待人类指示
```

---

### 2. 紧急提醒（urgent_reminder）

**触发条件**: 有失败任务或开放问题 > 5

**优先级**: 10（最高）

**模板内容**:

```markdown
🚨 **紧急提醒**

⚠️ **发现严重问题**:
{{#if failedTasks}}- ❌ {{failedTasks}} 个失败任务需要立即处理{{/if}}
{{#if openIssues}}- 🐛 {{openIssues}} 个开放问题需要解决{{/if}}

🔥 **优先级最高的任务**:
{{#each criticalTasks}}- {{this.title}} (优先级: {{this.priority}}){{/each}}

⚡ **立即行动**: 不要等待，马上处理！
```

**渲染示例**:

```markdown
🚨 **紧急提醒**

⚠️ **发现严重问题**:
- ❌ 3 个失败任务需要立即处理
- 🐛 8 个开放问题需要解决

🔥 **优先级最高的任务**:
- 修复数据库连接问题 (优先级: 9)
- 解决内存泄漏 (优先级: 8)

⚡ **立即行动**: 不要等待，马上处理！
```

---

### 3. 学习提醒（learning_reminder）

**触发条件**: 新学习 > 5 且无待处理任务

**优先级**: 3

**模板内容**:

```markdown
📚 **学习提醒**

🎓 **最近学习内容**:
{{#each recentLearnings}}- {{this.content}} ({{this.tags}}){{/each}}

💡 **建议下一步学习**:
{{#each suggestions}}- {{this}}{{/each}}

🧠 **知识积累**: 已学习 {{totalMemories}} 条知识
```

**渲染示例**:

```markdown
📚 **学习提醒**

🎓 **最近学习内容**:
- Nezha 和 OpenCode 的协作机制 (架构设计)
- 集成架构的核心原则 (最佳实践)
- Piano 子系统的设计理念 (系统设计)

💡 **建议下一步学习**:
- Review recent code changes
- Optimize slow queries
- Update documentation
- Run comprehensive tests

🧠 **知识积累**: 已学习 150 条知识
```

---

### 4. 空闲状态提醒（idle_state_reminder）

**触发条件**: 无任务、无问题、系统空闲

**优先级**: 3

**模板内容**:

```markdown
🤖 **Nezha 秘书提醒 - 空闲状态**

📊 **系统状态**:
- ✅ 无待处理任务
- ✅ 无失败任务
- ✅ 无开放问题
{{#if recentMemories}}- 📚 {{recentMemories}} 条新学习{{/if}}

🎯 **建议行动**:
根据 **NEVER DECLARE DONE** 原则，系统永远不应该停止改进！

**请自主决策下一步行动**:

1. **代码审查** - 审查最近的代码变更
   - 使用: `git log --oneline -10` 查看最近提交
   - 使用: `git diff HEAD~5` 查看最近变更

2. **持续改进** - 创建改进任务
   - 使用: `node dist/cli/index.js improve` 创建改进任务
   - 或手动创建: `node dist/cli/index.js task-add "改进标题" "详细描述" 优先级`

3. **学习与优化** - 提升系统质量
   - 检查测试覆盖率
   - 优化性能瓶颈
   - 更新文档

4. **监控与维护** - 确保系统健康
   - 检查日志: `tail -f /tmp/nezha-daemon-*.log`
   - 检查数据库: `node dist/cli/index.js db-stats`

💡 **AI 自治原则**:
- 不要等待人类指示
- 自主选择最有价值的行动
- 创建任务并执行
- 持续学习和改进

🔄 **记住**: 没有任务是暂时的，改进是永恒的！
```

---

## 数据库表结构

### reminder_templates 表

```sql
CREATE TABLE IF NOT EXISTS reminder_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| name | VARCHAR(100) | 模板名称（唯一） |
| description | TEXT | 模板描述 |
| template | TEXT | 模板内容（Handlebars 语法） |
| variables | JSONB | 变量定义 |
| priority | INTEGER | 优先级（1-10） |
| enabled | BOOLEAN | 是否启用 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 索引

```sql
CREATE INDEX IF NOT EXISTS idx_reminder_templates_enabled 
  ON reminder_templates(enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_reminder_templates_priority 
  ON reminder_templates(priority DESC);
```

---

## 容错机制

### 1. 数据库读取失败

**Fallback 消息**:

```typescript
private generateFallbackMessage(status: SystemStatus): string {
  const parts: string[] = [];

  parts.push('🤖 **Nezha 秘书提醒**\n');

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

  parts.push('\n🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方');
  parts.push('\n💡 **提示**: 自主决策，不要等待人类指示');

  return parts.join('\n');
}
```

### 2. OpenCode 连接失败

**错误处理**:

```typescript
try {
  await this.sendMessage(message);
} catch (error) {
  logger.error('[OpenCodeReminder] Failed to send message:', error);
  
  // 如果是 session 错误，重置 sessionId
  if (error instanceof Error && error.message.includes('session')) {
    this.sessionId = null;
  }
  
  // 不抛出错误，继续运行
}
```

---

## 配置参数

### OpenCodeReminderConfig

```typescript
export interface OpenCodeReminderConfig {
  opencodeUrl: string;           // OpenCode Server URL
  username?: string;              // 认证用户名
  password?: string;              // 认证密码
  reminderIntervalMs?: number;    // 提醒间隔（毫秒）
}
```

### 默认值

```typescript
{
  opencodeUrl: 'http://localhost:56795',
  username: process.env.OPENCODE_SERVER_USERNAME || 'opencode',
  password: process.env.OPENCODE_SERVER_PASSWORD || '',
  reminderIntervalMs: 2 * 60 * 1000,  // 2 分钟
}
```

### 环境变量

```bash
OPENCODE_SERVER_URL=http://localhost:56795
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=nezha-secret
```

---

## 使用示例

### 查看当前模板

```bash
# 查看所有提醒模板
psql -h 127.0.0.1 -U postgres -d nezha -c \
  "SELECT name, priority, enabled FROM reminder_templates ORDER BY priority DESC;"

# 查看具体模板内容
psql -h 127.0.0.1 -U postgres -d nezha -c \
  "SELECT template FROM reminder_templates WHERE name = 'default_reminder';"
```

### 更新模板

```sql
-- 更新默认模板
UPDATE reminder_templates 
SET template = '新的模板内容...'
WHERE name = 'default_reminder';

-- 禁用某个模板
UPDATE reminder_templates 
SET enabled = false 
WHERE name = 'learning_reminder';
```

### 添加新模板

```sql
INSERT INTO reminder_templates (name, description, template, variables, priority)
VALUES (
  'custom_reminder',
  '自定义提醒模板',
  '模板内容...',
  '{"variable1": "type"}',
  5
);
```

---

## 核心特点

### 1. 数据驱动

- ✅ 从 PostgreSQL 读取系统状态
- ✅ 从 PostgreSQL 读取提醒模板
- ✅ 支持动态更新模板
- ✅ 无需重启服务

### 2. 智能选择

- ✅ 根据系统状态自动选择最合适的模板
- ✅ 优先级机制（紧急 > 学习 > 默认）
- ✅ 空闲状态特殊处理
- ✅ 避免无意义的提醒

### 3. 容错机制

- ✅ 数据库读取失败时使用 fallback 消息
- ✅ 模板渲染失败时使用默认格式
- ✅ OpenCode 连接失败时记录日志但不崩溃
- ✅ 确保提醒系统始终可用

### 4. 自主决策

- ✅ 提醒 AI 自主决策下一步
- ✅ NEVER DECLARE DONE 原则
- ✅ 不等待人类指示
- ✅ 持续改进循环

---

## 架构原则

### 集成层服务

**@layer integration**

- 这是集成层服务，不是核心功能
- 失败不影响 Nezha 核心功能
- 可以替换为其他 AI 集成（Trae、Cursor 等）
- 参考：[INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md)

### 独立性保证

```typescript
// 在 Daemon 启动时的错误处理
try {
  const opencodeReminder = new OpenCodeReminderService(db, config);
  await opencodeReminder.start();
  logger.info('[Daemon] OpenCode reminder service started');
} catch (error) {
  // 失败不影响 Nezha 运行
  logger.warn('[Daemon] Failed to start OpenCode reminder service:', error);
  // 继续运行其他服务
}
```

---

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构设计文档
- [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md) - 集成架构原则
- [SERVICE_CATALOG.md](./SERVICE_CATALOG.md) - 服务目录
- [opencode_integration_complete_2026-03-28.md](./reviews/opencode_integration_complete_2026-03-28.md) - OpenCode 集成完成报告
- [opencode_secretary_mode_2026-03-28.md](./reviews/opencode_secretary_mode_2026-03-28.md) - OpenCode 秘书模式

---

## 总结

**OpenCode 提醒系统是 Nezha 的 AI 秘书模式的核心组件**：

- **数据来源**: PostgreSQL 数据库
- **状态收集**: 7 项系统状态指标
- **模板选择**: 智能选择 4 种模板
- **核心原则**: NEVER DECLARE DONE，自主决策
- **架构层级**: 集成层服务，可选部署
- **容错机制**: 多层 fallback，确保可用

**这是一个完整的 AI 秘书系统，能够根据系统状态智能提醒 AI 持续改进项目！**

---

**最后更新**: 2026-03-28
**维护者**: Nezha Team
