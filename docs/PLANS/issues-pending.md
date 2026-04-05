# 待处理 Issue 清单

> **⚠️ 已过时 (2026-04-05)**: Piano 和 NuPI 已迁移完成，此文档仅作历史参考。

---

## Issue 1: 核心 HeartbeatService 依赖 Piano 子系统

**状态**: ✅ 已解决 (2026-04-02)

**严重程度**: 高

**问题根源**: TaskRouter/TaskCoordinator/TaskPlanner 是 Piano 的任务路由决策，不应该出现在核心 HeartbeatService 中。

**引入时间线**:

| 提交       | 说明                                        |
| ---------- | ------------------------------------------- |
| `9234709d` | 创建 Piano 子系统（正确）                   |
| `f124bdb5` | 错误：把 TaskRouter 集成进 HeartbeatService |
| `7644bf35` | 把 TaskCoordinator 集成进 HeartbeatService  |
| `0cc3e720` | 添加 Pi planner 集成                        |
| `2a731acd` | 添加 TaskPlanner delegation                 |

**错误原因**:

- 核心 vs 子系统边界不清
- 把"功能集成"当成"依赖引入"

**正确做法**:

- HeartbeatService 不应该直接使用 TaskRouter/TaskCoordinator/TaskPlanner
- 应该是可选的插件式集成，或完全解耦通过消息队列

**数据库 Issue**: `c7e9f2a1-3b4d-5c6e-9f8a-1b2c3d4e5f6a`

---

## Issue 2: Piano 依赖 NuPI

**严重程度**: 中

**描述**: Piano 不应该依赖 NuPI（设计不同，会掣肘未来开发），但目前实现中 Piano 直接导入 NuPI 的 PiExecutor。

**位置**:

- `src/piano/executor/PiExecutorWrapper.ts` - 导入 `../../services/PiExecutor.js`
- `src/piano/coordinator/TaskCoordinator.ts` - 使用 PiExecutorWrapper

**建议修复**:

1. 在 Piano 中定义 Pi 执行接口
2. 通过依赖注入解耦
3. 或在 Piano 中内联 Pi 执行逻辑

---

## Issue 2: 服务未完全移动到子系统

**状态**: ✅ 已解决 (2026-04-02)

**说明**: 服务已移动到外部 piano/nupi 仓库。Nezha 核心中不再有 piano/nupi 目录。

---

## 未归类的文件夹

以下文件夹需要确认归属：

| 文件夹           | 当前状态    | 建议                         |
| ---------------- | ----------- | ---------------------------- |
| `auto-reflect/`  | 独立 npm 包 | 保留或移除（独立的反射工具） |
| `bad_examples/`  | 示例代码    | 保留（教学用途）             |
| `bootstrap/`     | 启动配置    | 保留                         |
| `conversations/` | 会话日志    | 保留（运行时生成）           |
| `memory/`        | 短时记忆    | 保留（.tmp 类似）            |
| `skills/`        | 文档        | 保留                         |
| `tasks/`         | 任务数据    | 保留（运行时生成）           |
| `hooks/`         | Git hooks   | 保留（.git 相关）            |

---

## 完成状态

- [x] 删除 sync-mcp-config.ts
- [x] 创建依赖检查文档
- [x] 移动 OpenCode 服务到 piano/src/services/
- [x] 移动 Pi/Trae 服务到 nupi/src/services/
- [x] 确认 auto-reflect 无外部依赖
- [x] 修复 test mock - 添加 AgentIdentityService mock 到 SoulService.test.ts
- [x] 确认 Piano-NuPI 依赖问题 - 实际是导入 src/services (共享核心服务)，非跨子系统依赖
