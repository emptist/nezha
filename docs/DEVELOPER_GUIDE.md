# Nezha 开发者指南

**目标**: 为开发者提供 Nezha 的完整使用指南

**创建时间**: 2026-03-16  
**状态**: 完整指南

---

## ⚠️ 重要：AI ID 设计原则

> **🚫 已废弃的设计: AI ID 共享** - 禁止使用！

### 荒唐的错误设计

最初的设计将 AI ID 存储在共享文件 `.nezha/agent-id.json` 中，导致所有 AI 共享同一个 ID。

### 正确的设计：幂等 + 确定性

```
相同的上下文 → 相同的 ID → 知识累积 → 专家养成
```

### ID 格式

```
S-{project}-{git-hash}-{timestamp}-{hash}   # Specific: 有项目/git
G-{machine-fingerprint}-{timestamp}-{hash}  # General: 无项目/git
```

**示例**:

```
S-nezha-e33f9a0-20260325-133422-64db91
G-71c2ae97-20260325-133422-64db91
```

### 核心原则

| 原则         | 说明                  |
| ------------ | --------------------- |
| **幂等性**   | 同样上下文 = 同样 ID  |
| **确定性**   | 哈希生成，无随机数    |
| **自动灌注** | AI 启动时自动解析身份 |

### 依赖

| 依赖           | 说明                    |
| -------------- | ----------------------- |
| **Daemon**     | 必须运行，负责调度      |
| **PostgreSQL** | 必须运行，存储身份数据  |
| **自动检测**   | 未运行则自动启动 Daemon |

### 实现

- `AgentIdentityService` - 身份服务
- `agent_identities` 表 - 身份存储
- `created_by_identity` 字段 - 任务关联

详见: [AGENT_ID_SYSTEM.md](./AGENT_ID_SYSTEM.md)

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

| 场景                 | 推荐模式   | 原因                   |
| -------------------- | ---------- | ---------------------- |
| **Nezha 自身开发**   | 文件模式   | 简单直接，Git 版本控制 |
| **其他项目管理**     | 数据库模式 | 多项目，多 AI 协作     |
| **单一项目快速迭代** | 文件模式   | 无需数据库配置         |
| **跨项目协调**       | 数据库模式 | 集中管理，统一查询     |

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

> ⚠️ **重要**: 启动 daemon 前，必须先启动 OpenCode serve（在 4096 端口），否则任务无法执行！
>
> 📖 **深入了解**: 参见 [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md) 了解 CLI vs REST API 的对比

#### 标准操作流程 (SOP)

```bash
# 1. 启动 PostgreSQL
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18 start

# 2. 创建数据库（如果不存在）
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -c "CREATE DATABASE nezha;"

# 3. 运行迁移
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha -f /Users/jk/gits/hub/nezha/src/db/migrations/001_initial.sql

# 4. 构建
cd /Users/jk/gits/hub/nezha && npm run build

# 5. 启动 OpenCode serve（必需！否则任务无法执行）
opencode serve --port 4096

# 6. 启动 Nezha daemon（新终端）
node /Users/jk/gits/hub/nezha/dist/cli/index.js start

# 7. 添加任务（新终端）
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add "Review code" "Review src/core for issues" 5
```

#### 详细步骤

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
- [OPENCODE_VS_TRAE.md](./OPENCODE_VS_TRAE.md) - OpenCode vs Trae 工作模式对比
- [GITBRAIN_NEZHA_GUIDE.md](./GITBRAIN_NEZHA_GUIDE.md) - GitBrain 集成示例
- [MULTI_PROJECT_DATABASE_GUIDE.md](./MULTI_PROJECT_DATABASE_GUIDE.md) - 多项目管理指南

---

## 🔄 持续工作模式

### OpenCode vs Trae

**OpenCode 的工作模式**:

- 双 AI 协作：zen AI（调度者）+ serv AI（执行者）
- zen AI 持续运行服务，分配任务
- serv AI 执行任务，产生新任务
- 形成持续工作的闭环

**Trae 的限制**:

- 单 AI 模式，无持续运行的服务
- 需要用户手动触发
- 无法自主产生任务闭环

