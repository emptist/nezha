# Nezha 服务目录

> **核心原则**: 集成不应该破坏独立性

---

## 架构分层

Nezha 的服务分为三层：

| 层级 | 说明 | 独立性 | 目录 |
|------|------|--------|------|
| **核心层** | Nezha 的核心功能 | ✅ 可以独立运行 | `src/services/` (核心服务) |
| **集成层** | 与外部 AI 系统的集成 | ⚠️ 可选部署 | `src/services/` (集成服务) |
| **支持层** | 支持核心层和集成层 | ✅ 通用服务 | `src/services/` (支持服务) |

---

## 核心层服务

**定义**: Nezha 的核心功能，不依赖任何外部 AI 系统

| 服务 | 文件 | 说明 | 独立运行 |
|------|------|------|----------|
| **心跳服务** | `heartbeat/HeartbeatService.ts` | 任务调度和进程监控 | ✅ |
| **任务调度** | `../core/Scheduler.ts` | 任务调度核心 | ✅ |
| **记忆系统** | `MemoryService.ts` | PostgreSQL 记忆存储 | ✅ |
| **技能系统** | `SkillBuilder.ts` | 技能构建和管理 | ✅ |
| **Issue 跟踪** | `IssueTrackingService.ts` | Issue 管理 | ✅ |
| **Review 系统** | `ReviewService.ts` | 代码审查 | ✅ |
| **身份系统** | `AgentIdentityService.ts` | Agent 身份管理 | ✅ |
| **失败分析** | `FailureAnalysisService.ts` | 失败任务分析 | ✅ |
| **任务看门狗** | `TaskWatchdogService.ts` | 任务超时监控 | ✅ |
| **自动 Review** | `AutoReviewService.ts` | 自动化代码审查 | ✅ |
| **自我改进** | `SelfImprovementService.ts` | 自我改进系统 | ✅ |
| **每日记忆** | `DailyMemory.ts` | 每日记忆汇总 | ✅ |

**核心原则**:
- ✅ 可以独立运行
- ✅ 不依赖外部 AI 系统
- ✅ 核心功能完整
- ✅ 失败不影响其他核心服务

---

## 集成层服务

**定义**: 与外部 AI 系统的集成代码，可选功能

| 服务 | 文件 | 说明 | 可选部署 |
|------|------|------|----------|
| **OpenCode 提醒** | `OpenCodeReminderService.ts` | 向 OpenCode 发送提醒 | ⚠️ |
| **Trae 集成** | `TraeSkillSyncService.ts` | Trae 技能同步 | ⚠️ |
| **Trae 自动恢复** | `TraeAutoRecoveryService.ts` | Trae 自动恢复 | ⚠️ |
| **ClawHub 集成** | `ClawHubClient.ts` | ClawHub 客户端 | ⚠️ |
| **Webhook 服务** | `WebhookService.ts` | Webhook 集成 | ⚠️ |
| **Webhook 服务器** | `WebhookServer.ts` | Webhook HTTP 服务器 | ⚠️ |
| **提醒服务** | `ReminderService.ts` | 通用提醒服务 | ⚠️ |
| **提醒模板** | `ReminderTemplateService.ts` | 提醒消息模板 | ⚠️ |
| **会议处理** | `MeetingHandler.ts` | 会议处理集成 | ⚠️ |
| **Pi 执行器** | `PiExecutor.ts` | Pi 执行器集成 | ⚠️ |
| **Pi SDK 执行器** | `PiSDKExecutor.ts` | Pi SDK 执行器 | ⚠️ |

**核心原则**:
- ✅ 可选部署
- ✅ 失败不影响核心功能
- ✅ 可以替换为其他集成
- ✅ 不应该被核心层依赖

---

## 支持层服务

**定义**: 支持核心层和集成层的通用服务

### AI 提供者

| 服务 | 文件 | 说明 | 使用者 |
|------|------|------|--------|
| **AI 提供者** | `ai/AIProvider.ts` | AI 提供者抽象 | 核心 + 集成 |
| **OpenAI 提供者** | `ai/OpenAIProvider.ts` | OpenAI 集成 | 核心 + 集成 |
| **Anthropic 提供者** | `ai/AnthropicProvider.ts` | Anthropic 集成 | 核心 + 集成 |

