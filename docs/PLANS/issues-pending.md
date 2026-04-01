# 待处理 Issue 清单

本文档记录文件结构重组过程中发现的问题，需要后续处理。

---

## Issue 1: Piano 依赖 NuPI

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

**严重程度**: 低

**描述**: `src/services/` 中仍有 OpenCode/Pi 相关服务，应该移动到对应子系统。

**位置**:

- `src/services/OpenCodeSessionManager.ts` → 应移至 `piano/src/services/`
- `src/services/OpenCodeReminderService.ts` → 应移至 `piano/src/services/`
- `src/services/PiExecutor.ts` → 应移至 `nupi/src/services/`
- `src/services/PiSDKExecutor.ts` → 应移至 `nupi/src/services/`
- `src/services/TraeSkillSyncService.ts` → 应移至 `nupi/src/services/`
- `src/services/TraeAutoRecoveryService.ts` → 应移至 `nupi/src/services/`

**说明**: 目前这些服务在 src/services/ 中也可以工作（通过复制到子系统），但从架构角度看应该归位。

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
- [ ] 修复 Piano-NuPI 依赖（待处理）
- [ ] 移动服务到子系统（待处理）
- [ ] 确认 auto-reflect 归属（待处理）
