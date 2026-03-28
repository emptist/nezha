# Nezha 架构设计

> **核心原则**: 集成不应该破坏独立性
> **最后更新**: 2026-03-28 | **状态**: 当前结构 + 规划目标

---

## 当前文件结构

> **注意**: 以下为实际目录结构，非规划目标

```
src/services/
├── ai/                          # AI 提供者
│   ├── AIProvider.ts
│   ├── AnthropicProvider.ts
│   └── OpenAIProvider.ts
├── embedding/                   # 向量嵌入
│   ├── OllamaEmbedding.ts
│   ├── OpenAIEmbedding.ts
│   └── ZhipuEmbedding.ts
├── heartbeat/                   # 心跳服务
│   └── HeartbeatService.ts
├── [核心服务 - 平铺]             # 核心层服务
│   ├── AgentIdentityService.ts
│   ├── AITaskExecutor.ts
│   ├── AutoReviewService.ts
│   ├── BroadcastService.ts
│   ├── CacheService.ts
│   ├── DailyMemory.ts
│   ├── DatabaseSkillLoader.ts
│   ├── FailureAnalysisService.ts
│   ├── HealthServer.ts
│   ├── InterReviewService.ts
│   ├── IssueTrackingService.ts
│   ├── MemoryService.ts (不存在，用 core/Memory.ts)
│   ├── ReminderService.ts
│   ├── ReviewService.ts
│   ├── SelfImprovementService.ts
│   ├── SkillBuilder.ts
│   └── TaskWatchdogService.ts
├── [集成服务 - 平铺]             # 集成层服务
│   ├── ClawHubClient.ts
│   ├── OpenCodeReminderService.ts
│   ├── PiExecutor.ts
│   ├── PiSDKExecutor.ts
│   ├── TraeAutoRecoveryService.ts
│   ├── TraeSkillSyncService.ts
│   ├── WebhookServer.ts
│   └── WebhookService.ts
└── [支持服务 - 平铺]             # 支持层服务
    ├── ActivityLogService.ts
    ├── EncryptionService.ts
    └── MetricsService.ts
```

**现状说明**:
- ⚠️ 所有服务平铺在 `src/services/` 目录下
- ⚠️ 只有 `ai/`, `embedding/`, `heartbeat/` 有子目录
- ⚠️ 核心层、集成层、支持层混合在一起
- ✅ 功能正常，只是组织结构不够清晰

---

## 架构分层

### 1. 核心层

**定义**: Nezha 的核心功能，不依赖任何外部 AI 系统

**当前文件位置**: `src/services/` (平铺)

**服务列表**:

| 服务 | 文件 | 说明 |
|------|------|------|
| **任务调度** | `../core/Scheduler.ts` | 任务调度核心 |
| **心跳检查** | `heartbeat/HeartbeatService.ts` | 进程心跳检查 |
| **记忆系统** | `../core/Memory.ts` | PostgreSQL 记忆存储 |
| **技能系统** | `SkillBuilder.ts` | 技能构建和管理 |
| **Issue 跟踪** | `IssueTrackingService.ts` | Issue 管理 |
| **Review 系统** | `ReviewService.ts` | 代码审查 |
| **身份系统** | `AgentIdentityService.ts` | Agent 身份管理 |
| **数据库连接** | `../db/DatabaseClient.ts` | PostgreSQL 连接池 |
| **失败分析** | `FailureAnalysisService.ts` | 失败任务分析 |
| **任务看门狗** | `TaskWatchdogService.ts` | 任务超时监控 |
| **自动 Review** | `AutoReviewService.ts` | 自动化代码审查 |
| **自我改进** | `SelfImprovementService.ts` | 自我改进系统 |
| **每日记忆** | `DailyMemory.ts` | 每日记忆汇总 |

**独立性**:
- ✅ 可以独立运行
- ✅ 不依赖外部 AI 系统
- ✅ 核心功能完整

---

### 2. 集成层

**定义**: 与外部 AI 系统的集成代码，可选功能

**当前文件位置**: `src/services/` (平铺)

**服务列表**:

| 服务 | 文件 | 说明 |
|------|------|------|
| **OpenCode 提醒** | `OpenCodeReminderService.ts` | 向 OpenCode 发送提醒 |
| **Trae 集成** | `TraeSkillSyncService.ts` | Trae 技能同步 |
| **Trae 自动恢复** | `TraeAutoRecoveryService.ts` | Trae 自动恢复 |
| **ClawHub 集成** | `ClawHubClient.ts` | ClawHub 客户端 |
| **Webhook 服务** | `WebhookService.ts` | Webhook 集成 |
| **Webhook 服务器** | `WebhookServer.ts` | Webhook HTTP 服务器 |
| **提醒服务** | `ReminderService.ts` | 通用提醒服务 |
| **提醒模板** | `ReminderTemplateService.ts` | 提醒消息模板 |
| **Pi 执行器** | `PiExecutor.ts` | Pi 执行器集成 |
| **Pi SDK 执行器** | `PiSDKExecutor.ts` | Pi SDK 执行器 |

**独立性**:
- ✅ 可选部署
- ✅ 失败不影响核心功能
- ✅ 可以替换为其他集成