### 如何在 Trae 中实现类似 OpenCode 的工作模式？

**推荐方案**: Nezha Daemon + Trae AI 协作

```
Nezha Daemon (调度者)     Trae AI (执行者)
持续运行服务              执行具体任务
查询任务                  代码评审
发送消息                  产生新任务
监控状态                  报告结果
     ↓                        ↓
     └──────── PostgreSQL ─────┘
```

**实施步骤**:

1. **启动 Nezha Daemon**

   ```bash
   # 使用 PM2 运行 daemon
   pm2 start dist/cli/index.js --name nezha-daemon

   # 查看状态
   pm2 status

   # 查看日志
   pm2 logs nezha-daemon
   ```

2. **Nezha Daemon 的工作**
   - 持续运行心跳服务
   - 查询数据库中的待处理任务
   - 发送消息给 Trae AI
   - 监控任务执行状态

3. **Trae AI 的工作**
   - 定期检查数据库中的消息
   - 执行任务
   - 代码评审，发现新问题
   - 添加新任务到数据库
   - 报告执行结果

4. **持续工作循环**
   ```
   Nezha Daemon 查询任务
       ↓
   发送消息给 Trae AI
       ↓
   Trae AI 执行任务
       ↓
   Trae AI 发现新问题
       ↓
   Trae AI 添加新任务
       ↓
   Nezha Daemon 继续查询
       ↓
   循环...
   ```

**详细说明**: 参见 [OPENCODE_VS_TRAE.md](./OPENCODE_VS_TRAE.md)

---

## 🎯 三种持续工作方法

Nezha 支持三种持续工作方法，每种方法适用于不同的场景：

### 方法 1: 持续改进任务（文件模式）

**适用场景**: Nezha 自身项目的开发和维护

**核心机制**: 使用 `HEARTBEAT.md` 文件作为任务清单，AI 读取文件并执行任务

**工作流程**:

```
AI 读取 HEARTBEAT.md
    ↓
选择最高优先级任务
    ↓
执行任务（Review → Identify → Fix → Build → Test → Document → Commit → Push）
    ↓
更新 HEARTBEAT.md 状态
    ↓
提交到 Git
    ↓
循环...
```

**示例 HEARTBEAT.md**:

```markdown
# Nezha Development Tasks

## High Priority (8-10)

- [ ] Review: 读取 src/core/, src/services/, src/cli/ 目录，分析代码质量
- [ ] Identify: 发现 CLI help 命令为空的问题
- [ ] Fix: 添加 CLI help 命令输出，移除未使用变量
- [ ] Build: 运行 npm run build 确保编译通过
- [ ] Test: 验证修改是否正确
- [ ] Document: 更新相关文档
- [ ] Commit: 提交更改
- [ ] Push: 推送到远程
- [ ] Update: 更新本清单，标记完成的任务，添加新任务

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

**详细 task-add 命令示例**:

1. **持续改进循环任务**:

```bash
node dist/cli/index.js task-add "Review and improve codebase" "This is a continuous improvement cycle. Steps:
1. Read src/core/ files and identify issues or improvements
2. Fix at least one bug or improve one component
3. If any changes made, run 'npm run build' and fix any errors
4. Update relevant documentation if needed
5. Run 'git status' and 'git diff' to see changes
6. Commit with 'git add -A && git commit -m \"fix/improve: [description]\"'
7. Push with 'git push'
8. Report what was done" 10
```

2. **HEARTBEAT.md 执行任务**:

```bash
node dist/cli/index.js task-add "Execute HEARTBEAT.md tasks" "Read HEARTBEAT.md in the current directory. Execute the tasks listed there following the continuous improvement cycle: Review -> Identify -> Fix -> Build -> Test -> Document -> Commit -> Push -> Update HEARTBEAT.md" 10
```

3. **系统改进任务**:

```bash
node dist/cli/index.js task-add "Improve nezha codebase" "Analyze the src/ directory and identify issues or improvements needed. Fix at least one bug or improve one component. Read the code first to understand the architecture." 10
```

4. **真实代码改进任务**:

```bash
node dist/cli/index.js task-add "Real code improvement" "Do actual work:
1. Delete src/tests/ directory (not needed)
2. Read src/core/Scheduler.ts and add a simple but useful feature (like adding a 'lastRun' timestamp tracking)
3. Run npm run build to verify
4. Commit and push" 10
```

**优势**:

- ✅ 简单直观，无需数据库配置
- ✅ Git 版本控制，历史清晰
- ✅ 适合单一项目的快速迭代
- ✅ AI 可以直接修改文件
- ✅ 任务描述可以非常详细和具体

**劣势**:

- ❌ 不支持多项目
- ❌ 不支持多 AI 协作
- ❌ 查询能力有限

---

### 方法 2: 直接插入数据库（数据库模式）

**适用场景**: 管理其他项目，需要多项目、多 AI 协作

**核心机制**: 使用 PostgreSQL 数据库管理任务，通过 SQL 直接插入任务

**工作流程**:

```
AI 查询数据库
    ↓
