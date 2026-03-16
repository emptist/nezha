# Nezha 多项目数据库管理指引

**目标**: 通过数据库实现任意项目中运用 Nezha，避免文件系统混乱

**创建时间**: 2026-03-16  
**状态**: 数据库方案设计完成

**重要说明**: 本文档描述的是**数据库模式**，适用于管理 Nezha 之外的其他项目。如需了解文件模式（Nezha 自身项目使用），请参考 [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)。

---

## 🎯 核心理念

### ❌ 文件系统方案的问题

1. **混乱** - 每个项目都需要创建配置文件
2. **难以管理** - 配置文件分散在各个项目中
3. **同步问题** - 硬链接、符号链接容易失效
4. **权限问题** - 跨项目文件访问权限复杂

### ✅ 数据库方案的优势

1. **集中管理** - 所有项目配置存储在数据库中
2. **统一接口** - 通过 CLI 或 SQL 管理所有项目
3. **数据一致性** - 数据库保证数据完整性
4. **跨项目协作** - 容易实现项目间任务协调
5. **权限控制** - 数据库级别的访问控制

---

## 📊 数据库架构

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

### 表说明

#### 1. `projects` - 项目注册表

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,          -- 项目名称
    description TEXT,                    -- 项目描述
    path TEXT NOT NULL,                  -- 项目路径
    language TEXT,                       -- 编程语言
    framework TEXT,                      -- 框架
    config JSONB DEFAULT '{}',           -- 项目配置（JSON）
    status TEXT DEFAULT 'ACTIVE',        -- 状态：ACTIVE, INACTIVE, ARCHIVED
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_qc_at TIMESTAMPTZ              -- 最后 QC 时间
);
```

#### 2. `tasks` - 任务表（已存在，添加 project_id）

```sql
ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id);
```

#### 3. `project_metrics` - 项目质量指标

```sql
CREATE TABLE project_metrics (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    metric_type TEXT,                    -- 指标类型
    metric_value JSONB,                  -- 指标值
    recorded_at TIMESTAMPTZ
);
```

#### 4. `project_communications` - AI 通信日志

```sql
CREATE TABLE project_communications (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    from_ai TEXT,                        -- 发送方 AI
    to_ai TEXT,                          -- 接收方 AI
    message_type TEXT,                   -- 消息类型
    content TEXT,                        -- 消息内容
    metadata JSONB,                      -- 元数据
    created_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ                  -- 读取时间
);
```

---

## 🚀 使用流程

### 步骤 1: 运行数据库迁移

```bash
# 连接到数据库
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains

# 运行迁移脚本
\i /Users/jk/gits/hub/nezha/src/db/migrations/002_multi_project_support.sql

# 验证表创建成功
\dt

# 退出
\q
```

### 步骤 2: 注册项目

```sql
-- 注册 GitBrain 项目
INSERT INTO projects (name, description, path, language, framework, config)
VALUES (
    'gitbrains',
    'GitBrain - AI collaboration system with Maildir communication',
    '/Users/jk/gits/hub/tools_ai/gitbrains/GitBrain',
    'Python',
    'Python 3.9+',
    '{
        "qc": {
            "enabled": true,
            "checks": ["type-safety", "code-style", "test-coverage", "documentation"]
        },
        "paths": {
            "python": ".",
            "docs": "docs/",
            "tests": "tests/"
        }
    }'
);

-- 查询已注册的项目
SELECT id, name, path, language, status FROM projects;
```

### 步骤 3: 添加任务（关联项目）

```sql
-- 为 GitBrain 项目添加任务
INSERT INTO tasks (title, description, status, priority, project_id)
VALUES (
    'Review GitBrain code quality',
    'Review Python code for type hints, documentation, and test coverage',
    'PENDING',
    5,
    (SELECT id FROM projects WHERE name = 'gitbrains')
);

-- 查询项目的任务
SELECT t.id, t.title, t.status, t.priority, p.name as project
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.name = 'gitbrains';
```

### 步骤 4: AI 通信

```sql
-- Nezha AI 发送消息给 GitBrain AI
SELECT add_project_communication(
    (SELECT id FROM projects WHERE name = 'gitbrains'),
    'nezha-ai',
    'gitbrain-ai',
    'task',
    'Please review the core modules and add type hints',
    '{"priority": 8}'
);

-- GitBrain AI 读取未读消息
SELECT * FROM get_unread_messages(
    (SELECT id FROM projects WHERE name = 'gitbrains')
);

-- 标记消息为已读
SELECT mark_message_read('message-uuid-here');
```

### 步骤 5: 查看项目统计

```sql
-- 查看项目统计信息
SELECT * FROM get_project_stats(
    (SELECT id FROM projects WHERE name = 'gitbrains')
);
```

---

## 📝 CLI 命令设计（待实现）

### 项目管理命令

```bash
# 注册项目
node dist/cli/index.js project-add \
  --name "gitbrains" \
  --path "/Users/jk/gits/hub/tools_ai/gitbrains/GitBrain" \
  --language "Python" \
  --description "AI collaboration system"

