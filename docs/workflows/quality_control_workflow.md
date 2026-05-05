# 质控工作流 (Quality Control Workflow)

> 从源头到结果全面符合条件才能 commit 代码

---

## 📋 当前状态

### ✅ 已实现

#### 1. Git Hook - Commit 验证

**文件**: `scripts/git-hooks/prepare-commit-msg`

**功能**:
- ✅ 验证 commit message 包含 inter-review ID（强制要求）
- ✅ 验证 commit message 包含 task 或 issue ID（至少一个）
- ✅ 验证所有 ID 存在于数据库中且状态正确
- ✅ 如果验证失败，commit 被阻止

**验证规则**:
```bash
# 必需: inter-review（必须存在且状态为 completed）
[inter-review: <uuid>]

# 必需: task 或 issue（至少一个）
[task: <uuid>]
[issue: <uuid>]

# 有效 commit 示例
git commit -m "feat: add feature [task: 43b880df-9d65-48b2-8747-495f310010c3] [inter-review: abc123]"
git commit -m "fix: bug [issue: def456] [inter-review: abc123]"
```

**验证流程**:
1. **CLI 可用时**: 调用 `nezha validate-commit` 进行严格验证
   - 检查 inter-review 存在且状态为 completed
   - 检查 task/issue 存在
2. **CLI 不可用时**: 回退到简单正则检查（较宽松）

**安装**:
```bash
node dist/cli/index.js setup-hooks
```

#### 2. QC Service - 质控服务

**文件**: `src/services/QCService.ts`

**功能**:
- ✅ 创建 QC review 任务
- ✅ 跟踪 review 状态（pending → in_progress → completed）
- ✅ 记录 findings 和 scores
- ✅ 生成 follow-up tasks
- ✅ 评审者统计和信用

**数据表**: `qc_reviews`

**触发条件**:
- 任务优先级 >= 8
- 修改了 .ts 或 .js 文件
- 手动触发

#### 3. QC Skill - 质控技能

**文件**: `src/db/migrations/031_ai_qc_skill.sql`

**功能**:
- ✅ 定义何时触发 QC
- ✅ 定义检查内容（代码质量、测试覆盖、文档、完整性）
- ✅ 定义报告格式
- ✅ 定义评审流程

**触发条件**:
- **自动触发**: 任务优先级 >= 8，代码变更，高风险任务
- **手动触发**: 用户请求，任务创建者请求

---

## ⚠️ 当前限制（比较宽松）

### 1. 不是所有 commit 都需要 QC Review

**当前状态**:
- ✅ 所有 commit 必须包含 inter-review ID（已强制）
- ✅ 所有 commit 必须包含 task 或 issue ID（至少一个）
- ⚠️ 不是所有 commit 都触发 QC review
- ⚠️ 只有高优先级任务才自动触发 QC

**原因**:
- 避免阻塞所有工作流
- 给 AI 足够的自主性
- 逐步完善系统

### 2. QC Review 不是强制的

**当前状态**:
- ⚠️ QC review 任务可以被忽略
- ⚠️ 没有"QC review 必须通过才能合并"的机制
- ⚠️ 依赖 AI 自觉执行

**原因**:
- 系统还在完善中
- 需要平衡效率和质量
- 避免过度限制

### 3. 没有自动化的质量门禁

**当前状态**:
- ⚠️ 没有自动运行测试
- ⚠️ 没有自动检查代码风格
- ⚠️ 没有自动检查文档完整性

**原因**:
- 需要集成 CI/CD
- 需要定义质量标准
- 需要时间实现

---

## 🔄 未来改进方向

### Phase 1: 增强 Git Hook

**目标**: 更严格的 commit 验证

**改进**:
1. **检查任务状态**
   ```bash
   # 只允许已完成任务的 commit
   if task.status != 'COMPLETED'; then
     echo "Error: Task must be completed before commit"
     exit 1
   fi
   ```

2. **检查测试状态**
   ```bash
   # 必须通过测试
   if ! tests_passed; then
     echo "Error: Tests must pass before commit"
     exit 1
   fi
   ```

3. **检查代码风格**
   ```bash
   # 必须通过 lint
   if ! lint_passed; then
     echo "Error: Code style check failed"
     exit 1
   fi
   ```

### Phase 2: 强制 QC Review

**目标**: 所有代码变更必须通过 QC review

**改进**:
1. **自动创建 QC review 任务**
   ```typescript
   // 在 task complete 时自动创建
   if (task.type === 'code' || task.modifiedFiles?.some(f => f.endsWith('.ts'))) {
     await reviewService.createReview({
       type: 'qc',
       targetId: task.id,
       title: `QC Review: ${task.title}`
     });
   }
   ```

2. **阻止未通过 QC 的 commit**
   ```bash
   # 在 git hook 中检查
   if ! qc_review_passed(task_id); then
     echo "Error: QC review must be passed before commit"
     exit 1
   fi
   ```

