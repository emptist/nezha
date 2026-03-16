# Nezha 多项目集成设计

> 让 Nezha 作为独立工具服务多个项目（如 coffeeclaw）

## 问题分析

### 当前限制

**路径依赖问题**:

```typescript
// 当前实现
export class Cli {
  constructor() {
    this.config = Config.getInstance(); // 读取 NEZHA_* 环境变量
  }
  
  private async getDb(): Promise<DatabaseClient> {
    this.db = new DatabaseClient(this.config); // 连接到 Nezha 的数据库
    return this.db;
  }
}
```

**问题**:
1. ❌ 硬编码使用 Nezha 的数据库
2. ❌ 环境变量以 `NEZHA_` 为前缀
3. ❌ 无法区分不同项目
4. ❌ 无法同时服务多个项目

---

## 解决方案

### 方案 A: 项目配置文件（推荐）⭐

#### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    Nezha Core                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Project Manager                                  │   │
│  │  - 加载项目配置                                    │   │
│  │  - 管理多个项目                                    │   │
│  │  - 路由到正确的数据库                              │   │
│  └────────────┬─────────────────────────────────────┘   │
│               │                                          │
│               │ 项目配置                                 │
│               ↓                                          │
└───────────────┼─────────────────────────────────────────┘
                │
        ┌───────┴────────┬──────────────┐
        │                │              │
        ▼                ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   nezha      │ │  coffeeclaw  │ │  other-proj  │
│  .nezha.yml  │ │ .nezha.yml   │ │ .nezha.yml   │
└──────────────┘ └──────────────┘ └──────────────┘
```

#### 配置文件设计

**`.nezha.yml`** - 项目根目录

```yaml
# coffeeclaw/.nezha.yml
project:
  name: coffeeclaw
  description: "CoffeeClaw - AI-powered Feishu bot"
  version: 1.0.0
  
database:
  # 方案 1: 使用项目专属数据库
  host: localhost
  port: 5432
  name: nezha_coffeeclaw  # 项目专属数据库
  user: ${DB_USER}
  password: ${DB_PASSWORD}
  
  # 方案 2: 使用共享数据库，项目隔离
  # host: localhost
  # port: 5432
  # name: nezha_shared
  # schema: coffeeclaw  # PostgreSQL schema 隔离
  
paths:
  root: .  # 项目根目录
  memory: memory/  # 记忆存储路径
  skills: skills/  # 技能目录
  docs: documents/  # 文档目录
  
qc:
  enabled: true
  schedule: "0 9 * * *"  # 每天早上 9 点
  checks:
    - type-safety
    - code-style
    - test-coverage
    - security
    
review:
  enabled: true
  schedule: "0 9 * * 1"  # 每周一早上 9 点
  auto_fix: false  # 只添加任务，不自动修复
  
ai:
  model: "anthropic/claude-3.5-sonnet"
  temperature: 0.7
  max_tokens: 4096
  
integrations:
  - type: openclaw
    enabled: true
    config:
      heartbeat_file: .openclaw/HEARTBEAT.md
      memory_dir: memory/
      
  - type: trae
    enabled: true
    config:
      rules_file: .trae/rules/project_rules.md
```

#### 项目管理器实现

```typescript
// src/core/ProjectManager.ts
import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';

interface ProjectConfig {
  project: {
    name: string;
    description: string;
    version: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    schema?: string;
  };
  paths: {
    root: string;
    memory: string;
    skills: string;
    docs: string;
  };
  qc: QCConfig;
  review: ReviewConfig;
  ai: AIConfig;
  integrations: Integration[];
}

export class ProjectManager {
  private projects: Map<string, ProjectConfig> = new Map();
  private dbs: Map<string, DatabaseClient> = new Map();
  
  async loadProject(projectPath: string): Promise<ProjectConfig> {
    const configPath = path.join(projectPath, '.nezha.yml');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(configContent) as ProjectConfig;
    
    // 替换环境变量
    config.database.user = this.replaceEnvVars(config.database.user);
    config.database.password = this.replaceEnvVars(config.database.password);
    
    // 存储配置
    this.projects.set(config.project.name, config);
    
    return config;
  }
  
