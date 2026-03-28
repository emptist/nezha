# Nezha 集成架构原则

> 集成不应该破坏独立性

## 核心原则

**集成 ≠ 依赖**

```
集成 (Integration) = 增强功能 (Enhancement)
依赖 (Dependency)   = 必需功能 (Requirement)

Nezha 和 OpenCode 是集成关系，不是依赖关系
```

---

## 架构分层

```
┌─────────────────────────────────────────────────────────┐
│                   应用层（独立）                         │
├────────────────────────┬────────────────────────────────┤
│      Nezha 核心        │      OpenCode 核心             │
│  ┌──────────────────┐  │  ┌──────────────────┐         │
│  │ 任务调度系统      │  │  │ AI 代码助手      │         │
│  │ - Scheduler      │  │  │ - 代码生成       │         │
│  │ - Heartbeat      │  │  │ - 代码分析       │         │
│  │ - Memory         │  │  │ - 代码审查       │         │
│  │ - Issues         │  │  │ - 自主决策       │         │
│  │ - Skills         │  │  │                  │         │
│  └──────────────────┘  │  └──────────────────┘         │
│                        │                                │
│  技术栈: Node.js       │  技术栈: 独立                  │
│  数据库: PostgreSQL    │  运行: 独立进程                │
└────────────────────────┴────────────────────────────────┘
           │                              │
           │                              │
           ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                互动层（松耦合）                          │
│                                                          │
│  ┌──────────────────┐        ┌──────────────────┐      │
│  │ OpenCodeReminder │        │ CLI 命令          │      │
│  │ Service          │◄──────►│ (nezha CLI)      │      │
│  │                  │  HTTP  │                  │      │
│  └──────────────────┘        └──────────────────┘      │
│                                                          │
│  配置: .env (OPENCODE_SERVER_URL, 密码)                 │
└─────────────────────────────────────────────────────────┘
```

---

## 独立性验证

### Nezha 独立运行

```bash
# 启动 Nezha（不启动 OpenCode）
node dist/daemon/index.js

# Nezha 功能完全正常：
✅ 任务调度
✅ 心跳检查
✅ Memory 存储
✅ Issue 跟踪
✅ Skills 管理
✅ Review 系统

# 唯一影响：
⚠️ 没有 AI 提醒（OpenCodeReminderService 无法连接）
✅ 但不影响核心功能
```

### OpenCode 独立运行

```bash
# 启动 OpenCode（不启动 Nezha）
opencode serve --port 56795

# OpenCode 功能完全正常：
✅ 代码生成
✅ 代码分析
✅ 代码审查
✅ 自主决策
✅ 所有 AI 功能

# 唯一影响：
⚠️ 没有任务提醒（没有 Nezha 提醒）
✅ 但不影响 AI 核心功能
```

---

## 集成 vs 依赖对比

| 维度 | 集成 (Integration) | 依赖 (Dependency) |
|------|-------------------|-------------------|
| **定义** | 增强功能 | 必需功能 |
| **缺失影响** | 功能减弱，但仍可用 | 功能完全不可用 |
| **部署方式** | 可选部署 | 必须部署 |
| **升级方式** | 独立升级 | 需要协调 |
| **故障影响** | 局部影响 | 全局影响 |
| **技术栈** | 可以不同 | 通常相同 |
| **测试方式** | 可以独立测试 | 需要集成测试 |

---

## 架构优势

### 1. 灵活部署

```
场景 1：只部署 Nezha
✅ 作为任务调度系统使用
✅ 人工管理任务

场景 2：只部署 OpenCode
✅ 作为 AI 代码助手使用
✅ 人工分配任务

场景 3：同时部署
✅ AI 自主协作
✅ 自动化任务调度
```

### 2. 故障隔离

```
OpenCode 故障：
- ✅ Nezha 继续运行
- ✅ 人工接管任务
- ✅ 等待 OpenCode 恢复

Nezha 故障：
- ✅ OpenCode 继续运行
- ✅ 用户手动操作
- ✅ 等待 Nezha 恢复
```

### 3. 渐进式集成

```
阶段 1：独立运行
- Nezha 和 OpenCode 各自独立

阶段 2：单向集成
- Nezha → OpenCode（提醒）

阶段 3：双向集成
- Nezha ↔ OpenCode（提醒 + 操作）

阶段 4：多 AI 集成
- Nezha ↔ OpenCode
- Nezha ↔ Trae
- Nezha ↔ Cursor
```

### 4. 技术栈自由

```
Nezha:
- Node.js + TypeScript
- PostgreSQL
- Express/Fastify

OpenCode:
- 独立的技术栈
- 不受 Nezha 限制
```

---

## 实现最佳实践

### 1. 错误处理

**正确做法**（集成设计）：
```typescript
// Nezha 侧
try {
  await opencodeReminder.start();
  logger.info('[Daemon] OpenCode reminder service started');
} catch (error) {
  // 失败不影响 Nezha 运行
  logger.warn('[Daemon] Failed to start OpenCode reminder service:', error);
  // 继续运行其他服务
}
```

**错误做法**（依赖设计）：
```typescript
// 错误示范
await opencodeReminder.start(); // 如果失败，整个 Nezha 崩溃
```

### 2. 可选功能

**正确做法**（集成设计）：
```typescript
// OpenCode 可以选择使用 CLI 命令
if (nezhaAvailable) {
  await createTask(taskData);
} else {
  // 仍然可以工作，只是没有任务调度
  await handleManually(taskData);
}
```

