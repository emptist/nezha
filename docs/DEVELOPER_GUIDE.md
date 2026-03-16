# Nezha 开发者指南

**目标**: 为开发者提供 Nezha 的完整使用指南

**创建时间**: 2026-03-16  
**状态**: 完整指南

---

## 📋 目录

1. [架构概览](#架构概览)
2. [双模式架构](#双模式架构)
3. [文件模式使用](#文件模式使用)
4. [数据库模式使用](#数据库模式使用)
5. [最佳实践](#最佳实践)
6. [常见问题](#常见问题)

---

## 架构概览

Nezha 是一个 AI 驱动的自主开发系统，支持两种任务管理模式：

```
┌─────────────────────────────────────────────────────────┐
│                    Nezha Core                            │
│                                                          │
│  ┌─────────────────┐      ┌─────────────────┐          │
│  │   文件模式       │      │   数据库模式     │          │
│  │  (HEARTBEAT.md) │      │  (PostgreSQL)   │          │
│  └─────────────────┘      └─────────────────┘          │
│         ↓                          ↓                    │
│  ┌─────────────────┐      ┌─────────────────┐          │
│  │  Nezha 自身项目  │      │   其他项目       │          │
│  │  单一项目开发    │      │   多项目管理     │          │
│  └─────────────────┘      └─────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

---

## 双模式架构

### 为什么有两种模式？

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| **Nezha 自身开发** | 文件模式 | 简单直接，Git 版本控制 |
| **其他项目管理** | 数据库模式 | 多项目，多 AI 协作 |
| **单一项目快速迭代** | 文件模式 | 无需数据库配置 |
| **跨项目协调** | 数据库模式 | 集中管理，统一查询 |

### 模式选择决策树

```
开始
  ↓
是 Nezha 自身项目？
  ├─ 是 → 文件模式
  └─ 否 → 需要管理多个项目？
           ├─ 是 → 数据库模式
           └─ 否 → 需要多 AI 协作？
                    ├─ 是 → 数据库模式
                    └─ 否 → 文件模式
```

---

## 文件模式使用

### 适用场景

- ✅ Nezha 自身的开发和维护
- ✅ 单一项目的快速迭代
- ✅ 不需要数据库的项目
- ✅ 简单的任务管理需求

### 创建 HEARTBEAT.md

在项目根目录创建 `HEARTBEAT.md` 文件：

```markdown
# Nezha Development Tasks

## High Priority (8-10)
- [ ] Fix critical bug in Scheduler
- [ ] Add unit tests for Agent
- [ ] Implement error handling for database connection

## Medium Priority (5-7)
- [ ] Improve error messages
- [ ] Update documentation
- [ ] Add logging system

## Low Priority (1-4)
- [ ] Refactor code structure
- [ ] Add code examples
- [ ] Improve performance

## Completed
- [x] Implement heartbeat mechanism
- [x] Add PostgreSQL support
- [x] Create CLI interface
```

### AI 工作流程

1. **读取任务**
   - AI 读取 `HEARTBEAT.md` 文件
   - 识别高优先级任务

2. **执行任务**
   - 选择最高优先级的任务
   - 实施改进
   - 运行测试

3. **更新状态**
   - 标记任务为已完成 `[x]`
   - 添加新任务（如果发现新问题）

4. **提交更改**
   ```bash
   git add HEARTBEAT.md
   git commit -m "docs: update task status"
   git push
   ```

### 最佳实践

1. **优先级清晰**
   - 高优先级：立即执行
   - 中优先级：正常执行
   - 低优先级：有时间时执行

2. **任务描述明确**
   ```markdown
   # 好的任务描述
   - [ ] Add type hints to Scheduler.ts
   - [ ] Fix memory leak in Agent.ts:123-145
   - [ ] Update README with installation instructions
   
   # 不好的任务描述
   - [ ] Fix bugs
   - [ ] Improve code
   - [ ] Update docs
   ```

3. **定期清理**
   - 移除已完成的任务
   - 更新任务优先级
   - 添加新发现的任务

---

## 数据库模式使用

### 适用场景

- ✅ 管理 Nezha 之外的其他项目
- ✅ 多项目并行开发
- ✅ 多 AI 协作
- ✅ 需要强大的查询和统计能力

### 数据库设置

#### 1. 创建数据库

```bash
# 连接到 PostgreSQL
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres

# 创建数据库
CREATE DATABASE nezha_projects;

# 连接到数据库
\c nezha_projects
```

#### 2. 运行迁移

```bash
# 运行初始迁移
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_projects \
  -f /Users/jk/gits/hub/nezha/src/db/migrations/001_initial.sql

# 运行多项目支持迁移
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_projects \
  -f /Users/jk/gits/hub/nezha/src/db/migrations/002_multi_project_support.sql
```

#### 3. 验证表创建

```sql
-- 查看所有表
\dt

-- 应该看到：
-- projects
-- tasks
-- memory
-- project_metrics
-- project_communications
-- project_config_history
```

### 注册项目

```sql
-- 注册项目
INSERT INTO projects (name, description, path, language, framework, config)
VALUES (
    'my-project',
    'My Project Description',
    '/path/to/project',
    'TypeScript',
    'Node.js',
    '{"qc": {"enabled": true}}'
);

-- 查看已注册的项目
SELECT id, name, path, language, status FROM projects;
```

### 添加任务

```sql
-- 添加任务
INSERT INTO tasks (title, description, status, priority, project_id)
VALUES (
    'Add type hints',
    'Add type hints to all TypeScript files',
    'PENDING',
    8,
    (SELECT id FROM projects WHERE name = 'my-project')
);

-- 查看项目的任务
SELECT t.id, t.title, t.status, t.priority, p.name as project
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.name = 'my-project';
```

### AI 通信

```sql
-- 发送消息
SELECT add_project_communication(
    (SELECT id FROM projects WHERE name = 'my-project'),
    'nezha-ai',
    'project-ai',
    'task',
    'Please review the code and add type hints',
    '{"priority": 8}'
);

-- 读取未读消息
SELECT * FROM get_unread_messages(
    (SELECT id FROM projects WHERE name = 'my-project')
);

-- 标记消息已读
SELECT mark_message_read('message-uuid-here');
```

### 项目统计

```sql
-- 查看项目统计
SELECT * FROM get_project_stats(
    (SELECT id FROM projects WHERE name = 'my-project')
);

-- 结果：
-- total_tasks | pending_tasks | completed_tasks | failed_tasks | avg_priority
-- 5           | 3             | 2               | 0            | 6.5
```

### CLI 命令

```bash
# 添加任务
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Add type hints" \
  "Add type hints to all TypeScript files" \
  8

# 查看任务列表
node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks

# 查看状态
node /Users/jk/gits/hub/nezha/dist/cli/index.js status
```

---

## 最佳实践

### 文件模式最佳实践

1. **保持 HEARTBEAT.md 简洁**
   - 不超过 50 行
   - 任务描述清晰
   - 优先级明确

2. **定期更新**
   - 每次提交后更新状态
   - 每周清理已完成任务
   - 每月重新评估优先级

3. **Git 提交规范**
   ```bash
   git add HEARTBEAT.md
   git commit -m "docs: update HEARTBEAT.md - completed task X"
   ```

### 数据库模式最佳实践

1. **项目命名规范**
   - 使用小写字母和连字符
   - 例如：`my-project`, `api-server`, `web-client`

2. **任务优先级**
   - 8-10: 立即执行
   - 5-7: 正常执行
   - 1-4: 有时间时执行

3. **AI 通信规范**
   - 消息类型明确：`task`, `review`, `feedback`, `status`
   - 内容简洁明了
   - 包含必要的元数据

4. **定期维护**
   - 每周清理已完成任务
   - 每月更新项目配置
   - 每季度归档旧项目

---

## 常见问题

### Q1: 什么时候使用文件模式？

**A**: 当你：
- 开发 Nezha 自身项目
- 管理单一项目
- 不需要数据库
- 需要简单的任务管理

### Q2: 什么时候使用数据库模式？

**A**: 当你：
- 管理 Nezha 之外的其他项目
- 需要管理多个项目
- 需要多 AI 协作
- 需要强大的查询和统计能力

### Q3: 可以同时使用两种模式吗？

**A**: 可以！
- Nezha 自身使用文件模式
- 其他项目使用数据库模式
- 两种模式互不干扰

### Q4: 如何从文件模式迁移到数据库模式？

**A**: 步骤：
1. 创建数据库
2. 运行迁移脚本
3. 注册项目
4. 将 HEARTBEAT.md 中的任务导入数据库
5. 删除 HEARTBEAT.md

### Q5: 数据库模式需要多少资源？

**A**: 
- PostgreSQL 数据库：约 100MB
- 每个项目：约 1MB
- 每个任务：约 1KB
- 每条消息：约 1KB

### Q6: 如何备份任务数据？

**A**: 
```bash
# 备份整个数据库
pg_dump nezha_projects > backup.sql

# 恢复
psql nezha_projects < backup.sql
```

---

## 相关文档

- [README.md](../README.md) - 项目概览
- [GITBRAIN_NEZHA_GUIDE.md](./GITBRAIN_NEZHA_GUIDE.md) - GitBrain 集成示例
- [MULTI_PROJECT_DATABASE_GUIDE.md](./MULTI_PROJECT_DATABASE_GUIDE.md) - 多项目管理指南

---

**创建时间**: 2026-03-16  
**状态**: 完整指南  
**维护者**: Nezha Team
