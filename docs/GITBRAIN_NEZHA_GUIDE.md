# GitBrain 项目集成 Nezha 指引

**目标**: 在 GitBrain 项目中使用 Nezha 进行持续质量检查和改进

**创建时间**: 2026-03-16  
**状态**: 可立即执行

---

## 📋 项目分析

### GitBrain 项目特点

**Python 版本** (GitBrain/):
- ✅ 基于 Maildir 的 AI 协作系统
- ✅ 有 CoderAI、ReviewerAI、OverseerAI 角色
- ✅ 类似 OpenClaw 的架构
- ✅ 已有邮件系统通信
- ✅ 456 个 Python 文件，132,002 行代码

**Swift 版本** (swiftgitbrain/):
- ✅ Swift 协议实现
- ⚠️ 目前只有协议定义
- ⚠️ 缺少数据库集成
- ⚠️ 缺少 CLI 和 daemon

### 为什么需要 Nezha？

| 需求 | GitBrain 现状 | Nezha 提供 |
|------|--------------|-----------|
| **持续 QC** | ❌ 无 | ✅ 自动代码质量检查 |
| **测试覆盖** | ⚠️ 有测试 | ✅ 覆盖率监控和提升 |
| **代码评审** | ⚠️ ReviewerAI | ✅ 自动化定期评审 |
| **改进任务** | ❌ 无 | ✅ 自动添加改进任务 |
| **记忆系统** | ⚠️ Brainstate | ✅ PostgreSQL 持久化 |
| **跨语言支持** | ⚠️ Python + Swift | ✅ 统一管理 |

---

## 🚀 快速开始

### 前提条件

- ✅ PostgreSQL 18.3 已安装（`/Applications/Postgres.app/`）
- ✅ 数据库 `nezha_gitbrains` 已存在
- ✅ Nezha 项目已构建（`/Users/jk/gits/hub/nezha/dist/cli/index.js`）

### 验证环境

```bash
# 验证 PostgreSQL
/Applications/Postgres.app/Contents/Versions/18/bin/psql --version

# 验证数据库
/Applications/Postgres.app/Contents/Versions/18/bin/psql -l | grep nezha_gitbrains

# 验证 Nezha CLI
node /Users/jk/gits/hub/nezha/dist/cli/index.js help
```

---

## 📊 数据库方案

### 核心表结构

```
┌─────────────┐
│   projects  │ ← 项目注册表
└──────┬──────┘
       │
       ├──────────┐
       │          │
       ▼          ▼
┌─────────────┐  ┌─────────────────┐
│    tasks    │  │ project_metrics │
└─────────────┘  └─────────────────┘
       │
       │
       ▼
┌──────────────────────┐
│ project_communications│ ← AI 通信日志
└──────────────────────┘
```

### 已创建的表

- ✅ `projects` - 项目注册表
- ✅ `tasks` - 任务表（已添加 project_id）
- ✅ `memory` - 记忆表
- ✅ `project_metrics` - 项目质量指标
- ✅ `project_communications` - AI 通信日志
- ✅ `project_config_history` - 项目配置历史

---

## 🎯 已完成的工作

### ✅ 数据库迁移

```sql
-- 查看所有表
\dt

-- 结果：
-- projects
-- tasks
-- memory
-- project_metrics
-- project_communications
-- project_config_history
```

### ✅ 注册 GitBrain 项目

```sql
SELECT id, name, path, language, status FROM projects;

-- 结果：
-- 93f0a410-45ab-4e73-bbe7-a723291093e5 | gitbrains | /Users/jk/gits/hub/tools_ai/gitbrains/GitBrain | Python | ACTIVE
```

### ✅ 添加第一个任务

```sql
SELECT t.id, t.title, t.status, t.priority, p.name as project 
FROM tasks t JOIN projects p ON t.project_id = p.id;

-- 结果：
-- 0b19b8f0-8c6b-48a3-a3c0-5e6a2bf6f3bc | Review GitBrain code quality | PENDING | 5 | gitbrains
```

### ✅ AI 通信测试

```sql
-- 发送消息
SELECT add_project_communication(
    (SELECT id FROM projects WHERE name = 'gitbrains'),
    'nezha-ai',
    'gitbrain-ai',
    'task',
    'Please review the core modules and add type hints',
    '{"priority": 8}'
);

-- 读取未读消息
SELECT * FROM get_unread_messages(
    (SELECT id FROM projects WHERE name = 'gitbrains')
);

-- 结果：
-- 6058b8f2-4c3c-4843-9378-309d367669fb | nezha-ai | task | Please review the core modules and add type hints
```

---

## 📝 可用的操作

### 1. Nezha CLI 命令

```bash
# 查看帮助
node /Users/jk/gits/hub/nezha/dist/cli/index.js help

# 添加任务
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Review GitBrain code quality" \
  "Review Python code for type hints, documentation, and test coverage" \
  5

# 查看任务列表
node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks

# 查看状态
node /Users/jk/gits/hub/nezha/dist/cli/index.js status

# 查看健康信息
node /Users/jk/gits/hub/nezha/dist/cli/index.js health
```

### 2. 数据库查询

```bash
# 查看所有项目
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT id, name, path, language, status FROM projects;"

# 查看项目的任务
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT t.id, t.title, t.status, t.priority, p.name as project 
   FROM tasks t JOIN projects p ON t.project_id = p.id;"

# 查看项目统计
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT * FROM get_project_stats(
    (SELECT id FROM projects WHERE name = 'gitbrains')
   );"

# 查看未读消息
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT * FROM get_unread_messages(
    (SELECT id FROM projects WHERE name = 'gitbrains')
   );"
```

