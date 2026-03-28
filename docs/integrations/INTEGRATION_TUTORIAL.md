# Nezha 使用教程：作为产品赋能客户项目开发

> **场景**: 你是一个开发团队，想用 Nezha 帮助开发客户项目（如 cloudbrain）。本教程展示如何将 Nezha 作为 AI 开发助手产品部署到任何项目中。

---

## 核心概念

```
┌─────────────────────────────────────────────────────────────┐
│                      你的客户项目                            │
│                   /Users/jk/gits/hub/cloudbrain/           │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Nezha 开发助手 (子模块)                 │   │
│   │                                                     │   │
│   │   ├── nezha/                    # 核心代码          │   │
│   │   ├── .env                      # 配置 (API keys)   │   │
│   │   ├── tasks/                    # 任务队列          │   │
│   │   └── memory/                   # 项目知识库         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   目标: 让 AI 自动完成代码、测试、文档、代码审查             │
└─────────────────────────────────────────────────────────────┘
```

---

## 快速部署 (5分钟启动)

### 步骤 1: 进入客户项目目录

```bash
cd /Users/jk/gits/hub/cloudbrain
```

### 步骤 2: 克隆 nezha 作为子模块

```bash
git submodule add https://github.com/your-org/nezha.git nezha
```

### 步骤 3: 安装依赖并编译

```bash
cd nezha
npm install
npm run build
```

### 步骤 4: 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 API keys
```

### 步骤 5: 启动 PostgreSQL

```bash
# macOS (Postgres.app)
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18-2 start

# Linux/Ubuntu
sudo systemctl start postgresql
```

### 步骤 6: 启动 OpenCode Server

```bash
nohup opencode serve --port 4096 > /tmp/opencode.log 2>&1 &
```

### 步骤 7: 启动 Nezha Daemon

```bash
nohup node dist/cli/index.js start > nezha.log 2>&1 &
```

### 步骤 8: 验证服务

```bash
# 检查 PostgreSQL
psql -h localhost -U postgres -d cloudbrain -c "SELECT 1;"

# 检查 OpenCode Server
curl http://localhost:4096/health

# 检查 Nezha
curl http://localhost:4097/health
```

---

## 使用流程

### 1. 添加开发任务

```bash
# 进入 nezha 目录
cd /Users/jk/gits/hub/cloudbrain/nezha

# 添加任务
node dist/cli/index.js task-add "实现用户认证 API" \
  "为 cloudbrain 项目实现以下 API:
   - POST /api/auth/register - 用户注册
   - POST /api/auth/login - 用户登录
   - GET /api/auth/me - 获取当前用户信息
   使用 JWT 进行身份验证" \
  10

# 查看任务列表
node dist/cli/index.js tasks
```

### 2. 查看任务状态

```bash
# 查看所有任务
node dist/cli/index.js task-list

# 查看特定任务详情
node dist/cli/index.js task-get <task-id>

# 实时查看日志
tail -f nezha.log
```

### 3. 与 AI 交互

```bash
# 方式 A: 通过 CLI 直接对话 (适合快速询问)
opencode run --attach "这个模块的逻辑可以优化吗？"

# 方式 B: 通过 API (适合集成到其他系统)
curl -X POST http://localhost:4097/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "添加单元测试覆盖率达到 80%", "task_id": "xxx"}'
```

### 4. 监控进度

```bash
# 查看数据库中的任务状态
psql -h localhost -U postgres -d cloudbrain -c \
  "SELECT status, COUNT(*) FROM tasks GROUP BY status;"

# 查看最近活动
tail -100 nezha.log | grep -E "(Task|Completed|Failed)"
```

---

## 自动化工作流配置

### 配置定时任务 (CI/CD 集成)

```bash
# 编辑 crontab
crontab -e

# 每小时检查一次任务，确保持续开发
0 * * * * cd /path/to/cloudbrain/nezha && node dist/cli/index.js task-check

# 每天早上 9 点开始新任务
0 9 * * * cd /path/to/cloudbrain/nezha && \
  node dist/cli/index.js task-add "Daily standup tasks" "检查代码质量，更新文档，处理 issues"
