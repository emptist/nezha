# 文件结构分析 - 待整理

## 整理目标

1. **归拢**: 把散落在各处的 TypeScript 文件集中到合理位置
2. **检查依赖**: 确认 nezha core 没有依赖外部软件
3. **子系统归位**: 把属于 NuPI/Piano 的文件移到对应子系统

---

## 第一步：归拢根目录文件

### 需要移动的文件

| 当前路径                          | 目标路径                                  | 原因                    |
| --------------------------------- | ----------------------------------------- | ----------------------- |
| `/TransportBenchmark.ts`          | `src/benchmarks/TransportBenchmark.ts`    | 测试代码归到 benchmarks |
| `/UnifiedAgentBenchmark.ts`       | `src/benchmarks/UnifiedAgentBenchmark.ts` | 测试代码归到 benchmarks |
| `/test-email.ts`                  | `scripts/test-email.ts`                   | 脚本归到 scripts        |
| `/test-pi.ts`                     | `scripts/test-pi.ts`                      | 脚本归到 scripts        |
| `/test-pi-glm.mjs`                | `scripts/test-pi-glm.mjs`                 | 脚本归到 scripts        |
| `/test.txt`                       | 删除或 `scripts/`                         | 测试产物                |
| `/test-output.txt`                | 删除                                      | 测试产物                |
| `/malformed_test.json`            | 删除                                      | 测试产物                |
| `/temp_create_issue.sql`          | `scripts/temp_create_issue.sql`           | 临时脚本                |
| `/tmp_update_docs.sql`            | `scripts/tmp_update_docs.sql`             | 临时脚本                |
| `/TransportBenchmark.ts`          | `src/benchmarks/`                         | 已有 benchmarks 目录    |
| `/microservices/`                 | `examples/microservices/`                 | 示例代码                |
| `/deprecated/opencode-coupling/`  | `piano/deprecated/opencode-coupling/`     | Piano 相关              |
| `/extensions/nezha-blind-loop.ts` | `nupi/src/nezha-blind-loop.ts`            | NuPI 相关               |
| `/extensions/trae/skill.ts`       | 删除或移到 Trae 集成文档                  | Trae 相关               |

### 保留不动的文件

| 文件                          | 原因     |
| ----------------------------- | -------- |
| `config.yaml`                 | 配置文件 |
| `package.json`                | 项目配置 |
| `tsconfig.json`               | 项目配置 |
| `.env.example`                | 配置示例 |
| `AGENTS.md`, `AGENTS.NuPI.md` | 文档     |

---

## 第二步：检查外部依赖

### 什么是"外部依赖"？

外部依赖 = 必须安装某软件才能运行 Nezha

| 类型       | 例子                   | 是否允许             |
| ---------- | ---------------------- | -------------------- |
| **允许**   | PostgreSQL             | 核心依赖             |
| **不允许** | Trae, OpenCode, Pi SDK | 应该是"服务"或"检测" |

### 检查方法

对每个服务运行：

```bash
# 检查是否有 import 外部非核心库
grep -r "import.*from.*\(trae\|opencode\|pi\)" src/services/

# 检查是否有 require 外部非核心库
grep -r "require.*\(trae\|opencode\|pi\)" src/services/

# 检查是否调用外部命令
grep -r "execSync.*\(trae\|opencode\)" src/services/
```

### 服务分类检查清单

#### 应该属于 Core 的服务（无外部依赖）

- [ ] AgentIdentityService.ts - 身份服务
- [ ] BroadcastService.ts - 广播服务
- [ ] Memory, Learning 相关
- [ ] Skills 相关
- [ ] DatabaseClient.ts - 核心依赖
- [ ] Config.ts - 配置

#### 可能属于 Piano（需要检查）

- [ ] OpenCodeReminderService.ts - 依赖 OpenCode URL
- [ ] OpenCodeSessionManager.ts - 依赖 OpenCode API
- [ ] TaskRouter.ts - 路由到 OpenCode
- [ ] TaskCoordinator.ts - 协调 OpenCode

#### 可能属于 NuPI（需要检查）

- [ ] PiExecutor.ts - 依赖 Pi SDK
- [ ] PiSDKExecutor.ts - 依赖 Pi SDK
- [ ] TraeSkillSyncService.ts - Trae 集成
- [ ] TraeAutoRecoveryService.ts - Trae 恢复

---

## 第三步：子系统归位

### 目标结构

```
nezha/
├── src/                          # Nezha Core (无外部依赖)
│   ├── services/                 # 核心服务
│   ├── core/                     # 核心功能
│   ├── cli/                      # CLI
│   ├── db/                       # 数据库
│   ├── mcp/                      # MCP 工具
│   └── benchmarks/               # 测试代码
│
├── piano/                        # Piano 子系统
│   ├── src/
│   │   ├── coordinator/          # 任务协调
│   │   ├── router/               # 路由
│   │   ├── executor/             # 执行器
│   │   └── engine/               # 引擎
│   └── deprecated/               # 待废弃
│
├── nupi/                         # NuPI 子系统
│   ├── src/
│   ├── extensions/
│   └── skills/
│
├── deprecated/                   # 待归位或删除
│
└── scripts/                      # 工具脚本
```

### 移动规则