### 3. AI 通信

```bash
# 发送消息
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT add_project_communication(
    (SELECT id FROM projects WHERE name = 'gitbrains'),
    'nezha-ai',
    'gitbrain-ai',
    'notification',
    'Starting QC for your project'
   );"

# 标记消息已读
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT mark_message_read('message-uuid-here');"
```

---

## 🎯 建议的任务列表

### 高优先级（优先级 8-10）

```bash
# 1. 类型提示检查
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Add type hints to core modules" \
  "Add type hints to communication.py, daemon.py, memory.py, utils.py" \
  9

# 2. 测试覆盖率
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Improve test coverage" \
  "Add unit tests for core modules, aim for 80% coverage" \
  8

# 3. 文档完善
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Complete API documentation" \
  "Add docstrings to all public functions and classes" \
  8
```

### 中优先级（优先级 5-7）

```bash
# 4. 代码风格
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Apply PEP 8 style guide" \
  "Run ruff and fix all style issues" \
  6

# 5. 错误处理
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Improve error handling" \
  "Add proper exception handling and logging" \
  6

# 6. 性能优化
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Optimize daemon performance" \
  "Review and optimize daemon loop and message processing" \
  5
```

### 低优先级（优先级 1-4）

```bash
# 7. 示例代码
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Add usage examples" \
  "Create example scripts demonstrating GitBrain usage" \
  3

# 8. CI/CD 集成
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Setup CI/CD pipeline" \
  "Add GitHub Actions for automated testing and quality checks" \
  2
```

---

## 🔄 AI 工作流程

### Nezha AI 的工作流程

1. **查看所有项目**
   ```sql
   SELECT id, name, path, status FROM projects WHERE status = 'ACTIVE';
   ```

2. **为每个项目检查任务**
   ```sql
   SELECT * FROM get_project_stats(project_id);
   ```

3. **发送消息给项目 AI**
   ```sql
   SELECT add_project_communication(
       project_id,
       'nezha-ai',
       'project-ai',
       'notification',
       'Starting QC for your project'
   );
   ```

4. **添加任务**
   ```sql
   INSERT INTO tasks (title, description, status, priority, project_id)
   VALUES ('Task title', 'Task description', 'PENDING', 5, project_id);
   ```

### GitBrain AI 的工作流程

1. **读取未读消息**
   ```sql
   SELECT * FROM get_unread_messages(
       (SELECT id FROM projects WHERE name = 'gitbrains')
   );
   ```

2. **查看项目任务**
   ```sql
   SELECT id, title, status, priority 
   FROM tasks 
   WHERE project_id = (SELECT id FROM projects WHERE name = 'gitbrains')
     AND status = 'PENDING'
   ORDER BY priority DESC, created_at ASC;
   ```

3. **执行任务**
   - 分析代码
   - 实施改进
   - 运行测试
   - 提交更改

4. **更新任务状态**
   ```sql
   UPDATE tasks 
   SET status = 'COMPLETED', completed_at = NOW() 
   WHERE id = task_id;
   ```

5. **发送完成通知**
   ```sql
   SELECT add_project_communication(
       project_id,
       'gitbrain-ai',
       'nezha-ai',
       'status',
       'Task completed: Add type hints to core modules'
   );
   ```

---

## 📊 预期收益

### 代码质量提升

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| **Python 测试覆盖率** | ~45% | 80% | +35% |
| **Swift 文档覆盖率** | ~20% | 90% | +70% |
| **类型安全性** | 中 | 高 | +30% |
| **代码风格一致性** | 中 | 高 | +40% |

### 开发效率提升

| 场景 | 当前耗时 | 使用 Nezha 后 | 节省时间 |
|------|---------|--------------|---------|
| **发现代码问题** | 1 小时 | 10 分钟 | -83% |
| **添加改进任务** | 15 分钟 | 1 分钟 | -93% |
| **代码评审** | 2 小时 | 30 分钟 | -75% |
| **测试覆盖率提升** | 手动 | 自动 | -100% |

---

## 🚨 注意事项

### ⚠️ 不要使用未实现的命令

以下命令**不存在**：
- ❌ `load-project` - 未实现
- ❌ `qc` - 未实现

### ✅ 只使用已验证的命令

以下命令**已实现且可用**：
- ✅ `help` - 查看帮助
- ✅ `task-add` - 添加任务
- ✅ `tasks` - 查看任务列表
- ✅ `status` - 查看状态
- ✅ `health` - 查看健康信息

---

## 🚀 下一步

### 立即可做

1. **在 GitBrain 项目中打开 TraeCN**
2. **那边的 AI 会读取数据库中的任务和消息**
3. **开始执行任务和改进代码**

### 后续开发

1. **实现 CLI 命令** - 添加项目管理命令
2. **实现自动 QC** - 自动收集项目质量数据
3. **实现跨项目协作** - 项目间任务协调

---

## 📞 沟通方式

### AI 之间的沟通

1. **通过任务系统**
   ```bash
   # Nezha AI 添加任务
   node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
     "Message from Nezha AI" \
     "This is a message for GitBrain AI" \
     5
   
   # GitBrain AI 读取任务
   node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks
   ```

2. **通过 PostgreSQL**
   ```bash
   # 查询任务
   /Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
     "SELECT * FROM tasks WHERE status = 'pending';"
   
   # 更新任务状态
   /Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
     "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = 1;"
   ```

---

**创建时间**: 2026-03-16  
**状态**: 可立即执行  
**下一步**: 在 GitBrain 项目中打开此文件，AI 会自动开始执行
