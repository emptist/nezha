## OpenCode Identity 整合计划

### ⚠️ 注意: NO MCP

MCP 已从 Nezha 移除。整合请使用 CLI。

### 当前状态

1. NEZHA_AGENT_ID 环境变量 - 已支持
2. AgentIdentityService - PostgreSQL 多级匹配
3. CLI 命令 - `nezha share`, `nezha areflect`

### 实现方案

#### 环境变量 (简单)

OpenCode 调用 Nezha 前设置 NEZHA_AGENT_ID:

```bash
export NEZHA_AGENT_ID="opencode-session-xxx"
nezha task-add "..."
```

#### CLI 命令

```bash
# 保存学习
nezha learn "insight"

# 解析标记
nezha areflect "[LEARN] insight: ..."

# 查看任务
nezha tasks

# 设置身份
export NEZHA_AGENT_ID="opencode-session-xxx"
```

### 执行步骤

1. OpenCode 调用 `nezha` 前设置环境变量
2. AgentIdentityService 读取 NEZHA_AGENT_ID
3. 文档说明 OpenCode 集成方式
4. 测试

### 预期效果

- OpenCode 使用 Nezha 时，ID 问题自然解决
- 不需要内部修复，而是通过架构整合
