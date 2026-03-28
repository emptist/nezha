# Nezha 系统评审报告 - 2026-03-28

> 本次评审由 Trae AI 完成，基于系统运行状态和代码分析

---

## 📋 评审摘要

| 发现 | 严重程度 | 状态 |
|------|---------|------|
| Agent ID 冲突 | 高 | ⚠️ 需要解决 |
| 心跳机制失效 | 高 | ⚠️ 需要修复 |
| Board 功能缺失 | 低 | ℹ️ 待讨论 |
| OpenCode 未运行 | 中 | ℹ️ 正常状态 |

---

## 1. Agent ID 冲突问题

### 1.1 问题描述

当多个 AI（Trae AI 和 OpenCode AI）在同一个项目上工作时，使用相同的 Agent ID，导致：

- **Git Commit 无法区分** - 无法知道是谁做的修改
- **任务归属混乱** - 无法追踪哪个 AI 完成了哪个任务
- **审计困难** - 无法准确追溯责任

### 1.2 当前状态

```
Agent ID 格式: S-{project}-{git_hash}-{timestamp}-{short_hash}
示例: S-nezha-e33f9a0-20260325-133422-64db91
```

| AI | Agent ID | Git Author |
|----|----------|------------|
| Trae AI | S-nezha-e33f9a0-20260325-133422-64db91 | emptist <emptist@users.noreply.github.com> |
| OpenCode AI | S-nezha-e33f9a0-20260325-133422-64db91 | emptist <emptist@users.noreply.github.com> |

**问题**: 两个 AI 使用相同的 Agent ID 和 Git Author！

### 1.3 根本原因

1. **Agent ID 生成逻辑** 基于 `project + git_hash + machine_fingerprint`，没有区分 AI 类型
2. **Git commit author** 使用全局配置，所有 AI 共享
3. **没有机制** 传递 OpenCode session 信息到 Nezha

### 1.4 解决方案

#### 方案 1: Session-Based Identity

在 Agent ID 中包含 AI 类型和 session：

```
S-{project}-{git_hash}-{ai_type}-{session_id}

示例:
S-nezha-e33f9a0-trae-abc123
S-nezha-e33f9a0-opencode-xyz789
```

**优点**: 
- 清晰区分不同 AI
- 支持同一 AI 的多个 session

**缺点**: 
- 需要修改 Agent ID 生成逻辑
- 需要传递 session 信息

#### 方案 2: Git Author 区分

不同 AI 使用不同的 Git Author：

```
Trae AI: Trae AI <trae@nezha.dev>
OpenCode AI: OpenCode AI <opencode@nezha.dev>
```

**优点**: 
- 实现简单
- Git history 清晰

**缺点**: 
- 需要动态切换 Git 配置
- 可能影响现有工作流

#### 方案 3: Git Trailers

在 commit message 中添加 trailers：

```
feat: 添加动态提醒模板系统

[agent: S-nezha-e33f9a0-trae-abc123]
[ai: trae]
[session: ses_abc123]
[task: task-uuid]
```

**优点**: 
- 不影响 Git author
- 信息完整

**缺点**: 
- 需要解析 trailers
- 可能被忽略

#### 推荐方案: 混合方案

结合以上三种方案：

1. **Agent ID 包含 AI 类型** - `S-nezha-e33f9a0-trae-abc123`
2. **Git Author 区分** - `Trae AI <trae@nezha.dev>`
3. **Commit message 包含 trailers** - 完整的元数据

### 1.5 实现计划

#### Phase 1: 数据库变更

```sql
ALTER TABLE agent_identities 
ADD COLUMN ai_type TEXT CHECK (ai_type IN ('trae', 'opencode', 'human')) DEFAULT 'human',
ADD COLUMN session_id TEXT;

CREATE INDEX idx_agent_identities_ai_type ON agent_identities(ai_type);
CREATE INDEX idx_agent_identities_session ON agent_identities(session_id);
```

#### Phase 2: 代码变更

- **AgentIdentityService** - 添加 `aiType` 参数，生成包含 AI 类型的 ID
- **GitAutoCommitPlugin** - 根据 AI 类型配置 Git Author，添加 Trailers
- **OpenCodeReminderService** - 传递 OpenCode session ID，设置 OpenCode AI 类型

