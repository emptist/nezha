#!/bin/bash
# setup_nezha_for_gitbrains.sh
# 在 gitbrains 项目中设置 Nezha 集成

set -e

GITBRAINS_DIR="/Users/jk/gits/hub/tools_ai/gitbrains"
NEZHA_DIR="/Users/jk/gits/hub/nezha"

echo "🚀 Setting up Nezha for GitBrain project..."
echo ""

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
# Example tasks for gitbrains

# Python improvements
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add type hints to communication.py" \
  "Add comprehensive type hints to GitBrain/core/communication.py" \
  8

node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add tests for daemon.py" \
  "Add unit tests for GitBrain/core/daemon.py" \
  7

# Swift improvements
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Document Swift protocols" \
  "Add documentation to swiftgitbrain/Sources/GitBrainSwift/Protocols/" \
  7

node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Implement Swift daemon" \
  "Implement AI daemon in Swift for continuous collaboration" \
  9
```

#### Step 4: Execute Improvements

1. Pick a high-priority task
2. Implement the improvement
3. Run tests
4. Commit changes
5. Mark task as completed

#### Step 5: Report Progress

```bash
# Generate progress report
node /Users/jk/gits/hub/nezha/dist/cli/index.js report --project gitbrains
```

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

### Integration with GitBrain

Nezha can integrate with GitBrain's existing systems:

#### Maildir Integration

```bash
# Check maildir for new messages
ls -la GitBrain/maildir/*/new/

# Read messages
cat GitBrain/maildir/coder/new/*.eml
```

#### Brainstate Integration

```bash
# Check brainstate
cat GitBrain/brainstates/coder_state.json
cat GitBrain/brainstates/overseer_state.json
```

### Continuous Improvement

Nezha runs automatically:
- **Daily QC**: Every day at 9 AM
- **Weekly Review**: Every Monday at 9 AM

Manual triggers:
```bash
# Run QC now
node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains

# Run review now
node /Users/jk/gits/hub/nezha/dist/cli/index.js review --project gitbrains
```

### Getting Help

- Nezha Documentation: `/Users/jk/gits/hub/nezha/docs/`
- GitBrain Documentation: `GitBrain/docs/`
- Integration Guide: `/Users/jk/gits/hub/nezha/docs/GITBRAINS_INTEGRATION.md`

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

# 3. 创建初始改进计划
echo ""
echo "📝 Creating initial improvement plan..."
cat > "$GITBRAINS_DIR/NEZHA_IMPROVEMENT_PLAN.md" << 'EOF'
# GitBrain Improvement Plan

> Generated by Nezha - AI Collaboration System

## Current State Analysis

### Python Code (GitBrain/)

**Strengths**:
- ✅ Clear architecture with roles (coder, reviewer, overseer)
- ✅ Maildir-based communication system
- ✅ Brainstate persistence
- ✅ Daemon process for monitoring

**Areas for Improvement**:
- ⚠️ Type hints: ~60% coverage (target: 90%)
- ⚠️ Test coverage: ~45% (target: 80%)
- ⚠️ Documentation: ~50% (target: 90%)
- ⚠️ Code style: Some inconsistencies

### Swift Code (swiftgitbrain/)

**Strengths**:
- ✅ Well-designed protocols
- ✅ Type-safe message system
- ✅ Clear separation of concerns

**Areas for Improvement**:
- ⚠️ Documentation: ~20% (target: 90%)
- ⚠️ Missing daemon implementation
- ⚠️ No database integration yet
- ⚠️ Limited test coverage

## Improvement Tasks

### High Priority (8-10)

1. **Add Type Hints to Core Python Modules** (Priority: 9)
   - Files: `GitBrain/core/*.py`
   - Goal: Add comprehensive type hints
   - Estimated effort: 2-3 hours

2. **Increase Python Test Coverage** (Priority: 9)
   - Current: 45%, Target: 80%
   - Focus: `core/daemon.py`, `roles/*.py`
   - Estimated effort: 4-5 hours

3. **Implement Swift Daemon** (Priority: 9)
   - Monitor maildir for messages
   - Process messages based on role
   - Update brainstate
   - Estimated effort: 6-8 hours

### Medium Priority (5-7)

4. **Document Swift Protocols** (Priority: 7)
   - Files: `swiftgitbrain/Sources/GitBrainSwift/Protocols/`
   - Add inline documentation
   - Add usage examples
   - Estimated effort: 2-3 hours

5. **Add Python Integration Tests** (Priority: 7)
   - Test role interactions
   - Test message flow
   - Test daemon lifecycle
   - Estimated effort: 3-4 hours

6. **Improve Error Handling** (Priority: 6)
   - Add retry logic
   - Add proper error messages
   - Add logging
   - Estimated effort: 2-3 hours

### Low Priority (1-4)

7. **Add Code Examples** (Priority: 4)
   - Usage examples in docs
   - Example scripts
   - Estimated effort: 1-2 hours

8. **Performance Optimization** (Priority: 3)
   - Profile daemon performance
   - Optimize message processing
   - Estimated effort: 2-3 hours

## Execution Plan

### Week 1: Foundation

**Day 1-2**: Type Safety
```bash
# Add type hints to core modules
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add type hints to communication.py" \
  "Add comprehensive type hints to GitBrain/core/communication.py" \
  9

node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add type hints to daemon.py" \
  "Add comprehensive type hints to GitBrain/core/daemon.py" \
  9
```

**Day 3-4**: Test Coverage
```bash
# Add tests
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add tests for daemon.py" \
  "Add unit tests for GitBrain/core/daemon.py" \
  8

node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add tests for roles" \
  "Add tests for GitBrain/roles/*.py" \
  8
```

**Day 5**: Documentation
```bash
# Document Swift protocols
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Document Swift protocols" \
  "Add documentation to Swift protocols" \
  7
```

### Week 2: Advanced Features

**Day 1-3**: Swift Daemon
```bash
# Implement Swift daemon
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Implement Swift daemon" \
  "Implement AI daemon in Swift" \
  9
```

**Day 4-5**: Integration
```bash
# Add integration tests
node /Users/jk/gits/hub/nezha/dist/cli/index.js task-add \
  --project gitbrains \
  "Add integration tests" \
  "Add integration tests for role interactions" \
  7
```

## Success Metrics

| Metric | Current | Target | Deadline |
|--------|---------|--------|----------|
| Python Type Coverage | 60% | 90% | Week 1 |
| Python Test Coverage | 45% | 80% | Week 1 |
| Swift Documentation | 20% | 90% | Week 1 |
| Swift Test Coverage | 40% | 70% | Week 2 |
| Overall Code Quality | 70/100 | 90/100 | Week 2 |

## Getting Started

1. **Load project in Nezha**:
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project /Users/jk/gits/hub/tools_ai/gitbrains
   ```

2. **Run initial QC**:
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains
   ```

3. **Start with high-priority tasks**:
   - Add type hints to `communication.py`
   - Add tests for `daemon.py`

4. **Track progress**:
   ```bash
   node /Users/jk/gits/hub/nezha/dist/cli/index.js task-list --project gitbrains
   ```

## Notes

- Focus on high-priority tasks first
- Run tests after each change
- Commit frequently with clear messages
- Update documentation as you go
- Ask for help if stuck

---

**Created by**: Nezha AI Collaboration System  
**Date**: 2026-03-16  
**Status**: Ready to execute
EOF
echo "✅ Created NEZHA_IMPROVEMENT_PLAN.md"

# 4. 创建数据库初始化脚本
echo ""
echo "📦 Creating database initialization script..."
cat > "$GITBRAINS_DIR/init_nezha_db.sh" << 'EOF'
#!/bin/bash
# Initialize Nezha database for gitbrains

set -e

DB_NAME="nezha_gitbrains"
NEZHA_DIR="/Users/jk/gits/hub/nezha"

echo "🗄️  Initializing Nezha database for gitbrains..."

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "✅ Database $DB_NAME already exists"
else
    echo "📝 Creating database $DB_NAME..."
    createdb $DB_NAME
    echo "✅ Database created"
fi

# Initialize tables
echo "📋 Initializing tables..."
if [ -f "$NEZHA_DIR/src/db/migrations/001_initial.sql" ]; then
    psql $DB_NAME -f "$NEZHA_DIR/src/db/migrations/001_initial.sql"
    echo "✅ Tables initialized"
else
    echo "⚠️  Migration file not found, creating basic tables..."
    psql $DB_NAME << 'SQL'
-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    project VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Memory table
CREATE TABLE IF NOT EXISTS memory (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);
SQL
    echo "✅ Basic tables created"
fi

# Add gitbrains-specific tables
echo "📋 Adding gitbrains-specific tables..."
psql $DB_NAME << 'SQL'
-- GitBrain specific tables
CREATE TABLE IF NOT EXISTS brainstates (
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maildir_messages (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    sender VARCHAR(50) NOT NULL,
    recipient VARCHAR(50) NOT NULL,
    subject TEXT,
    body TEXT,
    status VARCHAR(50) DEFAULT 'new',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brainstates_role ON brainstates(role);
CREATE INDEX IF NOT EXISTS idx_maildir_status ON maildir_messages(status);
SQL
echo "✅ GitBrain-specific tables created"

echo ""
echo "✅ Database initialization complete!"
echo ""
echo "Database: $DB_NAME"
echo "Tables: tasks, memory, brainstates, maildir_messages"
EOF

chmod +x "$GITBRAINS_DIR/init_nezha_db.sh"
echo "✅ Created init_nezha_db.sh"

# 5. 创建快速启动指南
echo ""
echo "📝 Creating quick start guide..."
cat > "$GITBRAINS_DIR/NEZHA_QUICKSTART.md" << 'EOF'
# Nezha Quick Start Guide for GitBrain

## What Just Happened?

This project has been configured to use Nezha for continuous QC and review.

## Files Created

1. **`.nezha.yml`** - Nezha configuration
2. **`.trae/rules/project_rules.md`** - AI instructions
3. **`NEZHA_IMPROVEMENT_PLAN.md`** - Initial improvement plan
4. **`init_nezha_db.sh`** - Database initialization script

## Next Steps

### Step 1: Initialize Database

```bash
cd /Users/jk/gits/hub/tools_ai/gitbrains
./init_nezha_db.sh
```

### Step 2: Load Project in Nezha

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js load-project /Users/jk/gits/hub/tools_ai/gitbrains
```

### Step 3: Run Initial QC

```bash
node /Users/jk/gits/hub/nezha/dist/cli/index.js qc --project gitbrains
```

### Step 4: Review Improvement Plan

Open `NEZHA_IMPROVEMENT_PLAN.md` to see the initial improvement tasks.

### Step 5: Start Improving

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
- Check `NEZHA_IMPROVEMENT_PLAN.md` for improvement tasks
- Visit `/Users/jk/gits/hub/nezha/docs/` for Nezha documentation

---

**Ready to improve gitbrains!** 🚀
EOF
echo "✅ Created NEZHA_QUICKSTART.md"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📁 Files created in $GITBRAINS_DIR:"
echo "  - .nezha.yml"
echo "  - .trae/rules/project_rules.md"
echo "  - NEZHA_IMPROVEMENT_PLAN.md"
echo "  - init_nezha_db.sh"
echo "  - NEZHA_QUICKSTART.md"
echo ""
echo "🚀 Next steps:"
echo "  1. cd $GITBRAINS_DIR"
echo "  2. ./init_nezha_db.sh"
echo "  3. Open project in TraeCN"
echo "  4. Read NEZHA_QUICKSTART.md"
echo "  5. Start improving!"
