# HEARTBEAT - Nezha 持续改进任务列表

**最后更新**: 2026-03-20
**版本**: 1.0

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

---

## P1 - 高优先级

### [ ] 提高测试覆盖率 (目标 80%)
- **描述**: 当前测试覆盖率 37.71%，需提升到 80%
- **命令**: `npm run test:coverage`
- **状态**: 待提升（代码覆盖 37.71%，分支 73.92%，函数 68.27%）

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
- [x] 修复 CLI 中的类型错误 (LSP缓存问题，已验证build和tests通过)
- [x] 验证 TypeScript 编译无错误
- [x] 验证 466 tests 全部通过
- [x] 验证 InterReview 已集成到改进循环 (AutoReviewService)
- [x] 验证 Process Guardian 孤儿进程清理已实现 (TaskWatchdogService)

### 2026-03-19
- [x] Fix duplicate method calls bug in HeartbeatService
- [x] PostgreSQL 任务表和 heartbeat daemon
- [x] Process Guardian 孤儿进程清理
- [x] Conversation Logging 会话日志
- [x] OpenClaw 持续工作机制研究
- [x] OpenClaw 记忆系统研究
- [x] AI Inter-Review 系统

---

## 注意事项

1. **执行顺序**: 按 P0 → P1 → P2 顺序执行
2. **每个任务后**: 运行 `npm run build && npm test` 确保质量
3. **完成后**: 更新本文档，记录完成时间和结果
4. **发现问题**: 立即修复，不要推迟

---

*此文件由 Nezha AI Agent 自动维护*