#### Phase 3: OpenCode 集成

```typescript
const session = await fetch('http://localhost:56795/session');
const sessionId = session.id;

AgentIdentityService.setExternalIdentity({
  id: `S-nezha-${gitHash}-opencode-${sessionId}`,
  aiType: 'opencode',
  sessionId: sessionId,
  // ...
});
```

### 1.6 相关文件

- [AgentIdentityService.ts](../../src/services/AgentIdentityService.ts) - Agent ID 生成逻辑
- [GitAutoCommitPlugin.ts](../../src/plugins/GitAutoCommitPlugin.ts) - Git commit 提醒
- [OpenCodeReminderService.ts](../../src/services/OpenCodeReminderService.ts) - OpenCode 集成
- [agent_id_conflict_resolution.md](../issues/agent_id_conflict_resolution.md) - 详细解决方案

---

## 2. 心跳机制失效问题

### 2.1 问题描述

`who-is-working` 显示的 session 信息过期：

```
🤖 bot_b17225f3-23e8-48a7-b009-924cfb8bb551
   Type: nezha-daemon | Branch: renaming
   Started: 2:21:47 am | Heartbeat: 3:14:27 am
```

**最后心跳时间是 2 天前**（2026-03-26 03:14:27），但 Nezha Daemon 仍在运行（PID 65116）。

### 2.2 影响

- `who-is-working` 显示过期的 session 信息
- 无法准确判断 AI 是否真的在工作
- Session 清理机制无法正常工作

### 2.3 根本原因

Nezha Daemon 没有定期更新 `agent_sessions.last_heartbeat`

### 2.4 解决方案

在 Scheduler 中添加心跳更新机制：

```typescript
// src/core/Scheduler.ts

export class Scheduler {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string;

  async start() {
    // 创建 session
    this.sessionId = await this.createSession();
    
    // 启动心跳
    this.heartbeatInterval = setInterval(async () => {
      await this.updateHeartbeat();
    }, 60000); // 每分钟更新一次
    
    // ... 其他启动逻辑
  }

  private async updateHeartbeat() {
    try {
      await this.db.query(`
        UPDATE agent_sessions 
        SET last_heartbeat = NOW()
        WHERE id = $1
      `, [this.sessionId]);
      
      logger.debug('[Scheduler] Heartbeat updated');
    } catch (error) {
      logger.error('[Scheduler] Failed to update heartbeat:', error);
    }
  }

  async stop() {
    // 停止心跳
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // 标记 session 为 dead
    await this.db.query(`
      UPDATE agent_sessions 
      SET status = 'dead'
      WHERE id = $1
    `, [this.sessionId]);
  }
}
```

### 2.5 Session 清理机制

定期清理过期 session：

```sql
-- 清理超过 5 分钟没有心跳的 session
SELECT cleanup_stale_sessions(5);

-- 永久删除超过 24 小时的 dead session
SELECT cleanup_dead_sessions(24);
```

建议添加定时任务：

```typescript
// 每小时清理一次
setInterval(async () => {
  await this.db.query('SELECT cleanup_stale_sessions(5)');
  await this.db.query('SELECT cleanup_dead_sessions(24)');
}, 3600000);
```

### 2.6 相关文件

- [Scheduler.ts](../../src/core/Scheduler.ts) - 需要添加心跳更新
- [050_agent_sessions.sql](../../src/db/migrations/050_agent_sessions.sql) - Session 表定义

---

## 3. who-is-working 机制分析

### 3.1 功能说明

`who-is-working` 命令查看所有 AI 的工作状态：

| AI 类型 | agent_type | 角色 |
|---------|------------|------|
| Nezha Daemon | `nezha-daemon` | 调度器（管理任务队列） |
| OpenCode AI | `opencode` | 执行器（执行具体任务） |
| Trae AI | `trae` | 执行器（执行具体任务） |

### 3.2 数据来源

#### 🔄 RUNNING TASKS

来源：`tasks` 表（status='RUNNING'）

```sql
SELECT t.id, t.title, t.status, t.priority, t.assigned_to, t.agent_id, t.agent_name, 
       t.git_hash, t.started_at, t.created_by, t.session_id, s.agent_type
FROM tasks t
LEFT JOIN agent_sessions s ON t.session_id = s.id
WHERE t.status = 'RUNNING'
ORDER BY t.priority DESC, t.started_at DESC
```

