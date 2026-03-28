# Issue 使用指南

## 概述

Issue 是 Nezha 系统中用于跟踪问题、改进建议、功能请求和讨论的核心机制。本文档说明何时应该创建 issue，以及如何正确分类。

## Issue 类型

### 1. Bug（缺陷）

**何时使用**：发现系统功能异常或错误时

**示例**：
- 功能不按预期工作
- 数据损坏或丢失
- 性能严重下降
- 崩溃或异常退出

**严重程度**：
- `critical`: 系统崩溃、数据丢失、安全漏洞
- `high`: 核心功能无法使用
- `medium`: 功能异常但有临时解决方案
- `low`: 小问题，不影响主要功能
- `cosmetic`: UI/UX 问题，不影响功能

**示例 Issue**：
```
Title: 任务执行时内存泄漏
Type: bug
Severity: high
Description: 执行大量任务时，内存使用持续增长，最终导致 OOM
```

### 2. Feature（新功能）

**何时使用**：需要添加新功能或能力时

**示例**：
- 新增 API 端点
- 新增数据表
- 新增集成能力
- 新增用户界面

**严重程度**：
- `critical`: 核心功能缺失
- `high`: 重要功能需求
- `medium`: 有价值的功能
- `low`: 锦上添花的功能
- `cosmetic`: UI/UX 改进

**示例 Issue**：
```
Title: 添加 WebSocket 实时通知
Type: feature
Severity: medium
Description: 实现实时推送任务状态更新，避免轮询
```

### 3. Improvement（改进）

**何时使用**：优化现有功能或流程时

**示例**：
- 性能优化
- 代码重构
- 文档改进
- 测试覆盖率提升

**严重程度**：
- `critical`: 严重性能问题
- `high`: 明显的性能或质量改进
- `medium`: 中等价值的改进
- `low`: 小改进
- `cosmetic`: 代码风格改进

**示例 Issue**：
```
Title: 优化数据库查询性能
Type: improvement
Severity: medium
Description: 当前查询响应时间过长，需要添加索引和优化查询语句
```

### 4. Proposal（提案）

**何时使用**：提出新想法或架构变更需要讨论时

**示例**：
- 架构重构提案
- 新技术栈引入
- 流程变更建议
- 重大功能设计

**严重程度**：
- `critical`: 紧急架构变更
- `high`: 重要架构决策
- `medium`: 有价值的讨论
- `low`: 探索性想法
- `cosmetic`: 文档改进建议

**示例 Issue**：
```
Title: 迁移到微服务架构
Type: proposal
Severity: high
Description: 讨论将单体应用拆分为微服务的可行性和实施计划
```

### 5. Question（问题）

**何时使用**：需要澄清或讨论系统行为时

**示例**：
- 功能使用疑问
- 架构设计讨论
- 最佳实践咨询
- 技术选型讨论

**严重程度**：
- `critical`: 阻塞性问题
- `high`: 重要问题
- `medium`: 一般问题
- `low`: 小问题
- `cosmetic`: 文档澄清

**示例 Issue**：
```
Title: 如何处理并发任务冲突？
Type: question
Severity: medium
Description: 多个 AI 同时执行任务时，如何避免资源冲突？
```

### 6. Debt（技术债务）

**何时使用**：记录需要后续处理的技术债务时

**示例**：
- 临时解决方案
- 不完善的实现
- 缺失的测试
- 过时的依赖

**严重程度**：
- `critical`: 严重技术债务，影响系统稳定性
- `high`: 重要技术债务
- `medium`: 中等技术债务
- `low`: 小技术债务
- `cosmetic`: 代码清理

**示例 Issue**：
```
Title: 重构 HeartbeatService 的错误处理
Type: debt
Severity: medium
Description: 当前错误处理逻辑分散，需要统一重构
```

### 7. Inconsistency（不一致）

**何时使用**：发现系统行为不一致或矛盾时

**示例**：
- 数据不一致
- API 行为不一致
- 文档与实现不符
- 配置冲突

**严重程度**：
- `critical`: 严重数据不一致
- `high`: 明显的行为不一致
- `medium`: 中等程度的不一致
- `low`: 小不一致
- `cosmetic`: 文档不一致

**示例 Issue**：
```
Title: 任务状态与数据库记录不一致
Type: inconsistency
Severity: high
Description: 任务显示已完成，但数据库中状态仍为 RUNNING
```

---

## Issue 状态流转

```
open → acknowledged → in_progress → resolved
  ↓         ↓              ↓            ↓
  └─────────┴──────────────┴──→ wont_fix
  └────────────────────────────→ duplicate
```

### 状态说明

| 状态 | 说明 |
|------|------|
| `open` | 新创建，等待处理 |
| `acknowledged` | 已确认，准备处理 |
| `in_progress` | 正在处理中 |
| `resolved` | 已解决 |
| `wont_fix` | 不予修复 |
| `duplicate` | 重复问题 |

