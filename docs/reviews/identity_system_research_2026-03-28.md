# Nezha 身份识别系统研究报告

> **研究日期**: 2026-03-28  
> **研究者**: Trae AI  
> **背景**: Nezha 配置了智谱 GLM-4-Flash 免费版，现在拥有自己的大模型

---

## 执行摘要

Nezha 身份识别系统存在**架构混乱**问题：两个身份表并存，导致数据不一致。随着智谱大模型的集成，Nezha 现在可以自主执行任务，身份识别变得更加重要。

### 核心发现

| 问题 | 严重性 | 状态 |
|------|--------|------|
| 两个身份表并存 | 高 | 需要修复 |
| `set_identity` 未被调用 | 高 | 需要集成 |
| 智谱集成已完成 | - | ✅ 可用 |
| S-/G- 格式已实现 | - | ✅ 正确 |

---

## 1. 数据库架构分析

### 1.1 两个身份表

```sql
-- 表 1: agent_identities (复数) ✅ 正确
CREATE TABLE agent_identities (
    id VARCHAR(100) PRIMARY KEY,  -- S-/G- 格式
    project VARCHAR(255),
    git_hash VARCHAR(20),
    machine_fingerprint VARCHAR(64),
    ...
);

-- 表 2: agent_identity (单数) ❌ 错误
CREATE TABLE agent_identity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 随机 UUID
    agent_name UUID UNIQUE,
    ...
);
```

### 1.2 数据现状

```sql
-- agent_identities (正确)
SELECT COUNT(*) FROM agent_identities;
-- 结果: 1 条 (S-nezha-e33f9a0-20260325-133422-64db91)

-- agent_identity (错误)
SELECT COUNT(*) FROM agent_identity;
-- 结果: 大量随机 UUID 记录

-- memory 表中的 agent_id
SELECT COUNT(DISTINCT agent_id) FROM memory WHERE agent_id IS NOT NULL;
-- 结果: 1 个唯一 agent_id (S-nezha-e33f9a0-...)
```

### 1.3 根本原因

**Migration 002 vs Migration 030**:

| Migration | 表名 | ID 格式 | 用途 |
|-----------|------|---------|------|
| 002 | `agent_identities` | S-/G- | AgentIdentityService |
| 030 | `agent_identity` | UUID | register_agent 函数 |

**两套系统并存**，没有统一。

---

## 2. 代码实现分析

### 2.1 AgentIdentityService (正确实现)

```typescript
// src/services/AgentIdentityService.ts

class AgentIdentityService {
  // ✅ 优先级 0: 外部身份
  async resolve(): Promise<AgentIdentity> {
    if (AgentIdentityService.externalIdentity) {
      return AgentIdentityService.externalIdentity;
    }
    
    // ✅ 优先级 1-3: 数据库匹配
    // ✅ 优先级 4: 生成新 ID (S-/G- 格式)
  }
  
  // ✅ 生成语义化 ID
  generateSemanticId(context: AgentContext): string {
    if (context.project && context.gitHash) {
      return `S-${context.project}-${context.gitHash}-${timestamp}-${hash}`;
    }
    return `G-${context.machineFingerprint}-${timestamp}-${hash}`;
  }
}
```

### 2.2 register_agent 函数 (错误实现)

```sql
-- src/db/migrations/030_agent_task_attribution.sql

CREATE FUNCTION register_agent(p_agent_id UUID, ...) RETURNS UUID AS $$
BEGIN
    INSERT INTO agent_identity (agent_name, ...)  -- ❌ 写入错误表
    VALUES (p_agent_id, ...);
END;
$$ LANGUAGE plpgsql;
```

### 2.3 MCP set_identity 工具

```typescript
// src/mcp/learning-server.ts

{
  name: 'set_identity',
  description: 'Set the current session identity. Call this when OpenCode uses Nezha.',
  inputSchema: {
    properties: {
      identity: { type: 'string' },
      displayName: { type: 'string' }
    }
  }
}

// 实现
if (name === 'set_identity') {
  AgentIdentityService.setExternalIdentity({
    id: identity,
    project: null,
    gitHash: null,
    machineFingerprint: null,
    createdAt: new Date(),
    displayName: displayName,
  });
}
```

**问题**: Trae 从未调用此工具。

---

## 3. 智谱大模型集成