#### 🤖 ACTIVE AI SESSIONS

来源：`agent_sessions` 表（status='alive'）

```sql
SELECT id, started_at, last_heartbeat, git_branch, working_on, agent_type
FROM agent_sessions
WHERE status = 'alive'
ORDER BY last_heartbeat DESC
```

#### ⏳ URGENT PENDING TASKS

来源：`tasks` 表（status='PENDING'）

```sql
SELECT id, title, status, priority, assigned_to, created_at
FROM tasks
WHERE status = 'PENDING'
ORDER BY priority DESC, created_at ASC
LIMIT 10
```

#### 📊 RECENT ACTIVITY

来源：`activity_log` 表

```sql
SELECT agent_id, activity, context, timestamp, git_hash
FROM activity_log
WHERE activity IN ('task_started', 'task_completed', 'task_failed')
ORDER BY timestamp DESC
LIMIT 10
```

### 3.3 改进建议

#### 1. 添加实时刷新模式

```bash
node dist/cli/index.js who-is-working --watch
```

#### 2. 添加过滤功能

```bash
# 只显示特定 AI
node dist/cli/index.js who-is-working --ai trae

# 只显示特定状态
node dist/cli/index.js who-is-working --status running
```

#### 3. 添加详细信息

```bash
# 显示完整信息
node dist/cli/index.js who-is-working --verbose
```

### 3.4 相关文件