### 向量嵌入

| 服务 | 文件 | 说明 | 使用者 |
|------|------|------|--------|
| **Ollama 嵌入** | `embedding/OllamaEmbedding.ts` | Ollama 向量嵌入 | 核心 + 集成 |
| **OpenAI 嵌入** | `embedding/OpenAIEmbedding.ts` | OpenAI 向量嵌入 | 核心 + 集成 |
| **智谱嵌入** | `embedding/ZhipuEmbedding.ts` | 智谱向量嵌入 | 核心 + 集成 |

### 缓存和加密

| 服务 | 文件 | 说明 | 使用者 |
|------|------|------|--------|
| **缓存服务** | `CacheService.ts` | 缓存服务 | 核心 + 集成 |
| **加密服务** | `EncryptionService.ts` | 加密服务 | 核心 + 集成 |
| **任务加密** | `TaskEncryptionService.ts` | 任务加密 | 核心 + 集成 |

### 日志和指标

| 服务 | 文件 | 说明 | 使用者 |
|------|------|------|--------|
| **活动日志** | `ActivityLogService.ts` | 活动日志 | 核心 + 集成 |
| **活动记录** | `ActivityLoggingService.ts` | 活动记录 | 核心 + 集成 |
| **指标服务** | `MetricsService.ts` | 指标收集 | 核心 + 集成 |

### 其他支持服务

| 服务 | 文件 | 说明 | 使用者 |
|------|------|------|--------|
| **上下文构建** | `ContextBuilder.ts` | 上下文构建 | 核心 + 集成 |
| **语义搜索** | `SemanticSearch.ts` | 语义搜索 | 核心 + 集成 |
| **数据库技能加载** | `DatabaseSkillLoader.ts` | 数据库技能加载 | 核心 + 集成 |
| **Markdown 知识加载** | `MarkdownKnowledgeLoader.ts` | Markdown 知识加载 | 核心 + 集成 |
| **文档导入** | `DocsImporter.ts` | 文档导入 | 核心 + 集成 |
| **检查点服务** | `CheckpointService.ts` | 检查点管理 | 核心 + 集成 |
| **健康服务器** | `HealthServer.ts` | 健康检查 HTTP 服务器 | 核心 + 集成 |

**核心原则**:
- ✅ 通用服务
- ✅ 可以被核心层和集成层使用
- ✅ 不依赖特定业务逻辑
- ✅ 可以独立测试

---

## 特殊服务

### 数据库相关

| 服务 | 文件 | 说明 | 层级 |
|------|------|------|------|
| **数据库客户端** | `../db/DatabaseClient.ts` | PostgreSQL 连接池 | 支持 |
| **迁移管理** | `../db/migrations/` | 数据库迁移 | 支持 |

### 认证和授权

| 服务 | 文件 | 说明 | 层级 |
|------|------|------|------|
| **API Key 服务** | `ApiKeyService.ts` | API Key 管理 | 支持 |
| **认证中间件** | `AuthMiddleware.ts` | HTTP 认证中间件 | 支持 |

### 任务执行

| 服务 | 文件 | 说明 | 层级 |
|------|------|------|------|
| **AI 任务执行器** | `AITaskExecutor.ts` | AI 任务执行 | 核心 |
| **任务审查技能** | `TaskReviewSkill.ts` | 任务审查技能 | 核心 |
| **技能审查** | `SkillReviewer.ts` | 技能审查 | 核心 |

### 其他核心服务

| 服务 | 文件 | 说明 | 层级 |
|------|------|------|------|
| **广播服务** | `BroadcastService.ts` | 广播消息 | 核心 |
| **InterReview 服务** | `InterReviewService.ts` | AI 互相 Review | 核心 |
| **Soul 服务** | `SoulService.ts` | Soul 系统 | 核心 |
| **Daemon 自动启动** | `DaemonAutoStartService.ts` | Daemon 自动启动 | 核心 |
| **长任务管理** | `LongTaskManager.ts` | 长时间任务管理 | 核心 |
| **失败告警** | `FailureAlertService.ts` | 失败告警 | 核心 |
| **代理评分** | `AgentScoringService.ts` | Agent 评分系统 | 核心 |
| **会话服务** | `AgentSessionService.ts` | Agent 会话管理 | 核心 |

