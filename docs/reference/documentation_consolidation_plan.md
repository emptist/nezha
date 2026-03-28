# Documentation Consolidation Plan - 文档整合方案

> **创建日期**: 2026-03-28
> **状态**: 提案
> **目标**: 减少文档数量，提高可维护性

## 当前状态

| 目录 | 文件数 | 说明 |
|------|--------|------|
| docs/ (根目录) | ~90 | 核心文档 |
| docs/reviews/ | ~50 | 评审报告 |
| docs/PLANS/ | 5 | 计划文档 |
| docs/INCIDENTS/ | 1 | 事故报告 |
| docs/issues/ | 3 | Issue 文档 |
| docs/features/ | 2 | 功能设计 |
| docs/guides/ | 2 | 指南 |
| docs/workflows/ | 1 | 工作流 |
| docs/cleanup/ | 1 | 清理文档 |
| docs/improvements/ | 1 | 改进文档 |
| docs/patterns/ | 1 | 模式文档 |
| **总计** | **~157** | |

---

## 整合方案

### 1. 合并相似主题文档

| 合并前 | 合并后 | 节省 |
|--------|--------|------|
| `AI_COLLABORATION.md` | `AI_COLLABORATION.md` (合并版) | -2 文件 |
| `AI_COLLABORATION_GUIDE.md` | ↑ | |
| `AI_COLLABORATION_TUTORIAL.md` | ↑ | |
| `MEMORY_SYSTEM.md` | `MEMORY_SYSTEM.md` (合并版) | -2 文件 |
| `MEMORY_SYSTEM_COMPARISON.md` | ↑ | |
| `DUAL_MODE_MEMORY_DESIGN.md` | ↑ | |
| `OPENCLAW_*.md` (4个) | `OPENCLAW_INTEGRATION.md` | -3 文件 |
| `NUPI*.md` (4个中文) | `NUPI_GUIDE.md` | -3 文件 |
| `LEARNING_*.md` (多个) | `LEARNING_SYSTEM.md` | -3 文件 |

**预计节省**: ~13 文件

### 2. 归档历史文档

创建 `docs/archive/` 目录结构：

```
docs/archive/
├── 2026-03/
│   ├── reviews/
│   │   ├── system_review_2026-03-*.md (合并)
│   │   └── daily_summary_2026-03-28.md
│   ├── plans/
│   │   ├── rename-*.md (已实现)
│   │   └── share-vs-areflect.md (已决定)
│   └── incidents/
│       └── premature-deprecation-reflect.md (已解决)
└── 2026-02/
    └── ...
```

**归档规则**:
- reviews/ 超过 30 天的报告
- PLANS/ 已实现或已决定的计划
- INCIDENTS/ 已解决的事故

**预计归档**: ~40 文件

### 3. 删除冗余文档

| 文件 | 原因 |
|------|------|
| `WORK_SUMMARY_20260317.md` | 内容已过时 |
| `REVIEW_2026-03-18_AI_ASSISTANT.md` | 被 reviews/ 替代 |
| `IMPROVEMENT_PLAN_2026-03-18_AI_ASSISTANT.md` | 已完成 |
| `SESSION_RESEARCH_2026-03-20.md` | 内容已整合 |

**预计删除**: ~10 文件

### 4. 重组目录结构

**目标结构**:

```
docs/
├── README.md                    # 文档索引
├── getting-started/             # 入门
│   ├── QUICK_CHARGE_GUIDE.md
│   ├── AI_QUICK_START.md
│   └── NEW_AI_ONBOARDING.md
├── architecture/                # 架构
│   ├── ARCHITECTURE.md
│   ├── INTEGRATION_ARCHITECTURE.md
│   └── SERVICE_CATALOG.md
├── guides/                      # 指南
│   ├── DEVELOPER_GUIDE.md
│   ├── USER_GUIDE.md
│   ├── AI_COLLABORATION.md      # 合并版
│   └── SOP.md
├── systems/                     # 系统文档
│   ├── MEMORY_SYSTEM.md         # 合并版
│   ├── SKILL_SYSTEM.md
│   ├── BROADCAST_SYSTEM.md
│   ├── WEBHOOK_SYSTEM.md
│   └── AREFLECT.md
├── features/                    # 功能设计
│   ├── learning_memory_metabolism.md
│   └── dynamic_reminder_templates.md
├── integrations/                # 集成文档
│   ├── OPENCODE_INTEGRATION.md
│   ├── OPENCLAW_INTEGRATION.md  # 合并版
│   ├── NUPI_GUIDE.md            # 合并版
│   └── TRAE_COMPATIBILITY.md
├── reference/                   # 参考
│   ├── AGENT_ID_SYSTEM.md
│   ├── ISSUE_TRACKING.md
│   ├── PDCA_CYCLE.md
│   └── NEVER_DECLARE_DONE.md
├── archive/                     # 归档
│   └── YYYY-MM/
│       ├── reviews/
│       ├── plans/
│       └── incidents/
└── reviews/                     # 当前月份评审
    └── (当月报告)
```

---

## 实施步骤

### Phase 1: 创建新目录结构（低风险）

```bash
mkdir -p docs/{getting-started,architecture,guides,systems,features,integrations,reference,archive}
```

### Phase 2: 移动和合并文档（中风险）

1. 移动文档到新目录
2. 合并相似主题文档
3. 更新内部链接

### Phase 3: 归档历史文档（低风险）

1. 创建 archive/YYYY-MM/ 结构
2. 移动旧报告到归档目录
3. 创建归档索引

### Phase 4: 删除冗余文档（中风险）

1. 确认无引用
2. 删除冗余文档
3. 更新 README

### Phase 5: 创建文档索引（低风险）

创建 `docs/README.md` 作为文档导航入口。

---

## 预期效果

| 指标 | 当前 | 整合后 |
|------|------|--------|
| 总文档数 | ~157 | ~80 |
| 根目录文档 | ~90 | ~10 |
| 目录层级 | 2 | 2 |
| 查找时间 | 高 | 低 |
| 维护成本 | 高 | 低 |

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 链接失效 | 中 | 使用相对路径，批量更新 |
| 内容丢失 | 低 | 先归档，后删除 |
| 用户困惑 | 低 | 创建清晰的 README |

---

## 下一步

1. 确认整合方案
2. 创建新目录结构
3. 开始移动和合并文档
4. 测试链接
5. 更新 README

---

## 附录：文档分类详情

### 入门文档 (getting-started/)
- QUICK_CHARGE_GUIDE.md
- AI_QUICK_START.md
- NEW_AI_ONBOARDING.md

### 架构文档 (architecture/)
- ARCHITECTURE.md
- INTEGRATION_ARCHITECTURE.md
- SERVICE_CATALOG.md

### 指南文档 (guides/)
- DEVELOPER_GUIDE.md
- USER_GUIDE.md
- AI_COLLABORATION.md (合并 GUIDE + TUTORIAL)
- SOP.md

### 系统文档 (systems/)
- MEMORY_SYSTEM.md (合并 COMPARISON + DUAL_MODE)
- SKILL_SYSTEM.md
- BROADCAST_SYSTEM.md
- WEBHOOK_SYSTEM.md
- AREFLECT.md
- REFLECTION_SYSTEM.md

### 集成文档 (integrations/)
- OPENCODE_INTEGRATION.md
- OPENCLAW_INTEGRATION.md (合并 AUTOMATION + CORE + VS_NEZHA)
- NUPI_GUIDE.md (合并 4 个 NUPI 文档)
- TRAE_COMPATIBILITY.md
- OPENCODE_VS_TRAE.md

### 参考文档 (reference/)
- AGENT_ID_SYSTEM.md
- ISSUE_TRACKING.md
- PDCA_CYCLE.md
- NEVER_DECLARE_DONE.md
- LEARNED_PATTERNS.md
- DECISION_FRAMEWORK.md