# 列出所有项目
node dist/cli/index.js projects

# 查看项目详情
node dist/cli/index.js project-info "gitbrains"

# 更新项目配置
node dist/cli/index.js project-update "gitbrains" --config '{"qc": {"enabled": true}}'

# 归档项目
node dist/cli/index.js project-archive "gitbrains"
```

### 任务管理命令（增强）

```bash
# 添加任务（指定项目）
node dist/cli/index.js task-add \
  --project "gitbrains" \
  --title "Review code quality" \
  --description "Add type hints" \
  --priority 5

# 查看项目的任务
node dist/cli/index.js tasks --project "gitbrains"

# 查看所有项目的任务
node dist/cli/index.js tasks --all
```

### 通信命令

```bash
# 发送消息
node dist/cli/index.js message-send \
  --project "gitbrains" \
  --from "nezha-ai" \
  --to "gitbrain-ai" \
  --type "task" \
  --content "Please review the code"

# 查看未读消息
node dist/cli/index.js messages --project "gitbrains" --unread

# 标记消息已读
node dist/cli/index.js message-read <message-id>
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

## 📊 数据库查询示例

### 查看所有活跃项目

```sql
SELECT 
    p.name,
    p.path,
    p.language,
    p.last_qc_at,
    COUNT(t.id) as total_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'PENDING') as pending_tasks
FROM projects p
LEFT JOIN tasks t ON p.id = t.project_id
WHERE p.status = 'ACTIVE'
GROUP BY p.id, p.name, p.path, p.language, p.last_qc_at
ORDER BY p.name;
```

### 查看项目质量趋势

```sql
SELECT 
    p.name,
    pm.metric_type,
    pm.metric_value,
    pm.recorded_at
FROM project_metrics pm
JOIN projects p ON pm.project_id = p.id
WHERE p.name = 'gitbrains'
ORDER BY pm.recorded_at DESC
LIMIT 10;
```

### 查看 AI 通信历史

```sql
SELECT 
    p.name as project,
    pc.from_ai,
    pc.to_ai,
    pc.message_type,
    pc.content,
    pc.created_at,
    CASE WHEN pc.read_at IS NULL THEN 'UNREAD' ELSE 'READ' END as status
FROM project_communications pc
JOIN projects p ON pc.project_id = p.id
ORDER BY pc.created_at DESC
LIMIT 20;
```

---

## 🎯 实施步骤

### 立即可做

1. **运行数据库迁移**
   ```bash
   /Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains \
     -f /Users/jk/gits/hub/nezha/src/db/migrations/002_multi_project_support.sql
   ```

2. **注册 GitBrain 项目**
   ```sql
   INSERT INTO projects (name, description, path, language, framework)
   VALUES ('gitbrains', 'GitBrain - AI collaboration system', 
           '/Users/jk/gits/hub/tools_ai/gitbrains/GitBrain', 'Python', 'Python 3.9+');
   ```

3. **添加第一个任务**
   ```sql
   INSERT INTO tasks (title, description, status, priority, project_id)
   VALUES ('Review GitBrain code quality', 
           'Review Python code for type hints, documentation, and test coverage',
           'PENDING', 5,
           (SELECT id FROM projects WHERE name = 'gitbrains'));
   ```

### 后续开发

1. **实现 CLI 命令** - 添加项目管理命令
2. **实现 AI 通信** - 完善消息传递机制
3. **实现质量指标** - 自动收集项目质量数据
4. **实现跨项目协作** - 项目间任务协调

---

## 💡 优势总结

### ✅ 数据库方案

| 维度 | 文件系统方案 | 数据库方案 |
|------|-------------|-----------|
| **管理** | 分散，混乱 | 集中，清晰 |
| **一致性** | 难以保证 | 数据库保证 |
| **查询** | 困难 | SQL 强大 |
| **协作** | 复杂 | 简单 |
| **扩展** | 困难 | 容易 |
| **权限** | 文件系统级别 | 数据库级别 |

---

## 🚀 下一步

### 立即执行

```bash
# 1. 运行数据库迁移
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains \
  -f /Users/jk/gits/hub/nezha/src/db/migrations/002_multi_project_support.sql

# 2. 验证迁移成功
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c "\dt"

# 3. 注册项目
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "INSERT INTO projects (name, description, path, language, framework)
   VALUES ('gitbrains', 'GitBrain - AI collaboration system', 
           '/Users/jk/gits/hub/tools_ai/gitbrains/GitBrain', 'Python', 'Python 3.9+');"

# 4. 查看注册的项目
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT id, name, path, language FROM projects;"
```

---

**创建时间**: 2026-03-16  
**状态**: 数据库方案设计完成，可立即执行  
**下一步**: 运行数据库迁移，开始使用数据库管理项目