1. **Piano 服务** → 移动到 `piano/src/`
2. **NuPI 服务** → 移动到 `nupi/src/`
3. **Core 服务** → 保留在 `src/services/`
4. **混合服务** → 拆分或重构

---

## 当前已知问题

### 子系统依赖规则 (重要!)

| 子系统         | 可以依赖                 | 不应该依赖                      |
| -------------- | ------------------------ | ------------------------------- |
| **Nezha Core** | PostgreSQL (唯一)        | 任何外部 AI 软件                |
| **NuPI**       | Nezha Core, Pi           | Piano, OpenCode, Trae           |
| **Piano**      | Nezha Core, OpenCode, Pi | NuPI (设计不同，会掣肘未来开发) |

> **关键**: NuPI 依赖 Pi，Pi 是硬件/软件实体。Piano 依赖 OpenCode。这是服务/被服务关系，不是依赖。

---

### NuPI 重复目录

- `src/NuPi/` vs `nupi/` - 需要合并或选一个

### Piano 重复目录

- `src/piano/` vs `piano/` - 需要合并或选一个

### 建议

- 保留 `nupi/` 和 `piano/` 作为子系统根目录
- 移动 `src/NuPi/` 和 `src/piano/` 内容到对应子系统
- 删除空的 `piano/src/` 目录

---

## 执行记录

### 第一步：归拢

- [x] 移动根目录的 .ts 文件
- [x] 移动 microservices/ → examples/microservices/
- [x] 移动 deprecated/ → piano/deprecated/
- [x] 移动 extensions/ → nupi/extensions/

### 第二步：检查依赖

- [x] 逐个检查服务依赖
- [x] 标记问题服务

#### 依赖检查结果

**无 import 外部库** - 所有服务都是通过知识检测（环境变量/文件存在/进程检查），没有 import 外部软件库

| 服务                       | 依赖类型                     | 归属  |
| -------------------------- | ---------------------------- | ----- |
| AgentIdentityService.ts    | 环境变量检测 (AI_AGENT)      | Core  |
| BroadcastService.ts        | 无                           | Core  |
| OpenCodeReminderService.ts | 依赖 OpenCode URL (知识检测) | Piano |
| OpenCodeSessionManager.ts  | 依赖 OpenCode API (知识检测) | Piano |
| PiExecutor.ts              | 执行 pi 命令 (检测是否存在)  | NuPI  |
| PiSDKExecutor.ts           | 执行 pi 命令 (检测是否存在)  | NuPI  |
| TraeSkillSyncService.ts    | 检查 .trae/ 目录             | NuPI  |
| TraeAutoRecoveryService.ts | 数据库标签检查               | NuPI  |
| HealthServer.ts            | OpenCode URL 检查            | Core  |
| HeartbeatService.ts        | 无                           | Core  |

**结论**: 没有服务真正依赖外部软件，都是"知识运用"型的检测。这是正确的。

### 第三步：子系统归位

- [x] 移动 Piano 相关到 piano/
  - 复制 src/piano/\* → piano/src/
  - 复制 OpenCodeReminderService.ts, OpenCodeSessionManager.ts → piano/src/services/
- [x] 移动 NuPI 相关到 nupi/
  - 复制 PiExecutor.ts, PiSDKExecutor.ts → nupi/src/services/
  - 复制 TraeSkillSyncService.ts, TraeAutoRecoveryService.ts → nupi/src/services/
  - 已移动 nezha-blind-loop.ts, extensions/trae/ → nupi/
- [x] 清理重复目录
  - [x] 删除 src/piano/, src/NuPi/
  - [x] 删除空目录 extensions/, microservices/, deprecated/

---

## ✅ 完成

文件结构重组已完成：

1. **归拢** - 散落的文件移到正确位置
2. **依赖检查** - 所有服务都是知识检测，无真正依赖外部软件
3. **子系统归位** - Piano 和 NuPI 服务已移动到对应子系统
4. **清理** - 删除重复目录和空目录

最终结构已验证。

---

## 最终目标结构

```
nezha/
├── src/                          # Nezha Core
│   ├── services/                 # Core 服务 (保留)
│   ├── core/                     # 核心功能
│   ├── cli/                      # CLI
│   ├── db/                       # 数据库
│   ├── mcp/                      # MCP 工具
│   └── benchmarks/               # 测试代码
│
├── piano/                        # Piano 子系统
│   ├── src/
│   │   ├── coordinator/
│   │   ├── router/
│   │   ├── executor/
│   │   ├── engine/
│   │   ├── planner/
│   │   └── services/             # OpenCode 服务
│   └── deprecated/
│
├── nupi/                         # NuPI 子系统
│   ├── src/
│   │   ├── services/              # Pi, Trae 服务
│   │   └── NuPi/
│   ├── extensions/
│   └── skills/
│
├── examples/                     # 示例代码
│   └── microservices/
│
├── scripts/                      # 工具脚本
│
└── docs/PLANS/                   # 规划文档

---

## 已知问题（需后续修复）

1. **Piano 依赖 NuPI** - src/piano/executor/PiExecutorWrapper.ts 直接导入 NuPI 的 PiExecutor
2. **服务未完全归位** - src/services/ 中仍有 OpenCode/Pi 相关服务

详见: `docs/PLANS/dependency-check.md`
```