### 3.1 AIProviderFactory

```typescript
// src/services/ai/index.ts

static createFromEnv(): AIProvider {
  const zhipuKey = process.env.ZHIPU_API_KEY;
  
  if (zhipuKey && !openaiKey && !anthropicKey) {
    config = {
      provider: 'openai',  // 使用 OpenAI 兼容接口
      model: process.env.ZHIPU_MODEL || 'glm-4-flash',
      apiKey: zhipuKey,
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    };
  }
  
  return new OpenAIProvider(config);
}
```

### 3.2 架构变化

```
之前: Nezha → OpenCode → 外部 AI
现在: Nezha → 智谱 GLM-4-Flash (内置)
```

**意义**: Nezha 现在可以**自主执行任务**，不再依赖外部 AI。

### 3.3 使用位置

| 服务 | 文件 | 用途 |
|------|------|------|
| HeartbeatService | src/services/heartbeat/HeartbeatService.ts | 任务执行 |
| InterReviewService | src/services/InterReviewService.ts | AI 互评 |
| MeetingHandler | src/services/MeetingHandler.ts | 会议处理 |
| NezhaApiServer | src/api/NezhaApiServer.ts | REST API |

---

## 4. 身份识别问题分析

### 4.1 核心矛盾

```
┌─────────────────────────────────────────────────────────┐
│                    THE IDENTITY TRAP                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Option A: 使用上下文 (project + git + machine)         │
│  ─────────────────────────────────────────────          │
│  结果: 同一环境所有 AI = 相同 ID                        │
│  问题: 无法区分不同 AI                                  │
│                                                          │
│  Option B: 添加随机性/时间戳                            │
│  ─────────────────────────────────────────────          │
│  结果: 每次会话 = 不同 ID                               │
│  问题: 无法累积知识                                     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  相同 ID = 无唯一性                              │    │
│  │  不同 ID = 无累积性                             │    │
│  │                                                  │    │
│  │  必须有外部标识符才能同时满足两者               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Trae 的问题

```
Trae 不提供 session ID
     ↓
AI 无法获取唯一标识符
     ↓
只能使用上下文生成 ID
     ↓
同一环境所有 AI = 相同 ID
```

### 4.3 解决方案

**方案 1: Trae 提供 session ID (推荐)**

```
Trae 在系统提示中注入 session ID
     ↓
AI 调用 set_identity MCP 工具
     ↓
Nezha 使用外部身份
     ↓
问题解决
```

**方案 2: 接受现实 (备选)**

```
承认 AI 没有持久身份
     ↓
改为标记"上下文"而非"身份"
     ↓
数据标签: project + git + timestamp
     ↓
放弃"专家累积"概念
```

---

## 5. 修复建议

### 5.1 短期修复 (立即)

1. **统一身份表**

```sql
-- 迁移数据
INSERT INTO agent_identities (id, project, git_hash, machine_fingerprint, created_at)
SELECT 
  'M-' || agent_name,  -- M- 表示迁移的 ID
  NULL,
  NULL,
  NULL,
  created_at
FROM agent_identity;

-- 废弃旧表
DROP TABLE agent_identity;
-- 或重命名保留
ALTER TABLE agent_identity RENAME TO agent_identity_deprecated;
```

2. **更新 register_agent 函数**

```sql
CREATE OR REPLACE FUNCTION register_agent(
  p_agent_id TEXT,  -- 改为 TEXT，接受 S-/G- 格式
  p_display_name TEXT DEFAULT NULL,
  ...
) RETURNS TEXT AS $$
BEGIN
  INSERT INTO agent_identities (id, display_name, ...)
  VALUES (p_agent_id, p_display_name, ...);
END;
$$ LANGUAGE plpgsql;
```

### 5.2 中期修复 (本周)

1. **Trae 集成**
   - 在系统提示中注入 session ID
   - 或在 MCP 连接时传递

2. **文档更新**
   - 更新 `.env.example` 说明 `NEZHA_AGENT_ID` 用法
   - 添加 Trae 集成指南

### 5.3 长期改进 (下个迭代)

1. **身份策略文档**
   - 明确何时使用 S-/G-/M- 格式
   - 定义身份生命周期

2. **监控和告警**
   - 检测重复 ID
   - 追踪身份使用情况

---

## 6. 智谱集成的意义

### 6.1 架构变化

```
之前:
┌────────┐    ┌────────┐    ┌────────┐
│ Nezha  │───►│OpenCode│───►│外部 AI │
└────────┘    └────────┘    └────────┘
依赖外部服务