3. **QC review 超时机制**
   ```sql
   -- 如果 QC review 超过 1 小时未完成，自动提醒
   SELECT * FROM reviews
   WHERE review_type = 'qc'
     AND status = 'pending'
     AND created_at < NOW() - INTERVAL '1 hour';
   ```

### Phase 3: 自动化质量门禁

**目标**: 自动检查质量标准

**改进**:
1. **集成 CI/CD**
   ```yaml
   # .github/workflows/quality-gate.yml
   name: Quality Gate
   on: [push, pull_request]
   
   jobs:
     quality-check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v2
         - name: Run tests
           run: npm test
         - name: Check coverage
           run: npm run coverage
         - name: Lint check
           run: npm run lint
         - name: Type check
           run: npm run typecheck
   ```

2. **定义质量标准**
   ```json
   {
     "quality_gate": {
       "test_coverage": 80,
       "lint_errors": 0,
       "type_errors": 0,
       "security_issues": 0
     }
   }
   ```

3. **自动阻止低质量代码**
   ```bash
   # 在 git hook 中检查质量门禁
   if ! quality_gate_passed; then
     echo "Error: Quality gate not passed"
     echo "  - Test coverage: ${coverage}% (required: 80%)"
     echo "  - Lint errors: ${lint_errors} (required: 0)"
     exit 1
   fi
   ```

### Phase 4: 完整的 PDCA 循环

**目标**: 从源头到结果的完整质量控制

**流程**:
```
Plan (计划)
  ↓
  创建 Task
  ↓
Do (执行)
  ↓
  编写代码 + 测试
  ↓
Check (检查)
  ↓
  自动化测试 + QC Review
  ↓
Act (行动)
  ↓
  修复问题 + 提交代码
  ↓
  只有全部通过才能 commit
```

**实现**:
```typescript
async function canCommit(taskId: string): Promise<boolean> {
  // 1. 检查任务状态
  const task = await getTask(taskId);
  if (task.status !== 'COMPLETED') return false;
  
  // 2. 检查测试
  const testsPassed = await runTests();
  if (!testsPassed) return false;
  
  // 3. 检查代码风格
  const lintPassed = await runLint();
  if (!lintPassed) return false;
  
  // 4. 检查 QC review
  const qcReview = await getQCReview(taskId);
  if (!qcReview || qcReview.status !== 'completed') return false;
  if (qcReview.overallScore < 70) return false;
  
  // 5. 检查质量门禁
  const qualityGate = await checkQualityGate();
  if (!qualityGate.passed) return false;
  
  return true;
}
```

---

## 📊 质控工作流对比

| 阶段 | 当前状态 | 未来目标 |
|------|---------|---------|
| **源头控制** | ✅ 必须有 ID | ✅ 必须有 ID |
| **执行控制** | ⚠️ 无限制 | 🔄 必须完成任务 |
| **测试控制** | ❌ 无自动化 | 🔄 必须通过测试 |
| **代码风格** | ❌ 无自动化 | 🔄 必须通过 lint |
| **QC Review** | ⚠️ 可选 | 🔄 必须通过 |
| **质量门禁** | ❌ 无 | 🔄 必须通过 |
| **Commit 阻止** | ⚠️ 部分 | 🔄 完全阻止 |

---

## 🎯 实施优先级

### 高优先级（立即实施）

1. **增强 Git Hook**
   - 检查任务状态
   - 检查测试状态（如果有测试）

2. **强制 QC Review**
   - 高优先级任务必须通过 QC
   - 代码变更必须通过 QC

### 中优先级（近期实施）

3. **集成 CI/CD**
   - 自动运行测试
   - 自动检查代码风格

4. **质量门禁**
   - 定义质量标准
   - 自动检查质量门禁

### 低优先级（长期目标）

5. **完整的 PDCA 循环**
   - 从源头到结果的完整控制
   - 自动化所有检查

---

## 💡 设计理念

### 为什么目前比较宽松？

1. **渐进式改进**
   - 避免一次性引入太多限制
   - 给 AI 足够的自主性
   - 逐步完善系统

2. **平衡效率和质量**
   - 过度限制会降低效率
   - 需要找到平衡点
   - 根据实际情况调整

3. **培养习惯**
   - 先让 AI 习惯有 ID 的 commit
   - 再逐步增加其他要求
   - 循序渐进

### 未来目标

> **从源头到结果全面符合条件才能 commit 代码**

- ✅ 源头：必须有 task/issue/inter-review ID
- 🔄 执行：必须完成任务
- 🔄 测试：必须通过测试
- 🔄 风格：必须通过 lint
- 🔄 审查：必须通过 QC review
- 🔄 门禁：必须通过质量门禁

---

## 📚 相关文档

- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - 开发者指南（质控部分）
- [PDCA_CYCLE.md](./PDCA_CYCLE.md) - PDCA 改进循环
- [ISSUE_TRACKING.md](./ISSUE_TRACKING.md) - Issue 跟踪系统
- [ai-qc skill](../src/db/migrations/031_ai_qc_skill.sql) - AI QC 技能定义

---

**最后更新**: 2026-03-28  
**维护者**: Nezha Team
