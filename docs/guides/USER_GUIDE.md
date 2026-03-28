# Nezha User Guide

**目标**: 为用户提供 Nezha 的完整使用指南

**创建时间**: 2026-03-17  
**状态**: 完整指南

---

## 📋 目录

1. [快速开始](#快速开始)
2. [三种持续工作方法](#三种持续工作方法)
3. [常见使用场景](#常见使用场景)
4. [故障排除](#故障排除)
5. [最佳实践](#最佳实践)

---

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-org/nezha.git
cd nezha

# 安装依赖
npm install

# 构建项目
npm run build
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=nezha
# DB_USER=postgres
# DB_PASSWORD=your_password
```

### 数据库初始化

```bash
# 连接到 PostgreSQL
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres

# 创建数据库
CREATE DATABASE nezha;

# 连接到数据库
\c nezha

# 运行迁移
\i /Users/jk/gits/hub/nezha/src/db/migrations/001_initial.sql

# 验证表创建
\dt
```

### 运行

```bash
# 启动心跳服务
node dist/cli/index.js start

# 查看状态
node dist/cli/index.js status

# 查看健康信息
node dist/cli/index.js health

# 添加任务
node dist/cli/index.js task-add "Review code" "Review src/core for issues" 5

# 列出任务
node dist/cli/index.js tasks

# 停止服务
node dist/cli/index.js stop
```

---

## 三种持续工作方法

Nezha 支持三种持续工作方法，用户可以根据自己的需求选择合适的方法：

### 方法 1: 持续改进任务（文件模式）

**适用场景**: 单一项目的开发和维护，适合 Nezha 自身项目或类似项目

**核心机制**: 使用 `HEARTBEAT.md` 文件作为任务清单，AI 读取文件并执行任务

**使用步骤**:

1. **创建 HEARTBEAT.md 文件**:
```markdown
# My Project Tasks

## High Priority (8-10)
- [ ] Fix critical bug in authentication
- [ ] Add unit tests for API endpoints
- [ ] Implement error handling for database connections

## Medium Priority (5-7)
- [ ] Improve error messages
- [ ] Update documentation
- [ ] Add logging system

## Low Priority (1-4)
- [ ] Refactor code structure
- [ ] Add code examples
- [ ] Improve performance

## Completed
- [x] Implement basic CRUD operations
- [x] Add user authentication
- [x] Create API documentation
```

2. **添加持续改进任务**:
```bash
node dist/cli/index.js task-add "Execute HEARTBEAT.md tasks" "Read HEARTBEAT.md in the current directory. Execute the tasks listed there following the continuous improvement cycle: Review -> Identify -> Fix -> Build -> Test -> Document -> Commit -> Push -> Update HEARTBEAT.md" 10
```

3. **启动心跳服务**:
```bash
node dist/cli/index.js start
```

4. **AI 自动执行任务**:
   - AI 读取 HEARTBEAT.md
   - 选择最高优先级任务
   - 执行任务（Review → Identify → Fix → Build → Test → Document → Commit → Push）
   - 更新 HEARTBEAT.md 状态
   - 循环执行下一个任务

**详细 task-add 命令示例**:

1. **持续改进循环任务**:
```bash
node dist/cli/index.js task-add "Review and improve codebase" "This is a continuous improvement cycle. Steps:
1. Read src/ files and identify issues or improvements
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
node dist/cli/index.js task-add "Improve project codebase" "Analyze the src/ directory and identify issues or improvements needed. Fix at least one bug or improve one component. Read the code first to understand the architecture." 10
```

4. **真实代码改进任务**:
```bash
node dist/cli/index.js task-add "Real code improvement" "Do actual work:
1. Delete unnecessary directories
2. Read src/core/Scheduler.ts and add a simple but useful feature (like adding a 'lastRun' timestamp tracking)
3. Run npm run build to verify
4. Commit and push" 10
```

5. **文档任务**:
```bash
node dist/cli/index.js task-add "Document improvements" "Create a CHANGELOG.md documenting all the improvements made today: task counter, getStats, getHealth, health CLI command, error handling" 10
```

6. **代码清理任务**:
```bash
node dist/cli/index.js task-add "Code cleanup" "Clean up code: remove duplicate code, fix imports, add comments. Build, commit, push." 10
```

7. **Bug 修复任务**:
```bash
node dist/cli/index.js task-add "Fix bugs" "Fix bugs in IMPROVEMENTS.md: #2 (duplicate logic). Build, commit, push." 10
```

8. **功能添加任务**:
```bash
node dist/cli/index.js task-add "Add feature" "Read src/core/Scheduler.ts. Add a simple but useful feature: track and log how many tasks have been executed in total. Add a counter." 10
```

9. **健康检查任务**:
```bash
node dist/cli/index.js task-add "Add health check" "Add a health check to HeartbeatService. Add a method that returns { isRunning, stats, lastError }" 10
```

10. **CLI 增强任务**:
```bash
node dist/cli/index.js task-add "Add CLI health command" "Add a 'health' command to CLI that calls the getHealth() method and prints the status" 10
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

**适用场景**: 管理多个项目，需要强大的查询和统计能力

**核心机制**: 使用 PostgreSQL 数据库管理任务，通过 SQL 直接插入任务

**使用步骤**:

1. **注册项目**:
```sql
-- 连接到数据库
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha -U postgres

-- 注册项目
INSERT INTO projects (name, description, path, language, framework, config)
VALUES (
    'my-web-app',
    'My Web Application',
    '/Users/jk/projects/my-web-app',
    'TypeScript',
    'React',
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
    'Add type hints to all TypeScript files in project. Steps:
    1. Read all TypeScript files in src/ directory
    2. Identify files without type hints
    3. Add appropriate type annotations
    4. Run npm run build to verify
    5. Commit changes with descriptive message',
    'PENDING',
    8,
    (SELECT id FROM projects WHERE name = 'my-web-app')
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
    (SELECT id FROM projects WHERE name = 'my-web-app')
);

-- 查看项目的任务
SELECT t.id, t.title, t.status, t.priority, p.name as project
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE p.name = 'my-web-app'
ORDER BY t.priority DESC, t.created_at ASC;
```

3. **批量添加任务**:
```sql
-- 批量添加多个任务
INSERT INTO tasks (title, description, status, priority, project_id) VALUES
    ('Fix bug in authentication', 'Fix authentication bug reported in issue #123. Steps: 1. Reproduce the bug, 2. Identify the root cause, 3. Implement the fix, 4. Test thoroughly, 5. Update documentation', 'PENDING', 10, (SELECT id FROM projects WHERE name = 'my-web-app')),
    ('Add unit tests', 'Add unit tests for new features. Test coverage should reach at least 80%. Use vitest framework.', 'PENDING', 7, (SELECT id FROM projects WHERE name = 'my-web-app')),
    ('Update dependencies', 'Update all dependencies to latest versions. Check for breaking changes and update code accordingly. Run npm audit to check for vulnerabilities.', 'PENDING', 3, (SELECT id FROM projects WHERE name = 'my-web-app')),
    ('Optimize performance', 'Identify performance bottlenecks and optimize them. Focus on database queries, API response times, and frontend rendering performance.', 'PENDING', 6, (SELECT id FROM projects WHERE name = 'my-web-app')),
    ('Improve accessibility', 'Review the application for accessibility issues and fix them. Ensure the application is WCAG 2.1 AA compliant.', 'PENDING', 5, (SELECT id FROM projects WHERE name = 'my-web-app'));
```

4. **AI 通信**:
```sql
-- 发送消息
SELECT add_project_communication(
    (SELECT id FROM projects WHERE name = 'my-web-app'),
    'nezha-ai',
    'project-ai',
    'task',
    'Please review the code and add type hints to all TypeScript files',
    '{"priority": 8}'
);

-- 读取未读消息
SELECT * FROM get_unread_messages(
    (SELECT id FROM projects WHERE name = 'my-web-app')
);

-- 标记消息已读
SELECT mark_message_read('message-uuid-here');
```

5. **项目统计**:
```sql
-- 查看项目统计
SELECT * FROM get_project_stats(
    (SELECT id FROM projects WHERE name = 'my-web-app')
);

-- 结果示例：
-- total_tasks | pending_tasks | completed_tasks | failed_tasks | avg_priority
-- 15          | 5             | 8               | 2            | 6.5
```

6. **启动心跳服务**:
```bash
node dist/cli/index.js start
```

7. **AI 自动执行任务**:
   - AI 查询数据库获取待处理任务
   - 按优先级排序
   - 执行任务
   - 更新数据库状态
   - 循环执行下一个任务

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

**使用步骤**:

#### 方式 1: PM2（推荐）

1. **安装 PM2**:
```bash
npm install -g pm2
```

2. **启动 Nezha Daemon**:
```bash
# 启动守护进程
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

3. **PM2 配置文件** (ecosystem.config.js):
```javascript
module.exports = {
  apps: [{
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
      NEZHA_HEARTBEAT_INTERVAL: 30000
    },
    error_file: './logs/nezha-error.log',
    out_file: './logs/nezha-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
```

4. **使用配置文件启动**:
```bash
pm2 start ecosystem.config.js
```

#### 方式 2: systemd（Linux）

1. **创建服务文件** (/etc/systemd/system/nezha-daemon.service):
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

2. **启动服务**:
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

1. **编辑 crontab**:
```bash
crontab -e
```

2. **添加定时任务**:
```bash
# 每 30 分钟运行一次
*/30 * * * * cd /path/to/nezha && /usr/bin/node dist/cli/index.js start >> /var/log/nezha.log 2>&1

# 每小时运行一次
0 * * * * cd /path/to/nezha && /usr/bin/node dist/cli/index.js start >> /var/log/nezha.log 2>&1

# 每天凌晨 2 点运行
0 2 * * * cd /path/to/nezha && /usr/bin/node dist/cli/index.js start >> /var/log/nezha.log 2>&1
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

## 常见使用场景

### 场景 1: 单一项目的持续改进

**需求**: 开发一个单一项目，需要持续改进代码质量

**推荐方法**: 方法 1（持续改进任务 - 文件模式）

**步骤**:
1. 创建 `HEARTBEAT.md` 文件
2. 添加任务到文件中
3. 运行 `node dist/cli/index.js task-add "Execute HEARTBEAT.md tasks" ...`
4. 启动心跳服务 `node dist/cli/index.js start`
5. AI 自动执行任务并更新文件

### 场景 2: 多项目的统一管理

**需求**: 管理多个项目，需要统一的任务管理和统计

**推荐方法**: 方法 2（直接插入数据库 - 数据库模式）

**步骤**:
1. 在数据库中注册所有项目
2. 为每个项目添加任务
3. 启动心跳服务 `node dist/cli/index.js start`
4. AI 自动从数据库获取任务并执行
5. 查看项目统计信息

### 场景 3: 24/7 自动化工作

**需求**: 需要系统 24/7 运行，自动执行任务

**推荐方法**: 方法 3（脚本自动化 - 守护进程模式）

**步骤**:
1. 使用 PM2 或 systemd 启动守护进程
2. 配置自动重启和故障恢复
3. 设置开机自启
4. 系统持续运行，自动执行任务

### 场景 4: 代码审查和质量检查

**需求**: 定期审查代码，检查代码质量

**推荐方法**: 方法 1（持续改进任务 - 文件模式）

**步骤**:
1. 在 `HEARTBEAT.md` 中添加代码审查任务
2. 添加详细的审查步骤和标准
3. 运行 `node dist/cli/index.js task-add "Review code quality" ...`
4. AI 自动执行代码审查并报告问题

### 场景 5: 自动化测试和部署

**需求**: 自动运行测试，部署到生产环境

**推荐方法**: 方法 2（直接插入数据库 - 数据库模式）

**步骤**:
1. 在数据库中添加测试任务
2. 添加部署任务
3. 设置任务优先级和依赖关系
4. AI 自动执行测试和部署

---

## 故障排除

### 问题 1: 任务卡在 RUNNING 状态

**原因**: AI 执行任务时出错或超时

**解决方案**:
1. 查看日志了解错误详情
2. 系统会自动将卡住超过 5 分钟的任务重置为 PENDING
3. 如果问题持续，手动重置任务状态：
```sql
UPDATE tasks SET status = 'PENDING' WHERE status = 'RUNNING' AND updated_at < NOW() - INTERVAL '5 minutes';
```

### 问题 2: 数据库连接失败

**原因**: PostgreSQL 未运行或配置错误

**解决方案**:
1. 检查 PostgreSQL 是否运行：
```bash
/Applications/Postgres.app/Contents/Versions/18/bin/pg_isready
```

2. 检查环境变量配置：
```bash
echo $DB_HOST
echo $DB_PORT
echo $DB_NAME
echo $DB_USER
echo $DB_PASSWORD
```

3. 测试数据库连接：
```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME
```

### 问题 3: AI 执行任务超时

**原因**: 任务描述过于复杂或 API 响应慢

**解决方案**:
1. 简化任务描述，分步骤执行
2. 增加超时时间（修改环境变量 `NEZHA_TASK_TIMEOUT`）
3. 检查网络连接和 API 状态

### 问题 4: 守护进程频繁重启

**原因**: 内存泄漏或代码错误

**解决方案**:
1. 查看错误日志：
```bash
pm2 logs nezha-daemon --err
```

2. 检查内存使用：
```bash
pm2 monit
```

3. 增加内存限制：
```javascript
// ecosystem.config.js
max_memory_restart: '2G'
```

---

## 最佳实践

### 1. 任务描述要详细

**好的任务描述**:
```bash
node dist/cli/index.js task-add "Fix authentication bug" "Fix authentication bug reported in issue #123. Steps:
1. Reproduce the bug by logging in with invalid credentials
2. Identify the root cause in the authentication service
3. Implement the fix to handle invalid credentials properly
4. Add unit tests for the fix
5. Test the fix manually
6. Update documentation
7. Commit changes with descriptive message" 10
```

**不好的任务描述**:
```bash
node dist/cli/index.js task-add "Fix bug" "Fix the authentication bug" 5
```

### 2. 优先级要合理

- **8-10**: 紧急任务，需要立即执行
- **5-7**: 正常任务，按顺序执行
- **1-4**: 低优先级任务，有时间时执行

### 3. 定期清理已完成任务

```sql
-- 删除 30 天前已完成的任务
DELETE FROM tasks 
WHERE status = 'COMPLETED' 
AND completed_at < NOW() - INTERVAL '30 days';
```

### 4. 监控系统健康

```bash
# 定期查看状态
node dist/cli/index.js status

# 定期查看健康信息
node dist/cli/index.js health

# 定期查看日志
pm2 logs nezha-daemon
```

### 5. 备份数据库

```bash
# 备份数据库
pg_dump nezha > backup_$(date +%Y%m%d).sql

# 恢复数据库
psql nezha < backup_20260317.sql
```

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

## 相关文档

- [README.md](../README.md) - 项目概览
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - 开发者指南
- [OPENCODE_VS_TRAE.md](./OPENCODE_VS_TRAE.md) - OpenCode vs Trae 工作模式对比
- [MULTI_PROJECT_DATABASE_GUIDE.md](./MULTI_PROJECT_DATABASE_GUIDE.md) - 多项目管理指南

---

**创建时间**: 2026-03-17  
**状态**: 完整指南  
**维护者**: Nezha Team