  async getDb(projectName: string): Promise<DatabaseClient> {
    if (this.dbs.has(projectName)) {
      return this.dbs.get(projectName)!;
    }
    
    const config = this.projects.get(projectName);
    if (!config) {
      throw new Error(`Project ${projectName} not found`);
    }
    
    const db = new DatabaseClient({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
    });
    
    this.dbs.set(projectName, db);
    return db;
  }
  
  async getProjectPath(projectName: string): Promise<string> {
    const config = this.projects.get(projectName);
    if (!config) {
      throw new Error(`Project ${projectName} not found`);
    }
    return path.resolve(config.paths.root);
  }
  
  private replaceEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '');
  }
}
```

#### CLI 命令扩展

```typescript
// src/cli/index.ts
export class Cli {
  private projectManager: ProjectManager;
  
  constructor() {
    this.projectManager = new ProjectManager();
  }
  
  async loadProject(projectPath: string): Promise<void> {
    const config = await this.projectManager.loadProject(projectPath);
    console.log(`✅ Loaded project: ${config.project.name}`);
  }
  
  async addTask(
    projectName: string,
    title: string,
    description: string,
    priority: number
  ): Promise<void> {
    const db = await this.projectManager.getDb(projectName);
    
    await db.query(
      `INSERT INTO tasks (title, description, status, priority, project) 
       VALUES ($1, $2, $3, $4, $5)`,
      [title, description, TASK_STATUS.PENDING, priority, projectName]
    );
    
    console.log(`✅ Task added to ${projectName}: ${title}`);
  }
  
  async listTasks(projectName: string): Promise<void> {
    const db = await this.projectManager.getDb(projectName);
    
    const result = await db.query(
      `SELECT * FROM tasks WHERE project = $1 AND status = 'pending' 
       ORDER BY priority DESC`,
      [projectName]
    );
    
    console.table(result.rows);
  }
}
```

#### 命令行使用

```bash
# 加载项目
nezha load-project ../coffeeclaw

# 添加任务
nezha task-add coffeeclaw "Fix type errors" "..." 8

# 列出任务
nezha task-list coffeeclaw

# 执行任务
nezha task-execute coffeeclaw <task-id>
```

---

### 方案 B: 环境变量配置

#### 配置方式

```bash
# 在 coffeeclaw 项目中
export NEZHA_PROJECT_NAME=coffeeclaw
export NEZHA_DB_NAME=nezha_coffeeclaw
export NEZHA_PROJECT_ROOT=/Users/jk/gits/hub/coffeeclaw

# 运行 Nezha CLI
node /path/to/nezha/dist/cli/index.js task-add "Fix issues" "..." 7
```

#### 实现代码

```typescript
// src/config/Config.ts
export class Config {
  getProjectName(): string {
    return process.env.NEZHA_PROJECT_NAME || 'default';
  }
  
  getProjectRoot(): string {
    return process.env.NEZHA_PROJECT_ROOT || process.cwd();
  }
  
  getDbConfig(): DbConfig {
    return {
      host: process.env.NEZHA_DB_HOST || 'localhost',
      port: parseInt(process.env.NEZHA_DB_PORT || '5432'),
      database: process.env.NEZHA_DB_NAME || `nezha_${this.getProjectName()}`,
      user: process.env.NEZHA_DB_USER || 'postgres',
      password: process.env.NEZHA_DB_PASSWORD || '',
    };
  }
}
```

---

### 方案 C: API 服务模式

#### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    Nezha API Server                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  REST API                                         │   │
│  │  - POST /api/projects/:name/tasks                │   │
│  │  - GET /api/projects/:name/tasks                 │   │
│  │  - POST /api/projects/:name/qc                   │   │
│  │  - POST /api/projects/:name/review               │   │
│  └────────────┬─────────────────────────────────────┘   │
│               │                                          │
│               │ 项目管理                                 │
│               ↓                                          │
└───────────────┼─────────────────────────────────────────┘
                │
        ┌───────┴────────┬──────────────┐
        │                │              │
        ▼                ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   nezha      │ │  coffeeclaw  │ │  other-proj  │
└──────────────┘ └──────────────┘ └──────────────┘
```

#### API 实现