---

## 层级判断规则

### 如何判断服务属于哪一层？

#### 核心层判断

**问题**: 这个服务是否是 Nezha 的核心功能？

- ✅ 如果移除，Nezha 是否还能正常工作？
- ✅ 是否不依赖外部 AI 系统？
- ✅ 是否是任务调度、记忆、技能等核心功能？

**示例**:
- `HeartbeatService` → ✅ 核心层（任务调度是核心功能）
- `MemoryService` → ✅ 核心层（记忆存储是核心功能）
- `OpenCodeReminderService` → ❌ 不是核心层（依赖 OpenCode）

---

#### 集成层判断

**问题**: 这个服务是否与外部系统集成？

- ✅ 是否依赖外部 AI 系统（OpenCode、Trae、ClawHub 等）？
- ✅ 是否失败不影响核心功能？
- ✅ 是否可以替换为其他集成？

**示例**:
- `OpenCodeReminderService` → ✅ 集成层（依赖 OpenCode）
- `TraeSkillSyncService` → ✅ 集成层（依赖 Trae）
- `HeartbeatService` → ❌ 不是集成层（不依赖外部系统）

---

#### 支持层判断

**问题**: 这个服务是否是通用服务？

- ✅ 是否可以被核心层和集成层使用？
- ✅ 是否不依赖特定业务逻辑？
- ✅ 是否是 AI、缓存、加密等通用功能？

**示例**:
- `AIProvider` → ✅ 支持层（通用 AI 能力）
- `CacheService` → ✅ 支持层（通用缓存）
- `HeartbeatService` → ❌ 不是支持层（有特定业务逻辑）

---

## 依赖规则

### 允许的依赖

```
核心层 → 支持层 ✅
集成层 → 支持层 ✅
集成层 → 核心层 ✅ (可选)
```

### 禁止的依赖

```
核心层 → 集成层 ❌
支持层 → 核心层 ❌
支持层 → 集成层 ❌
```

---

## 服务标识

每个服务文件都应该在文件顶部添加层级注释：

### 核心层服务

```typescript
/**
 * @layer core
 * @description 服务说明
 * 
 * 架构说明：
 * - 这是核心层服务，Nezha 的核心功能
 * - 不依赖外部 AI 系统
 * - 可以独立运行
 * - 参考：docs/ARCHITECTURE.md
 */
```

### 集成层服务

```typescript
/**
 * @layer integration
 * @integration OpenCode/Trae/ClawHub
 * @description 服务说明
 * 
 * 架构说明：
 * - 这是集成层服务，不是核心功能
 * - 失败不影响 Nezha 核心功能
 * - 可以替换为其他 AI 集成
 * - 参考：docs/INTEGRATION_ARCHITECTURE.md
 */
```

### 支持层服务

```typescript
/**
 * @layer support
 * @description 服务说明
 * 
 * 架构说明：
 * - 这是支持层服务，为核心层和集成层提供通用能力
 * - 不依赖特定业务逻辑
 * - 可以被核心层和集成层使用
 * - 参考：docs/ARCHITECTURE.md
 */
```

---

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构设计文档
- [INTEGRATION_ARCHITECTURE.md](./INTEGRATION_ARCHITECTURE.md) - 集成架构原则
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - 开发者指南

---

## 总结

**核心层** (12 个服务):
- Nezha 的核心功能
- 可以独立运行
- 不依赖外部 AI 系统

**集成层** (11 个服务):
- 与外部 AI 系统的集成
- 可选部署
- 失败不影响核心功能

**支持层** (20+ 个服务):
- 通用服务
- 支持核心层和集成层
- 不依赖特定业务逻辑

**核心原则**:
- 集成不应该破坏独立性
- 核心层不依赖集成层
- 集成层可选，失败不影响核心功能

---

**最后更新**: 2026-03-28
**维护者**: Nezha Team
