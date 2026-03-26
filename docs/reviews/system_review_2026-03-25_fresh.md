# Nezha System Review - Fresh Look (2026-03-25)

> **Approach**: Observe first, ask questions, avoid assumptions

---

## 1. Observed: Dual-Mode Architecture

**What I see**:
- `bootstrap/ESSENTIAL.md` - 冷启动知识
- PostgreSQL 68 tables - 运行时数据
- `conversations/` directory - JSONL 文件

**Question**: 这是"双模式"设计吗？
- 开发/调试模式: 文件系统优先
- 生产模式: PostgreSQL 优先

**Need to confirm**: MEMORY_SYSTEM.md 提到 "Development Mode" vs "Product Mode"，但需要理解具体切换机制。

---

## 2. Observed: conversations 表为空

**What I see**:
- `conversations` 表: 0 条记录
- `conversations/` 目录 (文件系统): 有数据
- `ConversationLogger` 同时写文件和 DB (if DB available)

**Question**: 这是**预期行为**还是**未完成的功能**？

**Possible explanations**:
1. 对话优先写文件，DB 是可选的（优雅降级）
2. 还在从文件迁移到 DB 的过程中
3. 文件系统是主存储，DB 是未来的目标

**Need to confirm**: ConversationLogger 的设计意图是什么？

---

## 3. Observed: reflections 表为空

**What I see**:
- `reflections` 表: 0 条记录
- `memory` 表中有 721 条 `source='reflection-parser'` 的记录
- `memory` 表中有 422 条 `source='areflect'` 的记录

**Question**: 反射系统是用 `memory` 表实现的，还是 `reflections` 表是废弃的？

**Evidence**:
- `docs/AboutTaskReflections.md` 查询: `SELECT content, tags FROM memory WHERE source = 'reflection-parser'`
- 看起来反射确实存在，只是存在 `memory` 表而非 `reflections` 表

---

## 4. Observed: Skills 分类

**What I see**:
- 610 个 skills
- 595 个 category = 空
- 15 个有分类

**Question**: 这是**问题**还是**设计**？

**Possible**:
1. 分类系统还没实现（需要 AI 补全）
2. 故意不分类，让 AI 自己发现和归类
3. category 字段不重要，tag 系统更重要

**Need to confirm**: skills 表的 category 字段用途是什么？

---

## 5. Observed: DATABASE_TABLES 常量 vs 实际表

**What I see**:
- `constants.ts` 定义: ~16 个表
- 实际数据库: 68 个表
- 很多表不在 constants 中: `inter_reviews`, `meetings`, `issues`...

**Question**: 这是**不一致**还是**动态添加**？

**Possible**:
1. constants.ts 是初始设计，后来扩展的表没更新
2. constants.ts 只包含"核心"表，扩展表不需要
3. 应该同步但遗漏了

---

## 6. Observed: agent_soul 表

**What I see**:
- 表存在: `agent_soul`
- 记录数: 0
- 字段: name, purpose, values, constraints, version, scope

**Question**: 这个表的用途是什么？是 Agent 身份系统吗？是否已实现？

---

## 7. 整体观察

**Architecture Strengths**:
- ✅ 分层设计: bootstrap → PostgreSQL
- ✅ 优雅降级: 文件系统作为 fallback
- ✅ 68 个表说明功能丰富
- ✅ 5,375 inter_reviews 表明 AI 协作活跃

**Questions to Resolve**:
1. conversations 表是废弃还是未迁移？
2. reflections 表 vs memory 反射记录的关系？
3. skills 分类是待完成还是不需要？
4. constants.ts 需要同步吗？

---

## Next Steps

在得出结论前，需要向用户确认：
1. conversations 表的设计意图
2. reflections 表的状态
3. skills 分类策略

**不要假设，等用户回答。**