---

## 与 GitHub Issues 对比

### GitHub Issue 类型

GitHub 使用 **labels** 来分类，常见标签：

| GitHub Label | Nezha issue_type | 说明 |
|--------------|------------------|------|
| `bug` | `bug` | 缺陷 |
| `enhancement` | `improvement` | 改进 |
| `feature` | `feature` | 新功能 |
| `question` | `question` | 问题 |
| `wontfix` | - (status: wont_fix) | 不予修复 |
| `duplicate` | - (status: duplicate) | 重复 |
| `help wanted` | - (assignee_type) | 需要帮助 |
| `good first issue` | - (tags) | 适合新手 |

### Nezha 独有类型

| Nezha 类型 | GitHub 对应 | 说明 |
|-----------|-------------|------|
| `debt` | `technical-debt` label | 技术债务 |
| `proposal` | `discussion` label | 提案讨论 |
| `inconsistency` | 无直接对应 | 数据/行为不一致 |

### Nezha 独有字段

- **severity**: GitHub 无内置，需要自定义 label
- **assignee_type**: GitHub 无，Nezha 支持 `agent`/`human`/`system`
- **discovered_by**: 记录发现者
- **related_issue_id**: 关联 issue
- **task_id**: 关联任务
- **review_id**: 关联代码审查
- **dlq_id**: 关联死信队列

---

## 最佳实践

### 1. 创建 Issue 的时机

**应该创建 Issue**：
- ✅ 发现 bug 或异常行为
- ✅ 需要新功能或改进
- ✅ 发现技术债务
- ✅ 需要讨论架构决策
- ✅ 发现数据不一致
- ✅ 需要跟踪长期任务

**不应该创建 Issue**：
- ❌ 简单的拼写错误（直接修复）
- ❌ 临时的调试信息（直接删除）
- ❌ 个人笔记（使用 memory）
- ❌ 已知的重复问题

### 2. Issue 标题规范

**好的标题**：
- ✅ "任务执行时内存泄漏" - 清晰描述问题
- ✅ "添加 WebSocket 实时通知" - 明确功能需求
- ✅ "优化数据库查询性能" - 具体改进方向

**不好的标题**：
- ❌ "系统有问题" - 太模糊
- ❌ "改进代码" - 不具体
- ❌ "Bug" - 没有描述

### 3. Issue 描述规范

**应该包含**：
- 问题描述
- 复现步骤（如果是 bug）
- 预期行为
- 实际行为
- 环境信息
- 相关日志或截图

**示例**：
```markdown
## 问题描述
执行大量任务时，内存使用持续增长

## 复现步骤
1. 创建 100 个并发任务
2. 观察内存使用
3. 任务完成后内存未释放

## 预期行为
任务完成后内存应该释放

## 实际行为
内存使用持续增长，最终导致 OOM

## 环境信息
- Node.js: v18.17.0
- PostgreSQL: 18.3
- Nezha: v1.0.0

## 相关日志
[2026-03-28 08:00:00] ERROR: JavaScript heap out of memory
```

### 4. Issue 关联

**关联任务**：
```sql
UPDATE issues SET task_id = 'xxx' WHERE id = 'yyy';
```

**关联代码审查**：
```sql
UPDATE issues SET review_id = 'xxx' WHERE id = 'yyy';
```

**关联其他 Issue**：
```sql
UPDATE issues SET related_issue_id = 'xxx' WHERE id = 'yyy';
```

---

## CLI 命令

### 创建 Issue

```bash
# 创建 bug issue
node dist/cli/index.js issue-create "标题" "描述" bug high

# 创建 feature issue
node dist/cli/index.js issue-create "标题" "描述" feature medium

# 创建 improvement issue
node dist/cli/index.js issue-create "标题" "描述" improvement low
```

### 查询 Issue

```bash
# 列出所有 open issue
node dist/cli/index.js issues list --status open

# 列出高严重程度 issue
node dist/cli/index.js issues list --severity high

# 列出特定类型 issue
node dist/cli/index.js issues list --type bug
```

### 更新 Issue

```bash
# 更新状态
node dist/cli/index.js issue-update <id> --status in_progress

# 更新严重程度
node dist/cli/index.js issue-update <id> --severity critical

# 分配给 AI
node dist/cli/index.js issue-update <id> --assignee nezha-daemon
```

---

## 总结

Issue 是 Nezha 系统中跟踪问题和改进的核心机制。正确使用 issue 可以：

1. **系统化跟踪** - 所有问题和改进都有记录
2. **优先级管理** - 通过 severity 排序处理
3. **协作透明** - AI 和人类都能看到问题状态
4. **持续改进** - 记录技术债务和改进机会

记住：**好的 issue 描述 = 更快的解决速度**！

---

## 相关文档

- [Tasks 使用指南](./tasks_guide.md)
- [Code Review 流程](./code_review_process.md)
- [AI 自治原则](../AI_COLLABORATION.md)
