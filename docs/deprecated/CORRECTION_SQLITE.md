# 重要修正说明

**日期**: 2026-03-17  
**问题**: 文档中错误地提到了 SQLite

## 🚨 错误描述

在之前的文档中，我错误地提到 OpenClaw 使用 "文件系统 + SQLite" 作为记忆系统。

## ✅ 正确信息

**Nezha 使用 PostgreSQL 作为数据库**，而不是 SQLite。

### 正确的对比

| 系统 | 记忆系统 |
|------|----------|
| OpenClaw | 文件系统 + 其他存储方式 |
| Nezha | 文件系统 + **PostgreSQL** |

## 📝 已修正的文档

1. ✅ [IMPROVEMENT_PLAN.md](file:///Users/jk/gits/hub/nezha/docs/IMPROVEMENT_PLAN.md)
   - 修正: "文件系统 + SQLite" → "文件系统 + PostgreSQL"

2. ✅ [WORK_SUMMARY_20260317.md](file:///Users/jk/gits/hub/nezha/docs/WORK_SUMMARY_20260317.md)
   - 修正: "文件 + SQLite" → "文件 + PostgreSQL"

3. ✅ [OPENCODE_INTEGRATION_LEARNINGS.md](file:///Users/jk/gits/hub/nezha/docs/OPENCODE_INTEGRATION_LEARNINGS.md)
   - 修正: "File + SQLite" → "File + PostgreSQL"

## 💡 关键要点

- **Nezha 使用 PostgreSQL** 作为主要数据库
- PostgreSQL 提供：
  - 结构化数据存储
  - pgvector 向量搜索
  - 事务支持
  - 高性能查询
- 文件系统用于：
  - HEARTBEAT.md 任务清单
  - memory/ 知识存储
  - conversations/ 对话记录

## 🔄 后续行动

所有文档已修正，确保不再出现 SQLite 的误导性描述。