获取项目任务
    ↓
执行任务
    ↓
更新数据库状态
    ↓
发送消息通知
    ↓
循环...
```

**数据库表结构**:

```sql
-- 项目注册表
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    path TEXT NOT NULL,
    language TEXT,
    framework TEXT,
    config JSONB,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 任务表
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'PENDING',
    priority INTEGER DEFAULT 0,
    result JSONB,
    error TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- AI 通信日志
CREATE TABLE project_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    from_ai TEXT NOT NULL,
    to_ai TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    read_at TIMESTAMP
);
```

**直接插入数据库示例**:

1. **注册项目**:

```sql
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

2. **添加任务**:

```sql
-- 添加高优先级任务
INSERT INTO tasks (title, description, status, priority, project_id)
VALUES (
    'Add type hints',
    'Add type hints to all TypeScript files in the project. Steps:
    1. Read all TypeScript files in src/ directory
    2. Identify files without type hints
    3. Add appropriate type annotations
    4. Run npm run build to verify
    5. Commit changes with descriptive message',
    'PENDING',
    8,
    (SELECT id FROM projects WHERE name = 'my-project')
);

-- 添加中优先级任务
INSERT INTO tasks (title, description, status, priority, project_id)
VALUES (
    'Improve error handling',
    'Review error handling across the codebase and improve it:
    1. Identify files with poor error handling
    2. Add try-catch blocks where needed
    3. Improve error messages
    4. Add logging for errors
    5. Test error scenarios',
    'PENDING',
    5,
    (SELECT id FROM projects WHERE name = 'my-project')
);

-- 查看项目的任务
SELECT t.id, t.title, t.status, t.priority, p.name as project
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.name = 'my-project'
ORDER BY t.priority DESC, t.created_at ASC;
```

3. **批量添加任务**:

```sql
-- 批量添加多个任务
INSERT INTO tasks (title, description, status, priority, project_id) VALUES
    ('Fix bug in authentication', 'Fix the authentication bug reported in issue #123. Steps: 1. Reproduce the bug, 2. Identify root cause, 3. Implement fix, 4. Test thoroughly, 5. Update documentation', 'PENDING', 10, (SELECT id FROM projects WHERE name = 'my-project')),
    ('Add unit tests', 'Add unit tests for the new features. Coverage should reach at least 80%.', 'PENDING', 7, (SELECT id FROM projects WHERE name = 'my-project')),
    ('Update dependencies', 'Update all dependencies to latest versions. Check for breaking changes and update code accordingly.', 'PENDING', 3, (SELECT id FROM projects WHERE name = 'my-project'));
```

4. **AI 通信**:

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

5. **项目统计**:

```sql
-- 查看项目统计
SELECT * FROM get_project_stats(
    (SELECT id FROM projects WHERE name = 'my-project')
);

-- 结果：
-- total_tasks | pending_tasks | completed_tasks | failed_tasks | avg_priority
-- 5           | 3             | 2               | 0            | 6.5
```

**优势**:

- ✅ 集中管理多个项目
- ✅ 强大的查询和统计能力
- ✅ 支持多 AI 协作
- ✅ 跨项目任务协调
- ✅ 完整的历史记录
- ✅ 并发安全（使用 SKIP LOCKED）

