# GitBrain Nezha 集成设置

> 复制此文件到 gitbrains 项目，然后在 TraeCN 中打开，AI 会自动执行设置

## 📋 需要创建的文件

### 文件 1: .nezha.yml

**路径**: `/Users/jk/gits/hub/tools_ai/gitbrains/.nezha.yml`

**内容**:
```yaml
project:
  name: gitbrains
  description: "GitBrain - AI collaboration system with Maildir communication"
  version: 1.0.0
  
database:
  host: localhost
  port: 5432
  name: nezha_gitbrains
  user: ${DB_USER:-postgres}
  password: ${DB_PASSWORD}
  
paths:
  root: .
  python: GitBrain/
  swift: swiftgitbrain/
  docs: GitBrain/docs/
  tests: GitBrain/tests/
  
qc:
  enabled: true
  schedule: "0 9 * * *"
  checks:
    - type-safety
    - code-style
    - test-coverage
    - documentation
    
review:
  enabled: true
  schedule: "0 9 * * 1"
  auto_fix: false
  focus_areas:
    - python/roles/
    - swift/Sources/
    - communication/
    
languages:
  python:
    version: "3.13"
    linter: ruff
    formatter: black
    test_runner: pytest
    coverage_target: 80
    
  swift:
    version: "6.0"
    linter: swiftlint
    test_runner: swift test
    coverage_target: 70
    
integrations:
  - type: gitbrain
    enabled: true
    config:
      maildir: GitBrain/maildir/
      brainstates: GitBrain/brainstates/
      roles:
        - coder
        - reviewer
        - overseer
```

---

### 文件 2: .trae/rules/project_rules.md

**路径**: `/Users/jk/gits/hub/tools_ai/gitbrains/.trae/rules/project_rules.md`

**内容**:
```markdown
# GitBrain Project Rules

## Nezha Integration

This project uses Nezha for continuous QC and review.

### What is Nezha?

Nezha is an AI collaboration system that provides:
- **Continuous QC**: Automated code quality checks
- **Test Coverage Monitoring**: Track and improve test coverage
- **Automated Reviews**: Regular code review reports
- **Task Management**: Improvement task queue
- **Memory System**: Persistent knowledge storage

### How to Use Nezha

#### 1. Load Project Configuration

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project /Users/jk/gits/hub/tools_ai/gitbrains
```