```

### 配置 Git 自动提交

Nezha 会自动在任务完成后提交代码。配置远程仓库：

```bash
cd /path/to/cloudbrain
git remote add origin git@github.com:your-org/cloudbrain.git

# 首次推送
git push -u origin main
```

### 配置 Slack/飞书通知

编辑 `nezha/.env`:

```bash
SLACK_WEBHOOK=https://hooks.slack.com/services/xxx
SLACK_CHANNEL=#dev-ai
```

---

## 多项目管理

### 在同一台机器上运行多个 Nezha 实例

```bash
# 项目 A
cd /path/to/project-a/nezha
PORT=4097 DATABASE_URL=... node dist/cli/index.js start

# 项目 B (使用不同端口)
cd /path/to/project-b/nezha
PORT=4098 DATABASE_URL=... node dist/cli/index.js start

# 项目 C (使用不同端口)
cd /path/to/project-c/nezha
PORT=4099 DATABASE_URL=... node dist/cli/index.js start
```

### 中央管理面板

创建 `nezha-dashboard` 统一查看所有项目：

```bash
# 安装 dashboard
npm install -g nezha-dashboard

# 配置多个实例
nezha-dashboard --instances \
  project-a:http://localhost:4097 \
  project-b:http://localhost:4098 \
  project-c:http://localhost:4099
```

---

## 最佳实践

### 1. 项目初始化清单

```bash
# 在客户项目首次部署时运行
node << 'EOF'
const fs = require('fs');
const checklist = [
  "✓ PostgreSQL 已安装并运行",
  "✓ OpenCode Server 已启动",
  "✓ Nezha Daemon 已启动",
  "✓ .env 配置完成",
  "✓ 数据库迁移已运行",
  "✓ Git 仓库已初始化",
  "✓ Slack/Webhook 已配置",
  "✓ 第一个任务已添加"
];
console.log(checklist.join('\n'));
EOF
```

### 2. 任务设计原则

```
好任务 ✓                    差任务 ✗
─────────────────────────────────────────
"实现用户注册 API"          "开发项目"
"添加登录表单验证"          "做点测试"
"修复支付模块 bug #123"     "优化代码"
"更新 API 文档"            "完成任务"
```

### 3. 监控指标

| 指标           | 目标    | 告警阈值 |
| -------------- | ------- | -------- |
| 任务成功率     | > 80%   | < 50%    |
| 平均任务时间   | < 5分钟 | > 30分钟 |
| 每日完成任务数 | > 10    | < 3      |
| 内存使用率     | < 70%   | > 90%    |

---

## 故障排查

### 服务无响应

```bash
# 检查端口占用
lsof -i :4096  # opencode
lsof -i :4097  # nezha
lsof -i :5432  # postgres

# 重启服务
pkill -f "opencode serve"
pkill -f "nezha"
nohup opencode serve --port 4096 > /tmp/opencode.log 2>&1 &
nohup node dist/cli/index.js start > nezha.log 2>&1 &
```

### 任务卡住

```bash
# 重置所有运行中的任务
psql -h localhost -U postgres -d cloudbrain -c \
  "UPDATE tasks SET status='PENDING' WHERE status='RUNNING';"

# 删除卡住的任务
psql -h localhost -U postgres -d cloudbrain -c \
  "DELETE FROM tasks WHERE id='xxx';"
```

### 数据库连接失败

```bash
# 检查 PostgreSQL
pg_isready -h localhost -p 5432

# 测试连接
psql -h localhost -U postgres -d cloudbrain -c "SELECT 1;"
```

---

## 交付清单

给客户交付时，确保以下都已完成：

- [ ] PostgreSQL 数据库已初始化
- [ ] 所有依赖已安装 (`npm install`)
- [ ] `.env` 已配置 (API keys 已填入)
- [ ] 首次任务已添加并测试
- [ ] 监控告警已配置
- [ ] 文档已交付 (README + 本教程)
- [ ] Git 仓库已初始化并推送
- [ ] 客户已培训 (15分钟演示)

---

## 下一步

1. **阅读完整文档**: `nezha/docs/`
2. **API 参考**: `nezha/docs/API.md`
3. **二次开发**: `nezha/src/core/` - 修改核心逻辑
4. **社区支持**: GitHub Issues / Slack Channel

---

_本教程由 Nezha AI 助手自动生成_