**错误做法**（依赖设计）：
```typescript
// 错误示范：必须使用 CLI 命令才能工作
await createTask(taskData); // 如果 Nezha 没有运行，OpenCode 无法工作
```

### 3. 配置管理

**正确做法**（可选配置）：
```bash
# .env
OPENCODE_SERVER_URL=http://localhost:56795  # 可选
OPENCODE_SERVER_USERNAME=opencode           # 可选
OPENCODE_SERVER_PASSWORD=nezha-secret       # 可选
```

**错误做法**（必需配置）：
```bash
# 错误示范：缺少配置就无法启动
OPENCODE_SERVER_URL=http://localhost:56795  # 必需
OPENCODE_SERVER_USERNAME=opencode           # 必需
OPENCODE_SERVER_PASSWORD=nezha-secret       # 必需
```

### 4. 功能降级

**正确做法**（优雅降级）：
```typescript
// 当 OpenCode 不可用时，降级到其他提醒方式
if (!openCodeAvailable) {
  // 降级到日志提醒
  logger.info('[Reminder] OpenCode not available, using fallback');
  await logReminder(reminderData);
}
```

**错误做法**（硬性失败）：
```typescript
// 错误示范：OpenCode 不可用时直接失败
if (!openCodeAvailable) {
  throw new Error('OpenCode is required');
}
```

---

## 独立性检查清单

### Nezha 独立性检查

```bash
# 1. 停止 OpenCode
pkill -f "opencode serve"

# 2. 启动 Nezha
node dist/daemon/index.js

# 3. 验证功能
✅ 任务调度正常
✅ 心跳检查正常
✅ Memory 存储正常
✅ Issue 跟踪正常
✅ Skills 管理正常
✅ Review 系统正常
✅ CLI 命令正常

# 4. 检查日志
⚠️ OpenCodeReminderService 启动失败（预期）
✅ 其他服务正常运行
```

### OpenCode 独立性检查

```bash
# 1. 停止 Nezha
pkill -f "node dist/daemon"

# 2. 启动 OpenCode
opencode serve --port 56795

# 3. 验证功能
✅ 代码生成正常
✅ 代码分析正常
✅ 代码审查正常
✅ 自主决策正常
✅ 所有 AI 功能正常

# 4. 检查日志
✅ 没有 Nezha 相关的错误
```

---

## 集成测试

### 测试场景 1：Nezha 单独运行

```bash
# 启动 Nezha
node dist/daemon/index.js

# 创建任务
node dist/cli/index.js task-add "Test Task" "Description" 5

# 验证任务创建成功
node dist/cli/index.js list-tasks
```

**预期结果**：
- ✅ 任务创建成功
- ✅ 任务状态为 PENDING
- ⚠️ 没有 AI 提醒（预期）

### 测试场景 2：OpenCode 单独运行

```bash
# 启动 OpenCode
opencode serve --port 56795

# 发送测试消息
curl -X POST http://localhost:56795/session \
  -H "Authorization: Basic $(echo -n 'opencode:nezha-secret' | base64)" \
  -d '{"title":"test"}'

# 验证 OpenCode 响应
```

**预期结果**：
- ✅ OpenCode 响应正常
- ✅ AI 功能正常
- ⚠️ 没有 Nezha 提醒（预期）

### 测试场景 3：集成运行

```bash
# 启动 OpenCode
./bin/start-opencode-server.sh

# 启动 Nezha
node dist/daemon/index.js

# 等待 2 分钟
# 验证 Nezha 发送提醒到 OpenCode
```

**预期结果**：
- ✅ Nezha 运行正常
- ✅ OpenCode 运行正常
- ✅ Nezha 发送提醒到 OpenCode
- ✅ OpenCode AI 处理提醒

---

## 迁移指南

### 从依赖架构迁移到集成架构

#### 步骤 1：识别依赖点

```typescript
// 找出所有硬性依赖
const dependencies = [
  'OpenCodeReminderService',
  'CLI commands',
  'Configuration',
];

// 分析每个依赖是否必需
dependencies.forEach(dep => {
  console.log(`${dep}: ${isRequired(dep) ? 'Required' : 'Optional'}`);
});
```

#### 步骤 2：添加错误处理

```typescript
// 将硬性依赖改为可选集成
try {
  await integration.start();
} catch (error) {
  logger.warn('Integration failed, continuing without it');
  // 继续运行
}
```

#### 步骤 3：实现降级方案

```typescript
// 当集成不可用时，提供替代方案
if (!integrationAvailable) {
  await fallback();
}
```

#### 步骤 4：测试独立性

```bash
# 测试独立运行
./test-independence.sh
```

---

## 相关文档

- [AI_COLLABORATION.md](./AI_COLLABORATION.md) - AI 协作框架
- [NEZHA_TRAECN_INTEGRATION.md](./NEZHA_TRAECN_INTEGRATION.md) - Nezha 与 TraeCN 集成
- [opencode_integration_complete_2026-03-28.md](./reviews/opencode_integration_complete_2026-03-28.md) - OpenCode 集成完成报告

---

## 总结

**核心原则**：
- ✅ 集成不应该破坏独立性
- ✅ 集成是可选的增强功能
- ✅ 依赖是必需的核心功能
- ✅ 双方都保持完整性和独立性

**架构价值**：
- 灵活部署
- 故障隔离
- 渐进式集成
- 技术栈自由

**实现要点**：
- 错误处理
- 可选功能
- 配置管理
- 功能降级

**这是优秀架构设计的标志：让系统变得更好，但不让系统变得脆弱。**

---

**最后更新**: 2026-03-28
**维护者**: Nezha Team