#### 2. Check Project Status

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js status --project gitbrains
```

#### 3. Add Improvement Tasks

```bash
# Add a task
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Improve Python type hints" \
  "Add comprehensive type hints to GitBrain/core/*.py" \
  8

# List tasks
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-list --project gitbrains
```

#### 4. Run Quality Checks

```bash
# Run QC
node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains

# Generate report
node /Users/jk/gits/hub/nezha/dist/cli/index.js report --project gitbrains --format html
```

### AI Workflow

When working on gitbrains, follow this workflow:

#### Step 1: Analyze Current State

```bash
# Check Python code quality
cd GitBrain
pytest --cov=. --cov-report=term-missing
ruff check .
black --check .

# Check Swift code quality
cd ../swiftgitbrain
swift test
swiftlint
```

#### Step 2: Identify Issues

Look for:
- **Type Safety**: Missing type hints in Python
- **Test Coverage**: Gaps in test coverage
- **Documentation**: Missing or incomplete docs
- **Code Style**: Style violations
- **Architecture**: Design improvements

#### Step 3: Add Improvement Tasks

```bash
# Python improvements
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add type hints to communication.py" \
  "Add comprehensive type hints to GitBrain/core/communication.py" \
  8

# Swift improvements
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Document Swift protocols" \
  "Add documentation to swiftgitbrain/Sources/GitBrainSwift/Protocols/" \
  7
```

#### Step 4: Execute Improvements

1. Pick a high-priority task
2. Implement the improvement
3. Run tests
4. Commit changes
5. Mark task as completed

### Quality Standards

#### Python Code

- **Test Coverage**: Target 80%
- **Type Hints**: All public functions
- **Documentation**: All modules and classes
- **Code Style**: Black formatting, Ruff linting

#### Swift Code

- **Test Coverage**: Target 70%
- **Documentation**: All protocols and public types
- **Code Style**: SwiftLint compliance

### First Steps

If this is your first time using Nezha with gitbrains:

1. **Load the project**:
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project /Users/jk/gits/hub/tools_ai/gitbrains
   ```

2. **Run initial QC**:
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains
   ```

3. **Review the results** and add improvement tasks

4. **Start improving** the codebase!

### Remember

- Always run tests before committing
- Follow the existing code style
- Document your changes
- Update relevant documentation
- Keep test coverage above 80%

Happy coding! 🚀
```

---

### 文件 3: NEZHA_QUICKSTART.md

**路径**: `/Users/jk/gits/hub/tools_ai/gitbrains/NEZHA_QUICKSTART.md`

**内容**:
```markdown
# Nezha Quick Start Guide for GitBrain

## What Just Happened?

This project has been configured to use Nezha for continuous QC and review.

## Files Created

1. **`.nezha.yml`** - Nezha configuration
2. **`.trae/rules/project_rules.md`** - AI instructions
3. **`NEZHA_QUICKSTART.md`** - This file

## Next Steps

### Step 1: Initialize Database

```bash
cd /Users/jk/gits/hub/tools_ai/gitbrains
createdb nezha_gitbrains
```

### Step 2: Load Project in Nezha

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project /Users/jk/gits/hub/tools_ai/gitbrains
```

### Step 3: Run Initial QC

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains
```

### Step 4: Start Improving

Pick a high-priority task and start working!

## Useful Commands

```bash
# List all tasks
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-list --project gitbrains

# Add a new task
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Task title" \
  "Task description" \
  8

# Generate report
node /Users/jk/gits/hub/nezha/dist/cli/index.js report --project gitbrains

# Run QC
node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains
```

## Need Help?

- Read `.trae/rules/project_rules.md` for detailed instructions
- Visit `/Users/jk/gits/hub/nezha/docs/` for Nezha documentation

---

**Ready to improve gitbrains!** 🚀
```

---

## 🚀 执行步骤

### 步骤 0: 验证 PostgreSQL（已安装）

```bash
# 检查 PostgreSQL 安装
/Applications/Postgres.app/Contents/Versions/18/bin/psql --version

# 验证数据库是否存在
/Applications/Postgres.app/Contents/Versions/18/bin/psql -l | grep nezha_gitbrains

# 如果数据库不存在，创建它
/Applications/Postgres.app/Contents/Versions/18/bin/createdb nezha_gitbrains

# 测试连接
/Applications/Postgres.app/Contents/Versions/18/bin/psql -d nezha_gitbrains -c "SELECT version();"
```

**注意**：PostgreSQL 已作为 application 安装在 `/Applications/Postgres.app/`

### 步骤 1: 创建文件

请 AI 执行以下操作：

1. 创建 `.nezha.yml` 文件
2. 创建 `.trae/rules/` 目录
3. 创建 `.trae/rules/project_rules.md` 文件
4. 创建 `NEZHA_QUICKSTART.md` 文件

### 步骤 2: 初始化数据库

```bash
# PostgreSQL
createdb nezha_gitbrains

# 或 SQLite
sqlite3 nezha_gitbrains.db < /Users/jk/gits/hub/nezha/src/db/migrations/001_initial.sql
```

### 步骤 3: 加载项目

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project /Users/jk/gits/hub/tools_ai/gitbrains
```

### 步骤 4: 运行初始 QC

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains
```

---

## 📝 给 AI 的指令

**当你在 gitbrains 项目中看到这个文件时，请执行以下操作：**

1. **读取上面的文件内容**
2. **创建所有需要的文件**：
   - `.nezha.yml`
   - `.trae/rules/project_rules.md`
   - `NEZHA_QUICKSTART.md`
3. **验证文件创建成功**
4. **初始化数据库**（如果不存在）
5. **加载项目到 Nezha**
6. **运行初始 QC**
7. **报告结果**

---

## ✅ 预期结果

执行完成后，应该看到：

```
✅ Created .nezha.yml
✅ Created .trae/rules/project_rules.md
✅ Created NEZHA_QUICKSTART.md
✅ Database initialized
✅ Project loaded in Nezha
✅ Initial QC completed

Next steps:
1. Review QC results
2. Add improvement tasks
3. Start improving the codebase
```

---

**创建时间**: 2026-03-16  
**状态**: 等待执行
