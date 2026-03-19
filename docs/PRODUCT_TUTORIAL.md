# Nezha 产品使用教程

> 使用 Nezha 作为 AI 开发助手，为其他项目（如 cloudbrain）提供持续、自主开发能力

---

## 目录

1. [项目设置](#1-项目设置)
2. [配置](#2-配置)
3. [添加任务](#3-添加任务)
4. [自主开发工作流](#4-自主开发工作流)
5. [多项目管理](#5-多项目管理)

---

## 1. 项目设置

### 1.1 系统要求

| 组件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | 22+ | 运行时环境 |
| PostgreSQL | 18+ | 任务队列和记忆存储 |
| OpenCode | 最新版 | AI 对话接口 |

### 1.2 安装步骤

#### 方式 A: 作为子模块集成到目标项目

```bash
# 进入你的项目目录
cd /Users/jk/gits/hub/cloudbrain

# 添加 Nezha 作为 Git 子模块
git submodule add https://github.com/your-org/nezha.git nezha

# 进入 Nezha 目录
cd nezha

# 安装依赖
npm install

# 编译 TypeScript
npm run build
```

#### 方式 B: 独立部署

```bash
# 克隆 Nezha
git clone https://github.com/your-org/nezha.git
cd nezha

# 安装依赖
npm install

# 编译
npm run build
```

### 1.3 PostgreSQL 初始化

```bash
# 启动 PostgreSQL (macOS)
pg_ctl -D ~/Library/Application\ Support/Postgres/var-18 start

# 启动 PostgreSQL (Linux)
sudo systemctl start postgresql

# 创建数据库
createdb nezha

# 运行迁移
psql nezha -f src/db/migrations/001_initial.sql
```

### 1.4 启动服务

**启动顺序很重要：必须先启动 OpenCode Server**

```bash
# 终端 1: 启动 OpenCode Server (必需)
opencode serve --port 4096

# 终端 2: 启动 Nezha Daemon
node dist/cli/index.js start

# 终端 3: 验证服务
node dist/cli/index.js health
```

### 1.5 使用 PM2 守护进程

```bash
# 安装 PM2
npm install -g pm2

# 启动 OpenCode
pm2 start --name opencode "opencode serve --port 4096"

# 启动 Nezha
pm2 start --name nezha-daemon "node dist/cli/index.js start"

# 查看状态
pm2 status

# 查看日志
pm2 logs nezha-daemon
```

---

## 2. 配置

### 2.1 环境变量配置

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nezha
DB_USER=postgres
DB_PASSWORD=your_password

# 任务配置
NEZHA_HEARTBEAT_INTERVAL=30000
NEZHA_MAX_RETRIES=3
NEZHA_TASK_TIMEOUT=300000

# 嵌入配置 (可选)
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_API_URL=http://localhost:11434

# 传输模式: http 或 cli
NEZHA_TRANSPORT_MODE=cli

# 通知 (可选)
WEBHOOK_URL=https://your-webhook.com/notify
```

### 2.2 YAML 配置文件

`config.yaml` 提供更结构化的配置：

```yaml
# 数据库配置
database:
  host: localhost
  port: 5432
  database: nezha
  user: postgres
  password: postgres
  max: 10

# 任务调度配置
task:
  heartbeatIntervalMs: 30000  # 心跳间隔 (30秒)
  maxRetries: 3              # 最大重试次数
  retryDelayMs: 5000          # 重试延迟
  taskTimeoutMs: 300000       # 任务超时 (5分钟)

# 嵌入配置 (可选)
embedding:
  provider: ollama
  model: nomic-embed-text
  apiUrl: http://localhost:11434

# 健康检查服务器
health:
  port: 4097
  requireAuth: false

# 传输模式
transport:
  mode: cli

# 日志
logging:
  level: info
```

### 2.3 配置优先级

```
环境变量 > config.yaml > 默认值
```

### 2.4 传输模式选择

| 模式 | 命令 | 特点 |
|------|------|------|
| HTTP | `--transport http` | REST API 调用，适合服务器部署 |
| CLI | `--transport cli` | 启动子进程，支持流式输出 |

```bash
# HTTP 模式
node dist/cli/index.js start --transport http

# CLI 模式 (默认)
node dist/cli/index.js start --transport cli --stream
```

---

## 3. 添加任务

### 3.1 基本任务

```bash
# 语法
node dist/cli/index.js task-add "<标题>" "<描述>" <优先级>

# 示例
node dist/cli/index.js task-add "实现用户认证 API" "POST /api/auth/login" 10
```

### 3.2 高级选项

```bash
# 指定类型
node dist/cli/index.js task-add "修复 Bug" "登录失败" 8 \
  --type bugfix

# 指定超时 (秒)
node dist/cli/index.js task-add "重构模块" "重构支付模块" 7 \
  --timeout 600

# 指定分类
node dist/cli/index.js task-add "安全审计" "检查 SQL 注入" 9 \
  --category security

# 分配给特定 Agent
node dist/cli/index.js task-add "API 文档" "生成 API 文档" 5 \
  --assign agent-1

# 依赖其他任务
node dist/cli/index.js task-add "集成测试" "测试支付流程" 6 \
  --depends-on <task-uuid>
```

**任务类型**: `analysis`, `implementation`, `documentation`, `bugfix`, `research`, `testing`, `deployment`, `maintenance`

**任务分类**: `security`, `performance`, `feature`, `bugfix`

### 3.3 使用模板

```bash
# 查看可用模板
node dist/cli/index.js templates list

# 使用模板创建任务
node dist/cli/index.js task-add "代码审查" "PR #123" --template code-review
```

### 3.4 创建自定义模板

```bash
node dist/cli/index.js templates add \
  "security-audit" \
  "执行安全审计，检查潜在漏洞" \
  --priority 9 \
  --type analysis \
  --timeout 600
```

### 3.5 定时任务

```bash
# 创建定时任务 (cron 表达式)
node dist/cli/index.js schedule \
  "每日代码清理" \
  "清理未使用的导入和注释" \
  "0 2 * * *" \
  --priority 5
```

### 3.6 查看任务

```bash
# 表格视图 (推荐)
node dist/cli/index.js tot

# 列表视图
node dist/cli/index.js tasks

# 按状态筛选
node dist/cli/index.js tasks --status PENDING

# 按分类筛选
node dist/cli/index.js tasks --category bugfix

# 按标签筛选
node dist/cli/index.js tasks --tag urgent

# JSON 格式输出
node dist/cli/index.js tasks --json
```

### 3.7 自动分类规则

```bash
# 添加自动分类规则
node dist/cli/index.js category-rules add "SQL" security
node dist/cli/index.js category-rules add "内存" performance
node dist/cli/index.js category-rules add "功能" feature

# 列出规则
node dist/cli/index.js category-rules list
```

### 3.8 自动标签规则

```bash
# 添加自动标签规则
node dist/cli/index.js auto-tag-rules create "fix" bugfix
node dist/cli/index.js auto-tag-rules create "test" testing

# 列出规则
node dist/cli/index.js auto-tag-rules list
```

---

## 4. 自主开发工作流

### 4.1 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                    NEZHA 执行流程                            │
│                                                              │
│  1. 添加任务                                                 │
│     CLI ──> Database (tasks 表)                              │
│                                                              │
│  2. 心跳触发 (默认 30 秒一次)                                 │
│     HeartbeatService ──> Scheduler.heartbeat()                │
│                                                              │
│  3. 调度器获取待处理任务                                       │
│     PostgreSQL FOR UPDATE SKIP LOCKED                        │
│                                                              │
│  4. Agent 执行任务                                           │
│     UnifiedAgent ──> OpenCode API ──> LLM                    │
│                                                              │
│  5. AI 自主完成工作                                           │
│     - 读取代码文件                                            │
│     - 修改代码                                                │
│     - 运行测试                                                │
│     - 提交到 Git                                             │
│                                                              │
│  6. 更新任务状态                                             │
│     Database updated ──> COMPLETED/FAILED                    │
│                                                              │
│  7. 保存记忆 (可选)                                          │
│     MemoryService.save() ──> PostgreSQL                      │
│                                                              │
│  8. 等待下一次心跳                                           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 启动自主工作流

```bash
# 启动 Nezha daemon
node dist/cli/index.js start

# 查看状态
node dist/cli/index.js status

# 查看健康信息
node dist/cli/index.js health
```

### 4.3 真实自主开发示例

```bash
# 1. 添加一个复杂的开发任务
node dist/cli/index.js task-add \
  "实现用户认证模块" \
  "实现完整的用户认证系统，包括：
   1. 用户注册 API (POST /api/auth/register)
   2. 用户登录 API (POST /api/auth/login)
   3. JWT Token 生成和验证
   4. 密码加密存储 (bcrypt)
   5. 登录状态检查中间件
   6. 单元测试覆盖率达到 80%
   
   请直接在 src/auth/ 目录下实现，使用 TypeScript。" \
  --priority 10 \
  --type implementation \
  --timeout 1800

# 2. 查看任务执行
node dist/cli/index.js tot

# 3. 查看详细日志
tail -f nezha.log

# 4. 查看 AI 会话日志
cat conversations/2026-03-19/session-xxx.jsonl
```

### 4.4 与 OpenCode 交互

```bash
# 方式 1: 通过 CLI 直接对话
opencode run --attach "这个模块的实现可以优化吗？"

# 方式 2: 通过 HTTP API
curl -X POST http://localhost:4096/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "添加单元测试", "session_id": "xxx"}'

# 方式 3: 在 HEARTBEAT.md 中定义任务
cat > HEARTBEAT.md << 'EOF'
# Tasks

## High Priority
- [ ] Fix critical authentication bug
- [ ] Add unit tests for UserService

## Medium Priority
- [ ] Update API documentation
- [ ] Optimize database queries

## Completed
- [x] Implement login API
EOF
```

### 4.5 持续改进循环

```bash
# 添加持续改进任务
node dist/cli/index.js add-continuous-improvement

# 手动启动一轮改进
node dist/cli/index.js task-add \
  "持续改进循环" \
  "执行以下步骤：
   1. 读取 HEARTBEAT.md 获取任务列表
   2. 按优先级执行任务
   3. 运行测试和构建
   4. 审查并修复问题
   5. 更新 HEARTBEAT.md
   6. 提交并推送更改" \
  --priority 10
```

### 4.6 监控和日志

```bash
# 查看任务统计
node dist/cli/index.js tot

# 查看健康信息
node dist/cli/index.js health

# 查看详细日志
cat nezha.log

# 实时查看日志
tail -f nezha.log | grep -E "(Task|Completed|Failed)"

# 查看 AI 会话
ls -la conversations/
cat conversations/index.json
```

### 4.7 错误处理

```bash
# 重置卡住的任务
psql nezha -c "UPDATE tasks SET status='PENDING' WHERE status='RUNNING';"

# 删除失败的任务
psql nezha -c "DELETE FROM tasks WHERE id='<uuid>';"

# 查看失败任务详情
psql nezha -c "SELECT * FROM tasks WHERE status='FAILED';"
```

---

## 5. 多项目管理

### 5.1 架构方案

```
┌─────────────────────────────────────────────────────────────┐
│                    Nezha Core                               │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Project Manager                          │   │
│   │  - 加载项目配置                                      │   │
│   │  - 管理多个项目                                      │   │
│   │  - 路由到正确的数据库                                │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │   nezha     │     │ cloudbrain  │     │ other-proj  │
   │  .nezha.yml │     │  .nezha.yml │     │  .nezha.yml │
   └─────────────┘     └─────────────┘     └─────────────┘
```

### 5.2 方案 A: 独立数据库 (推荐)

每个项目使用独立的 PostgreSQL 数据库：

```bash
# 为 cloudbrain 创建数据库
createdb nezha_cloudbrain

# 初始化表结构
psql nezha_cloudbrain -f /path/to/nezha/src/db/migrations/001_initial.sql

# 为另一个项目创建数据库
createdb nezha_otherproject
psql nezha_otherproject -f /path/to/nezha/src/db/migrations/001_initial.sql
```

**启动不同项目**：

```bash
# 项目 A (cloudbrain)
DB_NAME=nezha_cloudbrain node dist/cli/index.js start

# 项目 B (otherproject)
DB_NAME=nezha_otherproject node dist/cli/index.js start
```

### 5.3 方案 B: 共享数据库 + Schema

使用 PostgreSQL Schema 隔离项目：

```sql
-- 创建 Schema
CREATE SCHEMA cloudbrain;
CREATE SCHEMA otherproject;

-- 在 Schema 中创建表
CREATE TABLE cloudbrain.tasks (...);
CREATE TABLE otherproject.tasks (...);
```

### 5.4 方案 C: 共享数据库 + 项目字段

在表中添加 `project_id` 字段：

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    title TEXT NOT NULL,
    status TEXT,
    priority INTEGER,
    ...
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
```

### 5.5 项目配置文件

在每个项目中创建 `.nezha.yml`：

```yaml
# cloudbrain/.nezha.yml
project:
  name: cloudbrain
  description: "CloudBrain - AI Cloud Management Platform"
  version: 1.0.0

database:
  host: localhost
  port: 5432
  name: nezha_cloudbrain
  user: ${DB_USER}
  password: ${DB_PASSWORD}

paths:
  root: .
  memory: .nezha/memory/
  skills: .nezha/skills/

task:
  heartbeatIntervalMs: 60000
  maxRetries: 3

ai:
  model: "claude-3.5-sonnet"
```

### 5.6 多项目 CLI 使用

```bash
# 使用环境变量指定项目
export NEZHA_PROJECT_NAME=cloudbrain
export NEZHA_DB_NAME=nezha_cloudbrain

# 添加任务
node dist/cli/index.js task-add "修复登录问题" "用户无法登录" 9

# 切换项目
export NEZHA_PROJECT_NAME=otherproject
export NEZHA_DB_NAME=nezha_otherproject

# 查看其他项目的任务
node dist/cli/index.js tasks
```

### 5.7 PM2 多实例管理

```bash
# 启动 cloudbrain 实例
pm2 start --name cloudbrain-nezha "DB_NAME=nezha_cloudbrain node dist/cli/index.js start"

# 启动 otherproject 实例
pm2 start --name otherproject-nezha "DB_NAME=nezha_otherproject node dist/cli/index.js start"

# 查看所有实例
pm2 status

# 查看特定实例日志
pm2 logs cloudbrain-nezha
```

### 5.8 集中管理面板

创建统一仪表板查看所有项目：

```bash
# 安装 nezha-dashboard
npm install -g nezha-dashboard

# 配置多个实例
nezha-dashboard --instances \
  cloudbrain:http://localhost:4097 \
  otherproject:http://localhost:4098

# 启动仪表板
nezha-dashboard --port 3000
```

### 5.9 多项目任务协调

```bash
# 从任意项目查询
psql nezha_shared -c "
  SELECT p.name, COUNT(t.id) as pending_tasks
  FROM projects p
  LEFT JOIN tasks t ON p.id = t.project_id AND t.status = 'PENDING'
  GROUP BY p.id, p.name;
"
```

### 5.10 多项目最佳实践

| 实践 | 说明 |
|------|------|
| **独立数据库** | 每个项目使用独立数据库，避免相互影响 |
| **统一命名** | 数据库命名规范: `nezha_<project>` |
| **配置分离** | 每个项目有独立 `.nezha.yml` |
| **日志分离** | 使用 PM2 为每个实例命名 |
| **监控集中** | 使用统一仪表板监控所有项目 |

---

## 附录

### A. 常用命令速查

```bash
# 启动服务
npm run start:daemon

# 查看状态
node dist/cli/index.js status

# 健康检查
node dist/cli/index.js health

# 添加任务
node dist/cli/index.js task-add "标题" "描述" 优先级

# 列出任务
node dist/cli/index.js tasks

# 表格视图
node dist/cli/index.js tot

# 模板管理
node dist/cli/index.js templates list
```

### B. 数据库操作

```bash
# 连接到数据库
psql nezha

# 查看任务统计
psql nezha -c "SELECT status, COUNT(*) FROM tasks GROUP BY status;"

# 重置所有运行中的任务
psql nezha -c "UPDATE tasks SET status='PENDING' WHERE status='RUNNING';"

# 查看最近任务
psql nezha -c "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10;"
```

### C. 故障排查

| 问题 | 解决方案 |
|------|---------|
| OpenCode 连接失败 | 确保 `opencode serve --port 4096` 已启动 |
| 数据库连接失败 | 检查 PostgreSQL 是否运行 `pg_isready` |
| 任务卡住 | `UPDATE tasks SET status='PENDING' WHERE status='RUNNING';` |
| 端口占用 | `lsof -i :4096` 检查并杀死进程 |

### D. API 密钥管理

```bash
# 创建 API 密钥
node dist/cli/index.js api-key create myapp --rate 100

# 列出 API 密钥
node dist/cli/index.js api-key list

# 吊销 API 密钥
node dist/cli/index.js api-key revoke myapp
```

### E. 定时任务 Cron 示例

```bash
# 每小时执行一次任务检查
0 * * * * cd /path/to/nezha && node dist/cli/index.js task-check

# 每天早上 9 点开始新任务
0 9 * * * cd /path/to/nezha && node dist/cli/index.js task-add "Daily Review" "Review code" 5

# 每 10 分钟清理孤儿进程
0,10,20,30,40,50 * * * * node dist/cli/process-guardian.js once
```

---

## 下一步

- 阅读 [USER_GUIDE.md](./USER_GUIDE.md) - 完整用户指南
- 阅读 [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - 开发者指南
- 阅读 [MULTI_PROJECT_INTEGRATION.md](./MULTI_PROJECT_INTEGRATION.md) - 多项目集成设计
- 加入社区支持

---

_本教程由 Nezha AI 助手自动生成_
