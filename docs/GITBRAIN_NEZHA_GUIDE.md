# GitBrain 项目集成 Nezha 指引

**目标**: 在 GitBrain 项目中使用 Nezha 进行持续质量检查和改进

**创建时间**: 2026-03-16  
**状态**: 可立即执行

---

## 📋 前提条件

### ✅ 已确认

- PostgreSQL 18.3 已安装（`/Applications/Postgres.app/`）
- 数据库 `nezha_gitbrains` 已存在
- Nezha 项目已构建（`/Users/jk/gits/hub/nezha/dist/cli/index.js`）

### 🔍 验证命令

```bash
# 验证 PostgreSQL
/Applications/Postgres.app/Contents/Versions/18/bin/psql --version

# 验证数据库
/Applications/Postgres.app/Contents/Versions/18/bin/psql -l | grep nezha_gitbrains

# 验证 Nezha CLI
node /Users/jk/gits/hub/nezha/dist/cli/index.js help
```

---

## 🚀 执行步骤

### 步骤 1: 创建配置文件

创建 `.nezha.yml` 文件：

```yaml
project:
  name: gitbrains
  description: "GitBrain - AI collaboration system with Maildir communication"
  version: 1.0.0

database:
  host: localhost
  port: 5432
  name: nezha_gitbrains
  user: jk
  password: 

paths:
  root: /Users/jk/gits/hub/tools_ai/gitbrains/GitBrain
  python: .
  docs: docs/
  tests: tests/

qc:
  enabled: true
  checks:
    - type-safety
    - code-style
    - test-coverage
    - documentation
```

### 步骤 2: 创建项目规则文件

创建 `.trae/rules/project_rules.md` 文件：

```markdown
# GitBrain Project Rules

## Project Overview
GitBrain is a Python-based AI collaboration system using Maildir for communication.

## Code Style
- Use Python 3.9+ features
- Follow PEP 8 style guide
- Use type hints for all functions
- Document all public APIs

## Testing
- Use pytest for testing
- Aim for 80% test coverage
- Write unit tests for all modules
- Include integration tests for core features

## Quality Checks
- Run type checking with mypy
- Run linting with ruff
- Run tests with pytest
- Check documentation completeness

## Communication
- Use Maildir for AI-to-AI communication
- Follow the role-based architecture (Coder, Reviewer, Overseer)
- Maintain brainstate files for persistence
```

### 步骤 3: 验证 Nezha CLI 可用

```bash
# 测试 Nezha CLI
node /Users/jk/gits/hub/nezha/dist/cli/index.js help

# 预期输出：
# Nezha CLI - Task automation with continuous improvement
# 
# Usage: nezha <command>
# 
# Commands:
#   start                       Start the heartbeat service
#   stop                        Stop the heartbeat service
#   status                      Show current status
#   health                      Show health information
#   task-add <title> [desc]     Add a new task
#   tasks                       List pending tasks
#   help                        Show this help message
```

### 步骤 4: 添加第一个任务

```bash
# 添加代码质量检查任务
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Review GitBrain code quality" \
  "Review Python code for type hints, documentation, and test coverage" \
  5

# 预期输出：
# Task added: Review GitBrain code quality
```

### 步骤 5: 查看任务列表

```bash
# 查看待处理任务
node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks

# 预期输出：
# Pending tasks:
# 1. Review GitBrain code quality (Priority: 5)
```

### 步骤 6: 开始执行任务

**AI 会自动执行以下步骤**：

1. **读取任务列表**
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks
   ```

2. **分析代码库**
   - 检查 Python 文件的类型提示
   - 检查文档字符串
   - 检查测试覆盖率
   - 识别改进点

3. **执行改进**
   - 添加类型提示
   - 完善文档
   - 编写测试
   - 修复问题

4. **添加后续任务**
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
     "Improve test coverage" \
     "Add unit tests for core modules" \
     3
   ```

---

## 📊 可用的 Nezha CLI 命令

### 1. 查看帮助
```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js help
```

### 2. 添加任务
```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add "<title>" "<description>" <priority>
```

**参数**:
- `title`: 任务标题（必需）
- `description`: 任务描述（可选）
- `priority`: 优先级 0-100（可选，默认 0）

**示例**:
```bash
# 添加高优先级任务
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Fix critical bug" \
  "Fix memory leak in daemon.py" \
  10

# 添加普通任务
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  "Add documentation" \
  "Add API documentation for communication module"
```

### 3. 查看任务列表
```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks
```

### 4. 查看状态
```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js status
```

### 5. 查看健康信息
```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js health
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

## 🔄 持续改进流程

### AI 的工作流程

1. **读取任务**
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks
   ```

2. **选择最高优先级任务**

3. **执行任务**
   - 分析代码
   - 实施改进
   - 运行测试
   - 提交更改

4. **添加新任务**（如果发现新问题）
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
     "<new task title>" \
     "<new task description>" \
     <priority>
   ```

5. **重复步骤 1-4**

---

## 📝 数据库查询

### 查看所有任务

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT id, title, status, priority, created_at FROM tasks ORDER BY priority DESC, created_at;"
```

### 查看待处理任务

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT id, title, priority FROM tasks WHERE status = 'pending' ORDER BY priority DESC;"
```

### 查看已完成任务

```bash
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
  "SELECT id, title, completed_at FROM tasks WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 10;"
```

---

## 🎯 预期结果

执行完成后，应该看到：

```
✅ Configuration files created
✅ Nezha CLI verified
✅ First task added
✅ Task list visible
✅ Ready for continuous improvement

Next steps:
1. AI will read task list
2. AI will execute tasks
3. AI will add new tasks
4. Continuous improvement cycle starts
```

---

## 💡 提示

### 给 AI 的提示

1. **总是先查看任务列表**
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js tasks
   ```

2. **按优先级执行任务**
   - 优先级 8-10: 立即执行
   - 优先级 5-7: 正常执行
   - 优先级 1-4: 有时间时执行

3. **完成后添加新任务**
   - 发现问题时立即添加
   - 设置合理的优先级
   - 写清楚任务描述

4. **使用数据库查询了解状态**
   ```bash
   /Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c \
     "SELECT COUNT(*) FROM tasks WHERE status = 'pending';"
   ```

---

## 🚨 注意事项

### ⚠️ 不要使用未实现的命令

以下命令**不存在**：
- ❌ `load-project` - 未实现
- ❌ `qc` - 未实现
- ❌ `start` - 已实现但需要数据库连接
- ❌ `stop` - 已实现但需要数据库连接

### ✅ 只使用已验证的命令

以下命令**已实现且可用**：
- ✅ `help` - 查看帮助
- ✅ `task-add` - 添加任务
- ✅ `tasks` - 查看任务列表
- ✅ `status` - 查看状态
- ✅ `health` - 查看健康信息

---

## 📞 沟通方式

### AI 之间的沟通

1. **通过数据库**
   ```bash
   # 添加任务
   node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
     "Message from Nezha AI" \
     "This is a message for GitBrain AI" \
     5
   
   # 查看任务
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
