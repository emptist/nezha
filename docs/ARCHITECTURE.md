# Nezha 架构设计

> **核心原则**: 集成不应该破坏独立性

---

## 架构分层

### 1. 核心层

**定义**: Nezha 的核心功能，不依赖任何外部 AI 系统

**目录**: `src/services/core/`

**服务列表**:

| 服务 | 文件 | 说明 |
|------|------|------|
| **任务调度** | `Scheduler.ts` | 任务调度核心 |
| **心跳检查** | `heartbeat/HeartbeatService.ts` | 进程心跳检查 |
| **记忆系统** | `MemoryService.ts` | PostgreSQL 记忆存储 |
| **技能系统** | `SkillService.ts` | 技能加载和执行 |
| **Issue 跟踪** | `IssueTrackingService.ts` | Issue 管理 |
| **Review 系统** | `ReviewService.ts` | 代码审查 |
| **身份系统** | `AgentIdentityService.ts` | Agent 身份管理 |
| **数据库连接** | `DatabaseService.ts` | PostgreSQL 连接池 |

**独立性**:
- ✅ 可以独立运行
- ✅ 不依赖外部 AI 系统
- ✅ 核心功能完整

---

### 2. 集成层

**定义**: 与外部 AI 系统的集成代码，可选功能

**目录**: `src/services/integration/`

**服务列表**:

| 服务 | 文件 | 说明 |
|------|------|------|
| **OpenCode 提醒** | `OpenCodeReminderService.ts` | 向 OpenCode 发送提醒 |
| **Trae 集成** | `TraeSkillSyncService.ts` | Trae 技能同步 |
| **ClawHub 集成** | `ClawHubClient.ts` | ClawHub 客户端 |
| **Webhook** | `WebhookService.ts` | Webhook 集成 |

**独立性**:
- ✅ 可选部署
- ✅ 失败不影响核心功能
- ✅ 可以替换为其他集成

---

### 3. 支持层

**定义**: 支持核心层和集成层的通用服务

**目录**: `src/services/support/` (待创建)

**服务列表**:

| 服务 | 文件 | 说明 |
|------|------|------|
| **缓存** | `CacheService.ts` | 缓存服务 |
| **加密** | `EncryptionService.ts` | 加密服务 |
| **日志** | `ActivityLogService.ts` | 活动日志 |
| **指标** | `MetricsService.ts` | 指标收集 |

---

## 文件结构规划

### 当前结构（需要重构）

```
src/services/
├── ai/                          # AI 提供者（支持层）
├── embedding/                   # 向量嵌入（支持层）
├── heartbeat/                   # 心跳服务（核心层）
├── OpenCodeReminderService.ts   # OpenCode 集成（集成层）
├── TraeSkillSyncService.ts      # Trae 集成（集成层）
├── ClawHubClient.ts             # ClawHub 集成（集成层）
├── HeartbeatService.ts          # 心跳服务（核心层）
├── MemoryService.ts             # 记忆服务（核心层）
├── ...                          # 混在一起
```

**问题**:
- ❌ 核心层和集成层混在一起
- ❌ 没有明确的目录结构区分
- ❌ 新人容易混淆

---

### 目标结构

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
│   │   ├── AIProvider.ts
│   │   ├── AnthropicProvider.ts
│   │   ├── OpenAIProvider.ts
│   │   └── index.ts
│   ├── embedding/
│   │   ├── OllamaEmbedding.ts
│   │   ├── OpenAIEmbedding.ts
│   │   ├── ZhipuEmbedding.ts
│   │   └── index.ts
│   ├── cache/
│   │   ├── CacheService.ts
│   │   └── index.ts
│   ├── encryption/
│   │   ├── EncryptionService.ts
│   │   └── index.ts
│   └── logging/
│       ├── ActivityLogService.ts
│       ├── MetricsService.ts
│       └── index.ts
│
└── index.ts                     # 统一导出
```

---

## 重构计划

### 阶段 1: 创建目录结构 ✅

```bash
mkdir -p src/services/core
mkdir -p src/services/integration
mkdir -p src/services/support
```

### 阶段 2: 移动核心服务

```bash
# 核心服务
mv src/services/heartbeat src/services/core/
mv src/services/Scheduler.ts src/services/core/
mv src/services/MemoryService.ts src/services/core/
mv src/services/SkillService.ts src/services/core/
mv src/services/IssueTrackingService.ts src/services/core/
mv src/services/ReviewService.ts src/services/core/
mv src/services/AgentIdentityService.ts src/services/core/
```

### 阶段 3: 移动集成服务

```bash
# 集成服务
mkdir -p src/services/integration/opencode
mkdir -p src/services/integration/trae
mkdir -p src/services/integration/clawhub
mkdir -p src/services/integration/webhook

mv src/services/OpenCodeReminderService.ts src/services/integration/opencode/
mv src/services/TraeSkillSyncService.ts src/services/integration/trae/
mv src/services/ClawHubClient.ts src/services/integration/clawhub/
mv src/services/WebhookService.ts src/services/integration/webhook/
```

### 阶段 4: 移动支持服务

```bash
# 支持服务
mv src/services/ai src/services/support/
mv src/services/embedding src/services/support/
mv src/services/CacheService.ts src/services/support/cache/
mv src/services/EncryptionService.ts src/services/support/encryption/
mv src/services/ActivityLogService.ts src/services/support/logging/
mv src/services/MetricsService.ts src/services/support/logging/
```

### 阶段 5: 更新导入路径

**需要更新的文件**:
- `src/daemon/index.ts`
- `src/cli/index.ts`
- 所有测试文件
- 所有其他服务文件

---

## 导入路径规范

### 核心层导入

```typescript
// 正确
import { HeartbeatService } from './services/core/heartbeat/HeartbeatService.js';
import { MemoryService } from './services/core/MemoryService.js';

// 错误
import { HeartbeatService } from './services/HeartbeatService.js';
```

### 集成层导入

```typescript
// 正确
import { OpenCodeReminderService } from './services/integration/opencode/OpenCodeReminderService.js';
import { TraeSkillSyncService } from './services/integration/trae/TraeSkillSyncService.js';

// 错误
import { OpenCodeReminderService } from './services/OpenCodeReminderService.js';
```

### 支持层导入

```typescript
// 正确
import { AIProvider } from './services/support/ai/AIProvider.js';
import { CacheService } from './services/support/cache/CacheService.js';

// 错误
import { AIProvider } from './services/ai/AIProvider.js';
```

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
