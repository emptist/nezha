-- Add onboarding reminder template
-- This template provides essential knowledge for new AI agents

INSERT INTO reminder_templates (name, priority, template, description)
VALUES (
  'onboarding_reminder',
  10,
  '🤖 **Nezha AI 快速上手指南**

欢迎来到 Nezha！这是你的快速上手指南。

## 🚀 前 5 分钟必做

### 1. 检查身份
```bash
node dist/cli/index.js agents whoami
```

### 2. 检查系统状态
```bash
node dist/cli/index.js status
```

### 3. 检查待处理任务
```bash
node dist/cli/index.js list-tasks
```

### 4. 检查广播消息
```bash
node dist/cli/index.js broadcasts list
```

### 5. 检查讨论
```bash
node dist/cli/index.js meeting list
```

## 📚 最重要的命令

| 命令 | 用途 |
|------|------|
| `node dist/cli/index.js status` | 系统健康检查 |
| `node dist/cli/index.js list-tasks` | 查看工作队列 |
| `node dist/cli/index.js broadcasts list` | 读取其他 AI 的消息 |
| `node dist/cli/index.js learn "学习内容" --context "上下文"` | 保存学习 |
| `node dist/cli/index.js areflect --check` | 检查待处理工作 |

## ⚠️ 关键注意事项

### 提交追溯性
**所有提交必须包含可追溯 ID**：
```bash
# ✅ 正确
git commit -m "feat: 功能 [task: <uuid>]"
git commit -m "fix: 修复 [issue: <uuid>]"

# ❌ 会被阻止 - 没有 ID
git commit -m "feat: 功能"
```

## 🏗️ 架构原则

**三层架构**：核心层 → 集成层 → 支持层

**核心原则**：集成不应该破坏独立性
- ✅ Nezha 可以独立运行
- ✅ OpenCode 可以独立运行
- ✅ 集成是可选的增强功能

## 🎯 设计原则

1. **脚本不应替代 AI 思考** - 机械循环创建内容必须删除
2. **广播仅用于信息传递** - 不应创建任务
3. **AI 优先** - 自动化应辅助 AI，不替代 AI 判断
4. **NEVER DECLARE DONE** - 系统永远不应停止改进

## ⚠️ 常见错误

1. **不检查现有工作** → 先检查 git log 和 memory
2. **错误的数据存储** → 检查现有代码和文档
3. **过早下结论** → 深入调查，验证假设
4. **不协作** → 使用广播、讨论、互评

## 📖 必读文档

1. **[AI_QUICK_START.md](docs/AI_QUICK_START.md)** - 完整快速上手指南
2. **[Read_First.md](Read_First.md)** - 如何启动/重启
3. **[INTEGRATION_ARCHITECTURE.md](docs/INTEGRATION_ARCHITECTURE.md)** - 集成架构原则
4. **[OPENCODE_REMINDER_SYSTEM.md](docs/OPENCODE_REMINDER_SYSTEM.md)** - OpenCode 提醒系统

## 💡 专业提示

1. **实现前先验证** - 检查是否已完成
2. **立即保存学习** - 不要等到最后
3. **积极协作** - 使用广播和讨论
4. **检查进程使用** - 监控系统资源
5. **从错误中学习** - 阅读记忆中的过去问题

## 🔄 当前状态 (2026-03-28)

### 最近完成的工作
- ✅ 架构文档创建
- ✅ OpenCode 提醒系统文档
- ✅ 质量控制钩子
- ✅ 重复问题清理

### 活跃问题
使用 `node dist/cli/index.js issue list` 查看

---

**记住**：目标是持续改进。不要害怕犯错 - 只要从错误中学习并与他人分享！

**NEVER DECLARE DONE** - 系统应该永远继续改进。',
  'New AI onboarding reminder - provides essential knowledge for quick start'
)
ON CONFLICT (name) DO UPDATE
SET template = EXCLUDED.template,
    description = EXCLUDED.description,
    priority = EXCLUDED.priority;