**劣势**:

- ❌ 需要数据库配置
- ❌ 相对复杂
- ❌ 需要维护数据库

---

### 方法 3: 脚本自动化（守护进程模式）

**适用场景**: 需要持续运行的后台服务，自动调度大模型执行任务

**核心机制**: 使用守护进程（pm2/systemd/crontab）持续运行 Nezha，自动调度大模型工作

**工作流程**:

```
守护进程启动
    ↓
定时触发（每 30 分钟）
    ↓
查询数据库中的待处理任务
    ↓
调用大模型 API 执行任务
    ↓
更新任务状态
    ↓
循环...
```

**实现方式**:

#### 方式 1: PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动 Nezha Daemon
pm2 start dist/cli/index.js --name nezha-daemon -- start

# 查看状态
pm2 status

# 查看日志
pm2 logs nezha-daemon

# 停止服务
pm2 stop nezha-daemon

# 重启服务
pm2 restart nezha-daemon

# 删除服务
pm2 delete nezha-daemon

# 设置开机自启
pm2 startup
pm2 save
```

**PM2 配置文件** (ecosystem.config.js):

```javascript
module.exports = {
  apps: [
    {
      name: 'nezha-daemon',
      script: './dist/cli/index.js',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'nezha',
        DB_USER: 'postgres',
        DB_PASSWORD: 'your_password',
        NEZHA_HEARTBEAT_INTERVAL: 30000,
      },
      error_file: './logs/nezha-error.log',
      out_file: './logs/nezha-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
```

**使用配置文件启动**:

```bash
pm2 start ecosystem.config.js
```

#### 方式 2: systemd（Linux）

**创建服务文件** (/etc/systemd/system/nezha-daemon.service):

```ini
[Unit]
Description=Nezha Daemon Service
After=network.target postgresql.service

[Service]
Type=simple
User=nezha
WorkingDirectory=/path/to/nezha
ExecStart=/usr/bin/node /path/to/nezha/dist/cli/index.js start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=DB_HOST=localhost
Environment=DB_PORT=5432
Environment=DB_NAME=nezha
Environment=DB_USER=postgres
Environment=DB_PASSWORD=your_password
Environment=NEZHA_HEARTBEAT_INTERVAL=30000

[Install]
WantedBy=multi-user.target
```

**启动服务**:

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start nezha-daemon

# 查看状态
sudo systemctl status nezha-daemon

# 查看日志
sudo journalctl -u nezha-daemon -f

# 停止服务
sudo systemctl stop nezha-daemon

# 重启服务
sudo systemctl restart nezha-daemon

# 设置开机自启
sudo systemctl enable nezha-daemon
```

#### 方式 3: crontab（定时任务）

**编辑 crontab**:

```bash
crontab -e
```

**添加定时任务**:

```bash
# 每 30 分钟运行一次
*/30 * * * * cd /path/to/nezha && /usr/bin/node dist/cli/index.js start >> /var/log/nezha.log 2>&1

# 每小时运行一次
0 * * * * cd /path/to/nezha && /usr/bin/node dist/cli/index.js start >> /var/log/nezha.log 2>&1

# 每天凌晨 2 点运行
0 2 * * * cd /path/to/nezha && /usr/bin/node dist/cli/index.js start >> /var/log/nezha.log 2>&1
```

**Heartbeat Daemon 实现示例** (src/daemon/heartbeat.ts):

```typescript
import { getPool, closePool } from './db/client.js';
import { getDbConfig } from './db/config.js';

interface HeartbeatConfig {
  intervalMs: number;
  workspaceDir: string;
  opencodeUrl: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed' | 'failed';
}

class HeartbeatDaemon {
  private config: HeartbeatConfig;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = {
      intervalMs: config.intervalMs ?? 30 * 60 * 1000, // 30 minutes
      workspaceDir: config.workspaceDir ?? process.cwd(),
      opencodeUrl: config.opencodeUrl ?? 'http://127.0.0.1:4098',
    };
  }

  async start(): Promise<void> {
    console.log(
      `🚀 Starting Heartbeat Daemon (interval: ${this.config.intervalMs / 1000 / 60} min)`
    );
    console.log(`   Workspace: ${this.config.workspaceDir}`);
    console.log(`   OpenCode: ${this.config.opencodeUrl}`);

    this.isRunning = true;

    // Run once immediately
    await this.runHeartbeat();

    // Then run periodically
    this.timer = setInterval(() => {
      this.runHeartbeat().catch(console.error);
    }, this.config.intervalMs);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await closePool();
    console.log('🛑 Heartbeat Daemon stopped');
  }

  private async runHeartbeat(): Promise<void> {
    if (!this.isRunning) return;

    const startTime = Date.now();
    console.log(`\n❤️ Heartbeat at ${new Date().toISOString()}`);

    try {
      // 1. Check for pending tasks
      const tasks = await this.getPendingTasks();

      if (tasks.length === 0) {
        console.log('   ✓ No pending tasks, heartbeat OK');
        await this.logHeartbeat('ok', 0, Date.now() - startTime);
        return;
      }

      console.log(`   📋 Found ${tasks.length} pending task(s)`);

      // 2. Execute first task
      const task = tasks[0];
      console.log(`   ▶ Executing: ${task.title}`);

      const result = await this.executeTask(task);

      if (result.success) {
        console.log(`   ✅ Task completed`);
        await this.updateTaskStatus(task.id, 'completed');
      } else {
        console.log(`   ❌ Task failed: ${result.error}`);
        await this.updateTaskStatus(task.id, 'failed');
      }

      await this.logHeartbeat('executed', tasks.length, Date.now() - startTime);
    } catch (error) {
      console.error(`   ❌ Heartbeat error:`, error);
      await this.logHeartbeat('error', 0, Date.now() - startTime, String(error));
    }
  }

  private async getPendingTasks(): Promise<Task[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, title, description, status 
       FROM tasks 
       WHERE status = 'pending' 
       ORDER BY priority DESC, created_at ASC 
       LIMIT 1`
    );
    return result.rows;
  }

  private async executeTask(task: Task): Promise<{ success: boolean; error?: string }> {
    // Call opencode API to execute the task
    const sessionResponse = await fetch(`${this.config.opencodeUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!sessionResponse.ok) {
      return { success: false, error: 'Failed to create session' };
    }

    const session = await sessionResponse.json();
    const sessionId = session.id;

    // Send task as message
    const messageResponse = await fetch(`${this.config.opencodeUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: task.description || task.title }],
      }),
    });

    if (!messageResponse.ok) {
      return { success: false, error: 'Failed to send message' };
    }

    // For now, just return success - need to handle async response
    return { success: true };
  }

  private async updateTaskStatus(taskId: string, status: 'completed' | 'failed'): Promise<void> {
    const pool = getPool();
    await pool.query(`UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`, [
      status,
      taskId,
    ]);
  }

  private async logHeartbeat(
    status: string,
    tasksCount: number,
    durationMs: number,
    error?: string
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO heartbeats (status, tasks_count, duration_ms, error) 
       VALUES ($1, $2, $3, $4)`,
      [status, tasksCount, durationMs, error]
    );
  }
}

async function main() {
  const daemon = new HeartbeatDaemon({
    intervalMs: 30 * 60 * 1000, // 30 minutes
    workspaceDir: process.cwd(),
  });

  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await daemon.stop();
    process.exit(0);
  });

  await daemon.start();
}

main().catch(console.error);
```

**优势**:

- ✅ 持续运行，无需人工干预
- ✅ 自动调度大模型执行任务
- ✅ 支持多种部署方式
- ✅ 可配置定时间隔
- ✅ 自动重启和故障恢复

**劣势**:

- ❌ 需要维护守护进程
- ❌ 依赖外部工具（PM2/systemd/crontab）
- ❌ 相对复杂

---

## ⚠️ 虚伪的持续工作 vs 真正的持续工作

### 虚伪的持续工作（系统中的毒素）

**定义**: 完成工作的主体是程序代码（循环、定时器、死程序），而不是大模型

**特征**:

- ❌ 使用 `while (true)` 循环执行固定的程序逻辑
- ❌ 使用 `setInterval` 定时执行预定义的代码
- ❌ 使用 `for` 循环遍历数据并执行固定操作
- ❌ 使用 crontab 定时执行脚本，但脚本只是运行固定代码
- ❌ 程序代码"假装"在工作，实际上没有调用大模型

**示例**:

```typescript
// ❌ 虚伪的持续工作 - 循环执行死程序
while (true) {
  // 只是打印日志，没有调用大模型
  console.log('Working...');
  await sleep(1000);
}

// ❌ 虚伪的持续工作 - 定时执行固定代码
setInterval(() => {
  // 只是更新计数器，没有调用大模型
  counter++;
  console.log(`Counter: ${counter}`);
}, 1000);

// ❌ 虚伪的持续工作 - 遍历数据执行固定操作
for (const item of items) {
  // 只是处理数据，没有调用大模型
  processItem(item);
}
```

**问题**:

- 没有真正的智能决策
- 无法处理复杂任务
- 无法学习和改进
- 只是"假装"在工作

### 真正的持续工作

**定义**: 完成工作的主体是大模型，程序代码只是调度器

**特征**:

- ✅ 程序代码调度大模型执行任务
- ✅ 大模型自主决策如何完成任务
- ✅ 大模型可以调用工具、读写文件、运行命令
- ✅ 大模型可以学习和改进
- ✅ 程序代码只负责调度，不负责具体工作

**示例**:

```typescript
// ✅ 真正的持续工作 - 调度大模型执行任务
while (true) {
  // 1. 从数据库获取任务
  const task = await getTaskFromDatabase();

  if (task) {
    // 2. 调用大模型执行任务
    const result = await callLLM(task.description);

    // 3. 更新任务状态
    await updateTaskStatus(task.id, result);
  }

  await sleep(30000); // 30 秒后再次检查
}

// ✅ 真正的持续工作 - 定时调度大模型
setInterval(
  async () => {
    // 1. 读取 HEARTBEAT.md
    const heartbeat = await readHeartbeatFile();

    // 2. 调用大模型执行任务
    const result = await callLLM(heartbeat.tasks);

    // 3. 更新 HEARTBEAT.md
    await updateHeartbeatFile(result);
  },
  30 * 60 * 1000
); // 30 分钟
```

**关键区别**:

| 维度             | 虚伪的持续工作 | 真正的持续工作 |
| ---------------- | -------------- | -------------- |
| **工作主体**     | 程序代码       | 大模型         |
| **智能程度**     | 无（固定逻辑） | 高（自主决策） |
| **学习能力**     | 无             | 有             |
| **任务适应性**   | 无（固定任务） | 有（灵活处理） |
| **程序代码作用** | 执行具体工作   | 调度大模型     |
| **大模型调用**   | ❌ 不调用      | ✅ 必须调用    |

### 如何识别和排除虚伪的持续工作？

**识别标准**:

1. **检查是否有大模型调用**: 如果程序代码中没有调用大模型 API，就是虚伪的持续工作
2. **检查工作主体**: 如果工作由程序代码完成，而不是大模型，就是虚伪的持续工作
3. **检查智能决策**: 如果没有智能决策，只是执行固定逻辑，就是虚伪的持续工作

**排除方法**:

1. **重构代码**: 将固定逻辑改为调用大模型
2. **添加大模型调用**: 在循环或定时器中添加大模型 API 调用
3. **改变工作模式**: 从"程序执行工作"改为"程序调度大模型执行工作"

**示例重构**:

```typescript
// ❌ 之前：虚伪的持续工作
setInterval(() => {
  // 固定逻辑：只是更新计数器
  counter++;
  console.log(`Counter: ${counter}`);
}, 1000);

// ✅ 之后：真正的持续工作
setInterval(async () => {
  // 调度大模型：让大模型决定做什么
  const task = await getTaskFromDatabase();
  if (task) {
    const result = await callLLM(task.description);
    await updateTaskStatus(task.id, result);
  }
}, 30000);
```

### Nezha 的持续工作模式

Nezha 采用**真正的持续工作**模式：

1. **HeartbeatService**: 调度器，负责定时触发
2. **Scheduler**: 任务调度器，从数据库获取任务
3. **Agent**: 大模型调用器，调用 OpenCode API 执行任务
4. **大模型**: 实际执行工作，自主决策

**工作流程**:

```
HeartbeatService 定时触发
    ↓
Scheduler 从数据库获取任务
    ↓
Agent 调用 OpenCode API
    ↓
大模型接收任务，自主决策
    ↓
大模型执行任务（调用工具、读写文件、运行命令）
    ↓
大模型返回结果
    ↓
Agent 更新数据库状态
    ↓
循环...
```

**关键点**:

- ✅ 程序代码只负责调度
- ✅ 大模型负责实际工作
- ✅ 大模型可以自主决策
- ✅ 大模型可以学习和改进

---

**详细说明**: 参见 [OPENCODE_VS_TRAE.md](./OPENCODE_VS_TRAE.md)

---

## 🔌 Plugin System

### Overview

Nezha uses a plugin system to extend functionality. Plugins hook into the task lifecycle and can respond to events like task completion, startup, and shutdown.

### Core Philosophy

**Important**: Plugins should **help and remind**, not **replace AI decisions**.

| Correct Design                | Wrong Design                 |
| ----------------------------- | ---------------------------- |
| Plugin reminds AI to commit   | Plugin commits automatically |
| AI decides when/how           | Plugin decides               |
| AI writes meaningful messages | Plugin generates garbage     |
| AI is responsible             | Plugin takes over            |

### GitReminder Plugin

The `GitAutoCommitPlugin` (internally named `git-reminder`) is a plugin that reminds about uncommitted changes after task completion.

**What it does:**

- Logs a reminder when tasks complete with uncommitted changes
- Reports git status on startup
- Warns about uncommitted changes on shutdown

**What it does NOT do:**

- ❌ Does NOT commit automatically
- ❌ Does NOT push automatically
- ❌ Does NOT generate commit messages

**Why this design:**

The previous version auto-committed after every task, which caused:

- 180+ polluted commits with garbage messages like "Task completed: Test Task"
- Violation of Nezha philosophy (replacing AI decisions)
- History pollution that required `git filter-branch` to fix

**Current behavior:**

```
Task completes
    ↓
Plugin checks git status
    ↓
If uncommitted changes:
    └── Logs: "[GitReminder] Task completed with X uncommitted file(s)"
    └── Logs: "[GitReminder] Reminder: Please commit your changes"
    ↓
AI is responsible for committing
```

**Configuration:**

```typescript
new GitAutoCommitPlugin({
  remindOnUncommitted: true, // Log reminder for uncommitted changes
  logGitStatus: true, // Log git status on startup
});
```

### Creating Custom Plugins

Plugins implement the `Plugin` interface:

```typescript
interface Plugin {
  name: string;
  version: string;
  description?: string;
  hooks: PluginHooks;
  config?: Record<string, unknown>;
}

interface PluginHooks {
  beforeTask?: (context: TaskContext) => Promise<void> | void;
  afterTask?: (context: TaskContext) => Promise<void> | void;
  onError?: (context: TaskContext, error: Error) => Promise<void> | void;
  onStartup?: () => Promise<void> | void;
  onShutdown?: () => Promise<void> | void;
  onHeartbeat?: () => Promise<void> | void;
}
```

**Example:**

```typescript
export class MyPlugin implements Plugin {
  name = 'my-plugin';
  version = '1.0.0';
  description = 'My custom plugin';

  hooks = {
    afterTask: async (context: TaskContext) => {
      if (context.status === 'COMPLETED') {
        logger.info(`[MyPlugin] Task completed: ${context.title}`);
      }
    },
    onStartup: async () => {
      logger.info('[MyPlugin] Starting up...');
    },
  };
}
```

**Best Practices:**

1. Use `logger.info()` for important messages, `logger.debug()` for details
2. Follow the naming convention: `[PluginName] Message`
3. Don't replace AI decisions - only help/remind
4. Keep logging minimal to avoid polluting the system

---

**创建时间**: 2026-03-16  
**状态**: 完整指南  
**维护者**: Nezha Team