```typescript
// src/api/server.ts
import express from 'express';
import { ProjectManager } from '../core/ProjectManager.js';

const app = express();
app.use(express.json());

const projectManager = new ProjectManager();

// 加载项目
app.post('/api/projects/load', async (req, res) => {
  const { path } = req.body;
  const config = await projectManager.loadProject(path);
  res.json({ success: true, project: config.project.name });
});

// 添加任务
app.post('/api/projects/:name/tasks', async (req, res) => {
  const { name } = req.params;
  const { title, description, priority } = req.body;
  
  const db = await projectManager.getDb(name);
  await db.query(
    `INSERT INTO tasks (title, description, status, priority, project) 
     VALUES ($1, $2, $3, $4, $5)`,
    [title, description, 'pending', priority, name]
  );
  
  res.json({ success: true, message: 'Task added' });
});

// 列出任务
app.get('/api/projects/:name/tasks', async (req, res) => {
  const { name } = req.params;
  const db = await projectManager.getDb(name);
  
  const result = await db.query(
    `SELECT * FROM tasks WHERE project = $1 AND status = 'pending'`,
    [name]
  );
  
  res.json({ tasks: result.rows });
});

// 执行 QC
app.post('/api/projects/:name/qc', async (req, res) => {
  const { name } = req.params;
  const projectPath = await projectManager.getProjectPath(name);
  
  // 执行代码质量检查
  const report = await executeQC(projectPath);
  
  // 添加改进任务
  for (const issue of report.issues) {
    const db = await projectManager.getDb(name);
    await db.query(
      `INSERT INTO tasks (title, description, status, priority, project) 
       VALUES ($1, $2, $3, $4, $5)`,
      [issue.title, issue.description, 'pending', issue.priority, name]
    );
  }
  
  res.json({ success: true, report });
});

app.listen(3000, () => {
  console.log('Nezha API server running on port 3000');
});
```

#### 使用方式

```bash
# 启动 API 服务
nezha serve --port 3000

# 在 coffeeclaw 项目中调用
curl -X POST http://localhost:3000/api/projects/load \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/jk/gits/hub/coffeeclaw"}'

curl -X POST http://localhost:3000/api/projects/coffeeclaw/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Fix type errors", "description": "...", "priority": 8}'

curl http://localhost:3000/api/projects/coffeeclaw/tasks
```

---

## 实施步骤

### Step 1: 创建配置文件

**在目标项目中创建 `.nezha.yml`**:

```bash
# 示例：在一个新项目中
cd /path/to/your/project
cat > .nezha.yml << 'EOF'
project:
  name: your-project
  description: "Your project description"
  version: 1.0.0
  
database:
  host: localhost
  port: 5432
  name: nezha_your_project
  user: ${DB_USER}
  password: ${DB_PASSWORD}
  
paths:
  root: .
  memory: memory/
  skills: skills/
  docs: docs/
  
qc:
  enabled: true
  schedule: "0 9 * * *"
  checks:
    - type-safety
    - code-style
    - test-coverage
    
review:
  enabled: true
  schedule: "0 9 * * 1"
  auto_fix: false
EOF
```

### Step 2: 创建数据库

```bash
# 创建 coffeeclaw 专属数据库
createdb nezha_coffeeclaw

# 或使用共享数据库
# createdb nezha_shared
# psql nezha_shared -c "CREATE SCHEMA coffeeclaw;"
```

### Step 3: 初始化数据库表

```bash
# 使用 Nezha 的迁移脚本
psql nezha_coffeeclaw -f /Users/jk/gits/hub/nezha/src/db/migrations/001_initial.sql
```

### Step 4: 使用 Nezha

```bash
# 方案 A: 使用配置文件
cd /path/to/your/project
node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project .

# 添加任务
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project your-project \
  "Fix type issues" \
  "Add type annotations to src/*.ts files" \
  8

# 方案 B: 使用环境变量
export NEZHA_PROJECT_NAME=your-project
export NEZHA_DB_NAME=nezha_your_project
export NEZHA_PROJECT_ROOT=/path/to/your/project

node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Improve code quality" \
  "..." \
  7

# 方案 C: 使用 API
nezha serve --port 3000 &
curl -X POST http://localhost:3000/api/projects/load \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/your/project"}'
```

---

## AI 如何在其他项目中使用

### 在 TraeCN 中配置

**`.trae/rules/project_rules.md`**:

```markdown
# Nezha Integration

## Project Configuration
This project uses Nezha for continuous QC and review.

## Available Commands
- Load project: `node /path/to/nezha/dist/cli/index.js load-project .`
- Add task: `node /path/to/nezha/dist/cli/index.js task-add --project your-project "..." "..." 8`
- List tasks: `node /path/to/nezha/dist/cli/index.js task-list --project your-project`

## AI Workflow
When working on this project:
1. Load the project configuration
2. Analyze code quality
3. Add improvement tasks
4. Execute fixes
5. Report results
```