现在:
┌────────┐    ┌────────────┐
│ Nezha  │───►│智谱 GLM-4  │
└────────┘    │(内置免费)  │
              └────────────┘
完全自主
```

### 6.2 新能力

| 能力 | 之前 | 现在 |
|------|------|------|
| 任务执行 | 依赖 OpenCode | 自主执行 |
| 成本 | 按使用付费 | 免费额度 |
| 可靠性 | 依赖外部服务 | 本地控制 |
| 延迟 | 网络延迟 | API 调用 |

### 6.3 身份识别的新重要性

Nezha 现在可以**自主执行任务**，身份识别变得更加重要：

- 任务归属: 谁执行了这个任务？
- 知识累积: 哪个 AI 学到了这个经验？
- 质量追踪: 哪个 AI 的代码质量更高？

---

## 7. 结论

### 7.1 主要问题

1. **两个身份表并存** - 导致数据不一致
2. **Trae 不提供 session ID** - AI 无法获取唯一标识符
3. **set_identity 未被调用** - 外部身份机制未被使用

### 7.2 解决路径

```
短期: 统一身份表，修复 register_agent 函数
中期: Trae 集成，传递 session ID
长期: 完善身份策略和监控
```

### 7.3 智谱集成的意义

Nezha 现在拥有自己的大模型，可以**自主执行任务**。身份识别问题不再是"可选优化"，而是**核心基础设施**。

---

## 附录 A: 相关文件

| 文件 | 用途 |
|------|------|
| src/services/AgentIdentityService.ts | 身份服务 (正确) |
| src/db/migrations/002_agent_identities.sql | 身份表 (正确) |
| src/db/migrations/030_agent_task_attribution.sql | 身份表 (错误) |
| src/mcp/learning-server.ts | set_identity 工具 |
| src/services/ai/index.ts | 智谱集成 |

## 附录 B: 数据库查询

```sql
-- 查看身份表状态
SELECT 'agent_identities' as table_name, COUNT(*) as count FROM agent_identities
UNION ALL
SELECT 'agent_identity', COUNT(*) FROM agent_identity;

-- 查看内存中的 agent_id
SELECT agent_id, COUNT(*) FROM memory GROUP BY agent_id;

-- 查看最近的身份
SELECT id, project, git_hash, created_at 
FROM agent_identities 
ORDER BY created_at DESC LIMIT 10;
```

## 附录 C: 大模型选项对比

### C.1 可用模型

| 模型 | 类型 | 成本 | 性能 | 适用场景 |
|------|------|------|------|----------|
| 智谱 GLM-4-Flash | 云端 | 免费 | 快 | 当前配置 ✅ |
| Llama 3.2:3b | 本地 | 免费 | 中 | 可选 |
| 更大本地模型 | 本地 | 免费 | 慢 | 机器限制 ❌ |

### C.2 配置方式

**智谱 GLM-4-Flash (当前)**:
```bash
# .env
ZHIPU_API_KEY=your_api_key_here
ZHIPU_MODEL=glm-4-flash
```

**Llama 3.2:3b (本地)**:
```bash
# .env
NEZHA_EMBEDDING_PROVIDER=ollama
NEZHA_EMBEDDING_MODEL=llama3.2:3b
NEZHA_EMBEDDING_API_URL=http://localhost:11434
```

### C.3 优势对比

| 维度 | 智谱云端 | Llama 本地 |
|------|----------|------------|
| 隐私 | 数据上传云端 | 完全本地 |
| 速度 | API 延迟 | 取决于机器 |
| 稳定性 | 依赖网络 | 离线可用 |
| 质量 | GLM-4 较好 | 3b 模型较小 |
| 成本 | 免费额度 | 完全免费 |

### C.4 建议

- **当前**: 继续使用智谱 GLM-4-Flash（免费且性能好）
- **备选**: Llama 3.2:3b 可作为离线备份
- **未来**: 机器升级后可尝试更大本地模型

---

**报告完成时间**: 2026-03-28  
**下一步行动**: 统一身份表，修复 register_agent 函数