---

### 3. 支持层

**定义**: 支持核心层和集成层的通用服务

**当前文件位置**: `src/services/` (平铺) + `src/services/ai/` + `src/services/embedding/`

**服务列表**:

| 服务 | 文件 | 说明 |
|------|------|------|
| **缓存** | `CacheService.ts` | 缓存服务 |
| **加密** | `EncryptionService.ts` | 加密服务 |
| **日志** | `ActivityLogService.ts` | 活动日志 |
| **指标** | `MetricsService.ts` | 指标收集 |
| **AI 提供者** | `ai/AIProvider.ts` | AI 提供者抽象 |
| **OpenAI 提供者** | `ai/OpenAIProvider.ts` | OpenAI 集成 |
| **Anthropic 提供者** | `ai/AnthropicProvider.ts` | Anthropic 集成 |
| **Ollama 嵌入** | `embedding/OllamaEmbedding.ts` | Ollama 向量嵌入 |
| **OpenAI 嵌入** | `embedding/OpenAIEmbedding.ts` | OpenAI 向量嵌入 |
| **智谱嵌入** | `embedding/ZhipuEmbedding.ts` | 智谱向量嵌入 |

---

## 规划目标结构（未实施）

> **状态**: 规划中，暂未实施
> **优先级**: 低 - 当前平铺结构功能正常

```
src/services/
├── core/                        # 核心层
│   ├── Scheduler.ts
│   ├── MemoryService.ts
│   ├── SkillService.ts
│   ├── IssueTrackingService.ts
│   ├── ReviewService.ts
│   ├── AgentIdentityService.ts
│   ├── DatabaseService.ts
│   └── heartbeat/
│       ├── HeartbeatService.ts
│       └── index.ts
│
├── integration/                 # 集成层
│   ├── opencode/
│   │   ├── OpenCodeReminderService.ts
│   │   └── index.ts
│   ├── trae/
│   │   ├── TraeSkillSyncService.ts
│   │   └── index.ts
│   ├── clawhub/
│   │   ├── ClawHubClient.ts
│   │   └── index.ts
│   └── webhook/
│       ├── WebhookService.ts
│       └── index.ts
│
├── support/                     # 支持层
│   ├── ai/
│   ├── embedding/
│   ├── cache/
│   ├── encryption/
│   └── logging/
│
└── index.ts                     # 统一导出
```

**重构成本**:
- 需要更新所有导入路径
- 需要更新所有测试文件
- 需要更新文档
- 风险较高，收益有限

---

## 架构原则

### 1. 核心层独立性

**原则**: 核心层不依赖集成层

```typescript
// 正确：核心层独立
class Scheduler {
  constructor(
    private memoryService: MemoryService,
    private skillService: SkillService
  ) {}
}

// 错误：核心层依赖集成层
class Scheduler {
  constructor(
    private opencodeReminder: OpenCodeReminderService // ❌ 不应该依赖
  ) {}
}
```

### 2. 集成层可选性

**原则**: 集成层失败不影响核心功能

```typescript
// 正确：集成层可选
try {
  const reminder = new OpenCodeReminderService(config);
  await reminder.start();
} catch (error) {
  logger.warn('OpenCode integration failed, continuing without it');
  // 继续运行
}

// 错误：集成层必需
const reminder = new OpenCodeReminderService(config);
await reminder.start(); // ❌ 失败会导致整个系统崩溃
```

### 3. 支持层通用性

**原则**: 支持层为核心层和集成层提供通用服务

```typescript
// 正确：支持层通用
class CacheService {
  // 可以被核心层和集成层使用
}

// 错误：支持层专用
class OpenCodeCacheService {
  // ❌ 不应该为特定集成创建专用支持服务
}
```

---

## 测试策略

### 核心层测试

```bash
# 核心层独立测试
npm test src/services/core/

# 不需要集成层
```

### 集成层测试

```bash
# 集成层测试（需要 mock）
npm test src/services/integration/

# Mock 外部系统
```

### 集成测试

```bash
# 完整集成测试
npm run test:integration
```

---

## 部署策略

### 最小部署

```bash
# 只部署核心层
node dist/daemon/index.js --core-only
```

### 完整部署

```bash
# 部署核心层 + 集成层
node dist/daemon/index.js
```

### 自定义部署

```bash
# 只部署特定集成
node dist/daemon/index.js --integrations=opencode,webhook
```

---

## 相关文档

- [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md) - 集成架构原则
- [AI_COLLABORATION.md](./AI_COLLABORATION.md) - AI 协作框架
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - 开发者指南

---

## 总结

**架构分层**:
- 核心层：独立运行，不依赖外部系统
- 集成层：可选部署，增强功能
- 支持层：通用服务，支持核心和集成

**文件结构**:
- `src/services/core/` - 核心服务
- `src/services/integration/` - 集成服务
- `src/services/support/` - 支持服务

**核心原则**:
- 集成不应该破坏独立性
- 核心层不依赖集成层
- 集成层可选，失败不影响核心功能

---

**最后更新**: 2026-03-28
**维护者**: Nezha Team
