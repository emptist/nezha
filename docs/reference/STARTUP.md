# Nezha 启动指南

## 标准操作流程

### 1. 启动 PostgreSQL

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18-2 -l /Users/jk/Library/Application\ Support/Postgres/var-18-2/logfile start
```

### 2. 检查数据库连接

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -h 127.0.0.1 -U postgres -d nezha -c 'SELECT 1'
```

### 3. 启动 OpenCode serve（必需）

```bash
nohup opencode serve --port 4096 > /tmp/opencode_server.log 2>&1 &
```

### 4. 启动 Nezha daemon

```bash
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```

### 5. 监控日志

```bash
tail -f .nezha.log
```

### 6. 监控健康状态

```bash
# 健康检查
curl http://localhost:4097/health

# 性能指标
curl http://localhost:4097/metrics
```

### 7. 添加任务

```bash
# 普通任务
node dist/cli/index.js task-add 'Test' 'Say hello' 1

# 带优先级的任务
node dist/cli/index.js task-add 'Review code' 'Review src/core for issues' --priority 5
```

### 8. 添加带依赖的任务

```bash
# 首先查看任务ID
node dist/cli/index.js tasks

# 添加依赖任务
node dist/cli/index.js task-add 'Build' 'Build the project' --priority 10
# 获取 build 任务的 ID，然后添加依赖任务
node dist/cli/index.js task-add 'Deploy' 'Deploy to production' --depends-on <build-task-id>
node dist/cli/index.js task-add 'Test' 'Run integration tests' --priority 8 --depends-on <build-task-id>
```

### 9. 定时任务 (Cron)

```bash
# 每天早上 9 点执行任务
node dist/cli/index.js task-schedule 'Daily Report' 'Send daily report' '0 9 * * *' --priority 5

# 每小时执行任务
node dist/cli/index.js task-schedule 'Hourly Check' 'System health check' '0 * * * *'

# 每周一早上 9 点执行
node dist/cli/index.js task-schedule 'Weekly Review' 'Weekly code review' '0 9 * * 1'
```

## 功能特性

### Checkpoint/Resume (自动恢复)

Nezha 会自动保存状态到 `.tmp/nezha-state.json`:
- OpenCode session ID
- 任务统计
- 运行状态

Daemon 重启时会:
1. 加载之前的状态
2. 将 RUNNING 状态的任务重置为 PENDING
3. 恢复之前的统计

### 健康监控

- **GET /health**: 返回状态、运行时间、任务数、worker 状态
- **GET /metrics**: 返回 tasks_per_hour, avg_task_duration, success_rate

### 断路器 (Circuit Breaker)

如果 OpenCode 服务连续失败 3 次:
- 自动暂停 5 分钟
- 之后进入 half-open 状态尝试恢复
- 恢复后自动关闭断路器

### 死信队列 (Dead Letter Queue)

超过最大重试次数的任务会自动移入死信队列:
```bash
# 查看死信队列
psql -h 127.0.0.1 -U postgres -d nezha -c 'SELECT * FROM dead_letter_queue;'
```

## 重要说明

- **OpenCode serve 必须运行**: 任务执行依赖 OpenCode API，必须先启动
- **数据库必须可访问**: 确保 PostgreSQL 正常运行
- **日志位置**: `.nezha.log` - 可使用 `tail -f .nezha.log` 实时查看
- **状态文件**: `.tmp/nezha-state.json` - 用于断点续传

## 故障排除

### 检查 PostgreSQL 状态

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18-2 status
```

### 检查 OpenCode serve

```bash
curl http://127.0.0.1:4096/health
```

### 检查 Health Server

```bash
curl http://127.0.0.1:4097/health
```

### 重启服务

```bash
# 停止
pkill -f "node dist/cli/index.js"

# 重新启动
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```
