# 依赖性检查报告

## 概述

本文档记录各代码文件夹的外部依赖情况，用于确保 nezha core 不依赖外部 AI 软件。

---

## 1. src/core/

### 依赖情况: ✅ 无外部依赖

| 文件         | 检查内容     | 结果           |
| ------------ | ------------ | -------------- | ---------------- |
| Scheduler.ts | 检查 `ps aux | grep opencode` | 被动检测，非依赖 |
| 其他文件     | -            | 无外部引用     |

### 说明

- `Scheduler.ts` 中有 `countOpenCodeProcesses()` 函数，用于检查 OpenCode 进程数量
- 这是**被动检测**（知识运用），不是依赖
- 如果 OpenCode 不存在，函数返回 0，调度器正常工作

---

## 2. src/services/

### 依赖情况: ⚠️ 部分服务涉及外部

| 服务                       | 类型         | 归属  | 说明                   |
| -------------------------- | ------------ | ----- | ---------------------- |
| OpenCodeSessionManager.ts  | OpenCode API | Piano | 调用 OpenCode HTTP API |
| OpenCodeReminderService.ts | OpenCode API | Piano | 调用 OpenCode HTTP API |
| PiExecutor.ts              | 执行 pi 命令 | NuPI  | 执行本地 pi 命令       |
| PiSDKExecutor.ts           | 执行 pi 命令 | NuPI  | 执行本地 pi 命令       |
| TraeSkillSyncService.ts    | Trae 文件    | NuPI  | 同步到 .trae/ 目录     |
| TraeAutoRecoveryService.ts | 数据库标签   | NuPI  | 恢复 Trae 任务         |
| HeartbeatService.ts        | Piano 调用   | Core  | 调用 Piano 路由/协调器 |
| AgentIdentityService.ts    | 环境检测     | Core  | 被动检测环境变量       |

### 说明

- 这些服务应该移动到对应子系统（Piano/NuPI）
- Core 中保留的调用通过 Piano 间接调用，符合架构

---

## 3. src/cli/

### 依赖情况: ⚠️ 工具命令涉及外部

| 命令             | 类型           | 说明                    |
| ---------------- | -------------- | ----------------------- |
| processes        | OpenCode 进程  | 显示/杀死 OpenCode 进程 |
| skill-sync       | Trae           | 同步 skills 到 Trae     |
| process-guardian | OpenCode/Nezha | 监控进程                |

### 说明

- CLI 是用户工具，涉及外部软件是合理的
- 这些命令不影响核心服务运行

---

## 4. src/piano/

### 依赖情况: ⚠️ 依赖 NuPI (Pi)

| 文件                           | 依赖              | 说明             |
| ------------------------------ | ----------------- | ---------------- |
| executor/PiExecutorWrapper.ts  | PiExecutor (NuPI) | 包装 Pi 执行器   |
| coordinator/TaskCoordinator.ts | PiExecutorWrapper | 使用 Pi 执行任务 |

### 评估: ⚠️ Piano 依赖了 NuPI

- 按照设计，Piano 不应该依赖 NuPI（会掣肘）
- 但目前实现中 Piano 使用了 NuPI 的 PiExecutor

### 建议

- 考虑在 Piano 中内联 Pi 执行逻辑
- 或通过接口/抽象层解耦

---

## 5. nupi/

### 依赖情况: ✅ 无 OpenCode 依赖

| 检查项             | 结果 |
| ------------------ | ---- |
| 导入 OpenCode 库   | 无   |
| 调用 OpenCode API  | 无   |
| 检查 OpenCode 文件 | 无   |

### 说明

- NuPI 只依赖 Nezha Core 和 Pi
- 符合设计要求

---

## 6. piano/ (根目录子系统)

### 依赖情况: 从 src/piano/ 复制

- 与 src/piano/ 相同
- 已复制到 src/piano/ 以确保编译通过

---

## 总结

| 文件夹        | OpenCode 依赖 | Pi/Trae 依赖 | 问题              |
| ------------- | ------------- | ------------ | ----------------- |
| src/core/     | 被动检测      | 无           | ✅                |
| src/services/ | 部分服务      | 部分服务     | ⚠️ 需移动到子系统 |
| src/cli/      | 工具命令      | 无           | ✅ 工具层面       |
| src/piano/    | 无            | 依赖 NuPI    | ⚠️ 建议解耦       |
| nupi/         | 无            | 核心依赖     | ✅                |

### 已识别问题

1. **Piano 依赖 NuPI** - 应解耦
2. **src/services/ 中的 Piano/NuPI 服务** - 应移动到对应子系统

---

## 修复建议

### 1. 解耦 Piano 和 NuPI

```typescript
// 在 Piano 中定义 Pi 执行接口
interface PiExecutorInterface {
  execute(task: string): Promise<PiTaskResult>;
}

// Piano 不直接导入 NuPI 的 PiExecutor
```

### 2. 移动服务到子系统

- `OpenCodeSessionManager.ts` → `piano/src/services/`
- `OpenCodeReminderService.ts` → `piano/src/services/`
- `PiExecutor.ts` → `nupi/src/services/`
- 等等
