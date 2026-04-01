# Piano

**任务路由和协调子系统**，扩展 Nezha 核心的 HeartbeatService。

## 架构

Piano 继承核心 HeartbeatService，添加任务路由功能：

```typescript
class PianoHeartbeatService extends HeartbeatService {
  // TaskRouter - 决定任务发给哪个执行器
  // TaskCoordinator - 协调 OpenCode 执行
  // TaskPlanner - 任务分解和评估
  // PiExecutor - Pi 执行器
}
```

### 执行流程

```
Task → TaskRouter.route() →
  ├─ opencode → TaskCoordinator.execute()
  ├─ pi → TaskPlanner.plan() → PiExecutor.execute()
  └─ internal → HeartbeatService.executeInternalAI()
```

## 目录结构

```
piano/
├── src/
│   ├── router/          # TaskRouter
│   ├── coordinator/     # TaskCoordinator
│   ├── planner/         # TaskPlanner
│   ├── executor/        # PiExecutorWrapper
│   └── services/        # PianoHeartbeatService
├── deprecated/          # 已废弃代码
└── package.json        # @nezha/piano
```

## Workspace

Piano 是 Nezha monorepo 的子系统：

```json
{
  "name": "@nezha/piano",
  "dependencies": { "nezha": "^0.1.0" }
}
```

### 未来：独立 npm 包

搬出 monorepo 后：

```bash
npm install @nezha/piano

// 代码中：
import { PianoHeartbeatService } from '@nezha/piano';
import { HeartbeatService } from 'nezha';
```

## 与核心的关系

- **继承关系**: `PianoHeartbeatService extends HeartbeatService`
- **依赖方向**: Piano → 核心（单向）
- **核心原则**: 核心不依赖子系统，子系统扩展核心

## 状态

- HeartbeatService 核心已清理，只保留内部 AI 执行 ✅
- PianoHeartbeatService 子类代码已写好，待 npm 包化后启用 ⚙️
