## OpenCode Identity 整合计划

### 目标

通过 OpenCode 集成解决 Nezha ID 问题 - 让 OpenCode 的 identity 被复用

### 当前状态

1. NEZHA_AGENT_ID 环境变量 - 已支持
2. AgentIdentityService - PostgreSQL 多级匹配
3. MCP 工具 - learn, memory_search 等

### 实现方案

#### 方案 A: 环境变量 (简单)

OpenCode 调用 Nezha 前设置 NEZHA_AGENT_ID

```bash
export NEZHA_AGENT_ID="opencode-session-xxx"
nezha task-add "..."
```

#### 方案 B: MCP 工具 (优雅)

添加新 MCP 工具 `set_identity`:

```typescript
{
  name: 'set_identity',
  description: 'Set the current session identity. Call this when OpenCode uses Nezha.',
  inputSchema: {
    properties: {
      sessionId: { type: 'string' },
      identity: { type: 'string' },
      metadata: { type: 'object' }
    }
  }
}
```

### 执行步骤

1. 在 learning-server.ts 添加 set_identity 工具
2. 更新 AgentIdentityService 优先检查已设置的 identity
3. 文档说明 OpenCode 集成方式
4. 测试

### 预期效果

- OpenCode 使用 Nezha 时，ID 问题自然解决
- 不需要内部修复，而是通过架构整合
