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

### 6. 添加任务

```bash
node dist/cli/index.js task-add 'Test' 'Say hello' 1
```

### 7. 添加带依赖的任务

```bash
# 首先查看任务ID
node dist/cli/index.js tasks

# 添加依赖任务
node dist/cli/index.js task-add 'Deploy' 'Deploy to production' --priority 10 --depends-on <build-task-id>
node dist/cli/index.js task-add 'Test' 'Run integration tests' --priority 8 --depends-on <build-task-id>
```

## 重要说明

- **OpenCode serve 必须运行**: 任务执行依赖 OpenCode API，必须先启动
- **数据库必须可访问**: 确保 PostgreSQL 正常运行
- **日志位置**: `.nezha.log` - 可使用 `tail -f .nezha.log` 实时查看

## 故障排除

### 检查 PostgreSQL 状态

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/pg_ctl -D /Users/jk/Library/Application\ Support/Postgres/var-18-2 status
```

### 检查 OpenCode serve

```bash
curl http://127.0.0.1:4096/health
```

### 重启服务

```bash
# 停止
pkill -f "node dist/cli/index.js"

# 重新启动
nohup node dist/cli/index.js start > .nezha.log 2>&1 &
```
