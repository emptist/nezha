# NuPI 开发者指南

## 架构

```
┌─────────────────────────────────────────────┐
│                  Pi (TUI)                  │
│  - 对话界面                                  │
│  - 工具执行 (bash, read, edit, write)       │
│  - Skill 加载                               │
└──────────────────┬──────────────────────────┘
                   │ 本地调用
                   ▼
┌─────────────────────────────────────────────┐
│              PostgreSQL                     │
│  ┌─────────┬──────────┬──────────┐         │
│  │  tasks  │ memory   │ issues   │ ...     │
│  └─────────┴──────────┴──────────┘         │
└─────────────────────────────────────────────┘
```

## 核心组件

### 1. Pi 扩展 (`extensions/`)

- **nezha-tools.ts**: 直接 SQL 查询 + CLI 命令
- **nezha-autowork.ts**: 永续工作循环

### 2. Skills (`skills/`)

- **nupi-abc.md**: AI 必读知识

### 3. 数据库表

关键表：

| 表名                | 用途        |
| ------------------- | ----------- |
| tasks               | 任务队列    |
| issues              | 问题跟踪    |
| memory              | 长期记忆    |
| reviews             | 代码评审    |
| table_documentation | AI 工具索引 |

## 开发

```bash
# 进入目录
cd ~/gits/hub/nezha/nupi

# 复制扩展到 Pi
cp extensions/*.ts ~/.pi/agent/extensions/

# 复制 skill
cp skills/*.md ~/.pi/agent/skills/

# 重启 Pi
```

## 数据库操作

```typescript
// 直接 SQL (推荐)
import { Client } from 'pg';

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'nezha',
  user: 'postgres',
  password: 'postgres',
});

await client.connect();
const result = await client.query('SELECT * FROM tasks WHERE status = $1', ['PENDING']);
```

## 发布 npm 包

```bash
cd nupi
npm publish --access public
```

安装：

```bash
npm install @nezha/nupi
```

---

_更多技术细节待补充_