### AI 执行示例

**用户**: "请检查项目的代码质量"

**我**:
```bash
# 1. 加载项目
$ node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project \
  /path/to/your/project
✅ Loaded project: your-project

# 2. 分析代码
$ cd /path/to/your/project
$ npm test
$ npm run lint

# 3. 发现问题
# - 5 个类型错误
# - 3 个 lint 警告

# 4. 添加任务
$ node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project your-project \
  "Fix type issues" \
  "Add type annotations to src/*.ts" \
  8
✅ Task added to your-project: Fix type issues

# 5. 报告
"✅ 已发现 8 个问题，添加了 2 个改进任务"
```

---

## 数据库设计

### 多项目支持

```sql
-- 方案 1: 项目专属数据库
CREATE DATABASE nezha_coffeeclaw;
CREATE DATABASE nezha_other_project;

-- 方案 2: 共享数据库 + 项目字段
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  project VARCHAR(100) NOT NULL,  -- 项目名称
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project);
CREATE INDEX idx_tasks_project_status ON tasks(project, status);

-- 方案 3: PostgreSQL Schema 隔离
CREATE SCHEMA coffeeclaw;
CREATE TABLE coffeeclaw.tasks (...);

CREATE SCHEMA other_project;
CREATE TABLE other_project.tasks (...);
```

---

## 配置管理

### 环境变量

```bash
# ~/.bashrc 或 ~/.zshrc
export NEZHA_HOME=/Users/jk/gits/hub/nezha
export DB_USER=postgres
export DB_PASSWORD=your_password

# 项目特定配置
alias nezha-coffeeclaw='cd /Users/jk/gits/hub/coffeeclaw && node $NEZHA_HOME/dist/cli/index.js'
alias nezha-nezha='cd /Users/jk/gits/hub/nezha && node dist/cli/index.js'
```

### 配置文件查找顺序

```typescript
// src/core/ConfigLoader.ts
export class ConfigLoader {
  async loadConfig(startPath: string): Promise<ProjectConfig> {
    // 1. 查找当前目录的 .nezha.yml
    const localConfig = await this.findConfig(startPath);
    if (localConfig) return localConfig;
    
    // 2. 查找环境变量
    if (process.env.NEZHA_PROJECT_NAME) {
      return this.loadFromEnv();
    }
    
    // 3. 使用默认配置
    return this.getDefaultConfig();
  }
  
  private async findConfig(startPath: string): Promise<string | null> {
    let currentPath = startPath;
    
    while (currentPath !== '/') {
      const configPath = path.join(currentPath, '.nezha.yml');
      if (await fs.exists(configPath)) {
        return configPath;
      }
      currentPath = path.dirname(currentPath);
    }
    
    return null;
  }
}
```

---

## 总结

### ✅ 推荐方案

**方案 A: 项目配置文件** ⭐

**优点**:
- ✅ 配置清晰，易于管理
- ✅ 支持多项目
- ✅ 项目隔离
- ✅ 版本控制友好

**实施步骤**:
1. 在 coffeeclaw 创建 `.nezha.yml`
2. 创建专属数据库 `nezha_coffeeclaw`
3. 初始化数据库表
4. 使用 Nezha CLI

### 🚀 立即可用

```bash
# 在任何项目中
cd /path/to/your/project

# 创建配置文件
cat > .nezha.yml << 'EOF'
project:
  name: your-project
database:
  host: localhost
  port: 5432
  name: nezha_your_project
  user: postgres
  password: ${DB_PASSWORD}
EOF

# 创建数据库
createdb nezha_your_project

# 初始化表
psql nezha_your_project -f /Users/jk/gits/hub/nezha/src/db/migrations/001_initial.sql

# 使用 Nezha
node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project .
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add --project your-project "..." "..." 8
```

**适用场景**:
- ✅ 新项目
- ✅ 没有 OpenClaw 的项目
- ✅ 需要持续 QC 的项目
- ✅ 需要 AI 协作的项目

---

**创建时间**: 2026-03-16  
**作者**: GLM-5  
**状态**: ✅ 设计完成，立即可用
