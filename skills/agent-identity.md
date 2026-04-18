---
name: agent-identity
description: Correct way to get agent identity - function not variable
trigger: agentid, agent-identity, whoami, resolve identity
---

# Agent Identity - Function Not Variable

## 核心原理

Agent ID 必须是**函数**而非**变量**。这样可以追踪任何 Agent 的任何活动。

每次调用 `getResolvedIdentity()` 时:
1. 动态计算 ID（从上下文: 项目、branch、session）
2. 查询数据库是否存在
3. 不存在则创建，存在则返回
4. **自动注册到 agent_sessions 表**（追踪谁在运行）

## ❌ 禁止：任何形式的缓存

```typescript
// ❌ 绝对禁止 - 破坏追踪系统
const idCache = new Map();
async function getAgentId() {
  if (idCache.has('current')) return idCache.get('current');
  const id = await AgentIdentityService.getResolvedIdentity();
  idCache.set('current', id);
  return id;
}
```

```typescript
// ❌ 绝对禁止 - static 变量也是缓存
class MyAgentService {
  private static cachedId: string | null = null;
  static async getId() {
    if (this.cachedId) return this.cachedId;
    this.cachedId = (await AgentIdentityService.getResolvedIdentity()).id;
    return this.cachedId;
  }
}
```

```typescript
// ❌ 绝对禁止 - 文件缓存
const cached = JSON.parse(fs.readFileSync('.nezha/agent-id.json', 'utf-8'));
```

## ✅ 正确：直接调用函数

```typescript
// 每次调用都会重新计算，从上下文生成正确的 ID
import { AgentIdentityService } from 'nezha/services/AgentIdentityService.js';

const identity = await AgentIdentityService.getResolvedIdentity();
console.log(identity.id); // S-nezha-nupi-phase2-nupi-cleanup
```

## 为什么不需要缓存

1. **动态计算** - ID 从当前上下文（项目、branch、session）实时生成
2. **数据库查找** - 如果 ID 已存在，直接返回；不存在则创建
3. **追踪能力** - 只有每次调用函数，才能追踪所有活动

缓存 = 失去追踪能力 = 破坏整个系统

## 快速参考

```typescript
// 获取完整 identity 对象
const identity = await AgentIdentityService.getResolvedIdentity();
// 返回: { id: 'S-nezha-...', name: 'nupi', type: 'service', ... }

// 只需要 ID 字符串
const agentId = identity.id;
```

**记住**: 这是一个函数，不是变量。每次调用都重新计算。