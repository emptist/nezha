# HEARTBEAT - Nezha 持续改进任务列表

**最后更新**: 2026-03-20T21:43:00Z
**版本**: 1.2

---

## P0 - 最高优先级

### [x] Process Guardian 孤儿进程清理完善
- **描述**: 检查 Process Guardian 是否能正确处理所有孤儿进程场景
- **相关文件**: `src/services/TaskWatchdogService.ts`, `src/cli/process-guardian.ts`
- **状态**: ✅ 已实现并验证 (TaskWatchdogService.getOrphanedProcesses, cleanupOrphanedProcess)

### [x] Inter-Review 集成到改进循环
- **描述**: 将 AI 互相 Review 机制集成到持续改进循环中
- **相关文件**: `src/services/AutoReviewService.ts`
- **状态**: ✅ 已实现 (AutoReviewService 自动触发 reviews 并保存 learnings 到 memory)

### [x] 持续运行验证
- **描述**: 验证 HeartbeatService 持续运行机制
- **状态**: ✅ 已验证 Build 通过, 520 Tests 通过

---

## P1 - 高优先级

### [ ] 提高测试覆盖率 (目标 80%)
- **描述**: 当前测试覆盖率 40.63%，需提升到 80%
- **命令**: `npm run test:coverage`
- **状态**: 进行中（代码覆盖 40.63%，分支 73.72%，函数 68.99%）
  - 新增测试: SkillBuilder.test.ts, SkillReviewer.test.ts, TraeSkillSyncService.test.ts
  - 新增 28 个测试用例 (541 → 548)

### [ ] 完善 Skill System 与 Agent 集成
- **描述**: 完善 Skill System 与 Agent 的集成
- **相关文件**: `docs/SKILL_SYSTEM.md` (只有设计文档，无实现代码)
- **状态**: 待实现 (SkillService.ts 不存在)

---

## P2 - 中优先级

### [ ] 向量搜索 (pgvector) 集成
- **描述**: 完成 pgvector 向量搜索功能
- **相关文件**: `src/services/EmbeddingService.ts`
- **状态**: 设计中

### [ ] 文档清理与整理
- **描述**: 整理 docs/ 目录，删除过时文档
- **状态**: 待执行

---

## 已完成任务

### 2026-03-20
- [x] 新增 SkillBuilder.test.ts (11 tests) - 覆盖 SkillBuilder.ts 72.05%
- [x] 新增 SkillReviewer.test.ts (10 tests) - 覆盖 SkillReviewer.ts 63.12%
- [x] 新增 TraeSkillSyncService.test.ts (7 tests) - 覆盖 TraeSkillSyncService.ts
- [x] 测试覆盖率提升: 37.71% → 40.63%
- [x] 修复 AgentSystem.test.ts 类型错误 ('stdio' 改为 'cli')
- [x] 修复 KnowledgeGraph.test.ts 类型错误 (添加可选链)
- [x] 修复 embedding/index.ts 类型导出 (使用 export type)
- [x] 修复 ai/index.ts 类型导出 (使用 export type)
- [x] 添加 SkillReviewer.reviewBatch 方法
- [x] 验证 541 tests 全部通过
- [x] 修复 CLI 中的类型错误 (LSP缓存问题，已验证build和tests通过)
- [x] 验证 TypeScript 编译无错误
- [x] 验证 520 tests 全部通过
- [x] 验证 InterReview 已集成到改进循环 (AutoReviewService)
- [x] 验证 Process Guardian 孤儿进程清理已实现 (TaskWatchdogService)
- [x] 检查测试覆盖率 (37.71% 语句, 73.92% 分支, 68.27% 函数)
- [x] 比较 OpenClaw vs Nezha 架构差异
- [x] PDCA 循环验证 (Build ✅, Tests ✅, P0 任务 ✅)

### 2026-03-19
- [x] Fix duplicate method calls bug in HeartbeatService
- [x] PostgreSQL 任务表和 heartbeat daemon
- [x] Process Guardian 孤儿进程清理
- [x] Conversation Logging 会话日志
- [x] OpenClaw 持续工作机制研究
- [x] OpenClaw 记忆系统研究
- [x] AI Inter-Review 系统

---

## OpenClaw vs Nezha 功能对比

| 功能 | OpenClaw | Nezha | 状态 |
|------|----------|-------|------|
| 持续运行 | zen AI 实例 | HeartbeatService | ✅ |
| 任务自产生 | AI 循环 | Agent 执行 | ✅ |
| 记忆系统 | 文件 (HEARTBEAT.md) | PostgreSQL + embeddings | ✅ |
| 技能系统 | 有 | 无 | ❌ P1 待实现 |
| AI Code Review | 有 | AutoReviewService | ✅ |

### Nezha 优势
- PostgreSQL 任务存储 (vs 文件)
- 完善的监控服务 (TaskWatchdogService, FailureAlertService, LongTaskManager)
- pgvector 向量搜索支持

### 待实现
- P1: Skill System
- P2: 向量搜索 (pgvector) 完善

---

## 注意事项

1. **执行顺序**: 按 P0 → P1 → P2 顺序执行
2. **每个任务后**: 运行 `npm run build && npm test` 确保质量
3. **完成后**: 更新本文档，记录完成时间和结果
4. **发现问题**: 立即修复，不要推迟

---

*此文件由 Nezha AI Agent 自动维护*