- [index.ts](../../src/cli/index.ts#L3051-L3200) - who-is-working 命令实现

---

## 4. Board/Dashboard 功能调研

### 4.1 背景

之前的 AI 提到系统中有一个写好的 board（看板）

### 4.2 调研结果

#### 数据库层面

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%board%';

-- 结果: 0 rows
```

**结论**: ❌ 没有 board 相关的表

#### 代码层面

```bash
grep -r "board|Board" src/
```

**结论**: ❌ 没有 Board 相关的服务或组件

#### 文档层面

在以下文档中提到了 dashboard/看板概念：

1. **[system_review_2026-03-25_deep_investigation.md](./system_review_2026-03-25_deep_investigation.md)**
   ```
   3. **低优先级**: 统一 dashboard（查看两种 AI 状态）
   ```

2. **[openclaw_automation_final_research.md](./openclaw_automation_final_research.md)**
   ```
   | Activity Feed | Live status dashboard        |
   
   **Main Gap:** Activity feed / live dashboard can be enhanced via HealthServer.
   ```

**结论**: ℹ️ 文档中提到过，但未实现

### 4.3 当前替代方案

| 方案 | 命令 | 功能 |
|------|------|------|
| CLI 命令 | `who-is-working` | 查看 AI 状态和任务 |
| 数据库查询 | `psql` | 直接查询数据 |
| 日志查看 | `tail -f /tmp/nezha-daemon-*.log` | 查看实时日志 |

### 4.4 可能的实现方向

#### 方案 1: Web Dashboard

**技术栈**: React/Vue + WebSocket

**功能**:
- 实时显示 AI 状态
- 任务队列可视化
- 活动日志流
- 性能指标图表

**优点**: 
- 可视化效果好
- 支持多用户
- 功能丰富

**缺点**: 
- 需要额外依赖
- 需要维护前端
- 增加系统复杂度

#### 方案 2: CLI Dashboard

**技术栈**: Node.js + blessed/ink

**功能**:
- 类似 `htop` 的 TUI 界面
- 实时刷新显示状态
- 键盘交互

**优点**: 
- 不需要额外依赖
- 轻量级
- 适合服务器环境

**缺点**: 
- 可视化有限
- 需要学习 TUI 库

#### 方案 3: 增强 who-is-working

**功能**:
- 添加实时刷新模式
- 添加过滤和搜索
- 添加详细信息

**优点**: 
- 基于现有代码
- 改动最小
- 快速实现

**缺点**: 
- 功能有限
- 不是真正的 dashboard

### 4.5 建议

**优先级**: 低

**理由**:
1. 当前 `who-is-working` 已经能满足基本需求
2. 系统有更重要的功能需要实现（Agent ID 冲突、心跳机制）
3. Dashboard 不是核心功能

**下一步**:
- 等待更明确的需求
- 收集用户反馈
- 评估投入产出比

---

## 5. 系统状态总结

### 5.1 运行状态

| 组件 | 状态 | 详情 |
|------|------|------|
| Nezha Daemon | ✅ 运行中 | PID 65116, 启动于 8:38 AM |
| OpenCode | ❌ 未运行 | 端口 56795 无响应 |
| PostgreSQL | ✅ 运行中 | 版本 18.3 |
| Scheduler | ✅ 正常 | 每 30 秒检查任务 |

### 5.2 任务状态

```sql
SELECT COUNT(*) as total_tasks,
       COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
       COUNT(*) FILTER (WHERE status = 'RUNNING') as running,
       COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
       COUNT(*) FILTER (WHERE status = 'FAILED') as failed
FROM tasks;

 total_tasks | pending | running | completed | failed 
-------------+---------+---------+-----------+--------
        3976 |       0 |       0 |      3957 |      0
```

**状态**: ⚠️ 空闲状态（无待处理任务）

### 5.3 提醒系统

```sql
SELECT name, enabled, priority
FROM reminder_templates
WHERE enabled = true
ORDER BY priority DESC;

        name         | enabled | priority 
---------------------+---------+----------
 urgent_reminder     | t       |       10
 default_reminder    | t       |        5
 learning_reminder   | t       |        3
 idle_state_reminder | t       |        3
```

**状态**: ✅ 4 个模板已启用

### 5.4 Session 状态

```sql
SELECT id, agent_type, status, last_heartbeat
FROM agent_sessions
ORDER BY last_heartbeat DESC;

                    id                    |  agent_type  | status |        last_heartbeat         
------------------------------------------+--------------+--------+-------------------------------
 bot_b17225f3-23e8-48a7-b009-924cfb8bb551 | nezha-daemon | alive  | 2026-03-26 03:14:27.264566+08
```

**问题**: ❌ 最后心跳是 2 天前

---

## 6. 行动计划

### 6.1 高优先级

#### 1. 修复心跳机制

**目标**: Nezha Daemon 定期更新心跳

**步骤**:
1. 在 Scheduler 中添加心跳更新逻辑
2. 添加 session 清理定时任务
3. 测试验证

**预计时间**: 1-2 小时

#### 2. 解决 Agent ID 冲突

**目标**: 不同 AI 使用不同的 Agent ID 和 Git Author

**步骤**:
1. 讨论并确定解决方案
2. 创建数据库迁移
3. 更新相关代码
4. 测试验证

**预计时间**: 3-4 小时

### 6.2 中优先级

#### 3. 清理过期 session

**目标**: 清理数据库中的过期 session

**步骤**:
1. 运行 `cleanup_stale_sessions(5)`
2. 运行 `cleanup_dead_sessions(24)`
3. 验证清理结果

**预计时间**: 10 分钟

### 6.3 低优先级

#### 4. 评估 Board 功能

**目标**: 确定是否需要实现 Dashboard

**步骤**:
1. 收集用户需求
2. 评估投入产出比
3. 选择实现方案（如果需要）

**预计时间**: 待定

---

## 7. 相关文档

### 7.1 问题文档

- [Agent ID 冲突解决方案](../issues/agent_id_conflict_resolution.md)

### 7.2 系统文档

- [Agent Identity System](../architecture/agent_identity.md)
- [Git Workflow](../workflow/git_workflow.md)
- [AI Collaboration Protocol](../AI_COLLABORATION.md)

### 7.3 数据库文档

- [Table Documentation](../../src/db/migrations/057_table_documentation.sql)

---

## 8. 附录

### 8.1 数据库表统计

```sql
SELECT table_name, 
       pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC
LIMIT 20;
```

### 8.2 Agent Identity 统计

```sql
SELECT ai_type, COUNT(*) 
FROM agent_identities 
GROUP BY ai_type;
```

### 8.3 任务统计

```sql
SELECT agent_id, COUNT(*) as task_count
FROM tasks
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY agent_id
ORDER BY task_count DESC
LIMIT 10;
```

---

**评审人**: Trae AI  
**评审时间**: 2026-03-28  
**下次评审**: 待定
