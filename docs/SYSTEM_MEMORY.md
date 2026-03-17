# Nezha 系统记忆

**创建日期**: 2026-03-17  
**目的**: 存储关键配置信息，避免重复询问用户

---

## 🗄️ 数据库配置

### PostgreSQL 安装信息

- **安装方式**: macOS Application (Postgres.app)
- **版本**: 18
- **二进制路径**: `/Applications/Postgres.app/Contents/Versions/18/bin/`
- **数据目录**: `~/Library/Application Support/Postgres/var-18/`
- **配置文件**: `~/Library/Application Support/Postgres/var-18/pg_hba.conf`

### 认证方式

- **当前**: Keychain 认证
- **问题**: 命令行工具和 Node.js 不支持
- **解决**: 需要修改 pg_hba.conf 为 trust 认证

### 连接配置

```bash
# .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nezha
DB_USER=postgres
DB_PASSWORD=  # 留空，使用 trust 认证
```

---

## 🤖 OpenCode 配置

### API 信息

- **Provider ID**: opencode
- **Model ID**: big-pickle
- **Agent**: build
- **Mode**: build

### 会话文件

- **位置**: `.tmp/nezha_session_*.json`
- **格式**: JSON
- **用途**: 存储对话历史和任务执行记录

---

## 📁 项目结构

### 关键目录

```
nezha/
├── src/
│   ├── core/
│   │   ├── Agent.ts
│   │   ├── Scheduler.ts
│   │   ├── HeartbeatService.ts
│   │   ├── MemoryService.ts
│   │   ├── ConversationLogger.ts
│   │   └── OpenCodeClient.ts
│   ├── db/
│   │   └── DatabaseClient.ts
│   └── config/
│       └── Config.ts
├── docs/
│   ├── IMPROVEMENT_PLAN.md
│   ├── DUAL_MODE_MEMORY_DESIGN.md
│   ├── DUAL_MODE_CONVERSATION_DESIGN.md
│   ├── CONTINUOUS_IMPROVEMENT_SYSTEM.md
│   └── POSTGRESQL_CONFIG_GUIDE.md
├── conversations/
│   ├── YYYY-MM-DD/
│   │   └── session-*.jsonl
│   └── index.json
├── memory/
│   ├── HEARTBEAT.md
│   └── *.md
└── .tmp/
    └── nezha_session_*.json
```

---

## 🔧 已知问题

### 1. 数据库连接

- **问题**: PostgreSQL 认证配置不正确
- **影响**: 无法使用数据库功能
- **解决**: 修改 pg_hba.conf 为 trust 认证
- **优先级**: HIGH

### 2. OpenCode API

- **问题**: API 未配置
- **影响**: 无法使用 OpenCode 集成
- **解决**: 配置 API URL 和认证
- **优先级**: HIGH

### 3. 持续工作

- **问题**: HeartbeatService 未运行
- **影响**: 无法持续工作
- **解决**: 修复数据库后启动
- **优先级**: HIGH

---

## 💡 关键决策

### 1. 双模式设计

- **开发模式**: 使用文件系统
  - 原因: 可能连数据库都连不上
  - 优势: 不依赖数据库，随时可用
  
- **产品模式**: 仅使用数据库
  - 原因: 不能污染客户项目
  - 优势: 数据隔离，多项目支持

### 2. 持续改进模式

- **选择**: 持续改进模式
- **原因**: 最适合 Nezha 的自主工作目标
- **特点**: AI 自主识别、执行、评审、学习

### 3. 对话记录

- **格式**: JSONL
- **位置**: conversations/YYYY-MM-DD/session-*.jsonl
- **索引**: conversations/index.json

---

## 📊 进度跟踪

### 已完成

- [x] 对话记录系统
- [x] OpenCode 客户端
- [x] 双模式记忆设计
- [x] 双模式对话设计
- [x] 持续改进系统设计

### 进行中

- [ ] PostgreSQL 配置修改
- [ ] 数据库连接测试
- [ ] OpenCode API 配置

### 待开始

- [ ] 持续工作启动
- [ ] 初始任务添加
- [ ] 自主学习实现

---

## 🎯 下一步行动

1. **用户操作**: 修改 pg_hba.conf 为 trust 认证
2. **AI 操作**: 测试数据库连接
3. **AI 操作**: 配置 OpenCode API
4. **AI 操作**: 启动持续工作模式

---

**重要**: 此文件记录关键信息，避免重复询问用户。每次遇到问题，先查看此文件。
