#!/bin/bash
# setup_gitbrains_nezha.sh
# 在 gitbrains 项目中设置 Nezha 集成
# 
# 使用方法:
#   cd /Users/jk/gits/hub/nezha
#   bash scripts/setup_gitbrains_nezha.sh

set -e

GITBRAINS_DIR="/Users/jk/gits/hub/tools_ai/gitbrains"
NEZHA_DIR="/Users/jk/gits/hub/nezha"
TEMP_DIR="$NEZHA_DIR/temp_gitbrains_config"

echo "🚀 Setting up Nezha for GitBrain project..."
echo ""

# 检查目录是否存在
if [ ! -d "$GITBRAINS_DIR" ]; then
    echo "❌ Error: GitBrain directory not found: $GITBRAINS_DIR"
    exit 1
fi

# 1. 创建 .nezha.yml 配置文件
echo "📝 Creating .nezha.yml..."
cat > "$GITBRAINS_DIR/.nezha.yml" << 'EOF'
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
EOF
echo "✅ Created .nezha.yml"

# 2. 创建 .trae 目录和规则文件
echo ""
echo "📋 Creating .trae/rules/project_rules.md..."
mkdir -p "$GITBRAINS_DIR/.trae/rules"

cat > "$GITBRAINS_DIR/.trae/rules/project_rules.md" << 'EOF'
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
EOF
echo "✅ Created .trae/rules/project_rules.md"

# 3. 创建快速启动指南
echo ""
echo "📝 Creating NEZHA_QUICKSTART.md..."
cat > "$GITBRAINS_DIR/NEZHA_QUICKSTART.md" << 'EOF'
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
EOF
echo "✅ Created NEZHA_QUICKSTART.md"

# 4. 清理临时文件
echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf "$TEMP_DIR"
echo "✅ Cleaned up"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📁 Files created in $GITBRAINS_DIR:"
echo "  - .nezha.yml"
echo "  - .trae/rules/project_rules.md"
echo "  - NEZHA_QUICKSTART.md"
echo ""
echo "🚀 Next steps:"
echo "  1. cd $GITBRAINS_DIR"
echo "  2. createdb nezha_gitbrains"
echo "  3. Open project in TraeCN"
echo "  4. Read NEZHA_QUICKSTART.md"
echo "  5. Start improving!"
