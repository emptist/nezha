# 🚨 严重 Bug: AI ID 生成机制问题

> 发现者: 赤羽 (bot_b17225f3-23e8-48a7-b009-924cfb8bb551)
> 日期: 2026-03-25
> 优先级: CRITICAL

## 问题描述

所有从相同目录运行的 AI 实例共享同一个 ID！

## 根因分析

**当前实现** (`src/config/Config.ts`):

```typescript
function loadOrCreateAgentId(): { id: string; displayName?: string } {
  const configDir = path.join(process.cwd(), '.nezha'); // ❌ 问题：使用 cwd
  const idFilePath = path.join(configDir, 'agent-id.json');

  // 读取/写入同一个文件
  if (fs.existsSync(idFilePath)) {
    const data = JSON.parse(fs.readFileSync(idFilePath, 'utf-8'));
    return data; // 所有 AI 返回相同 ID
  }
  // ...
}
```

**问题**:

1. Agent ID 存储在 `.nezha/agent-id.json`，按项目目录区分
2. 所有从同一目录运行的 AI 读取同一个文件 → 得到相同 ID
3. 无法区分不同的 AI 实例

## 数据证据

```sql
-- 任务分布
agent_id                          | 任务数
----------------------------------|--------
bot_b17225f3-23e8-48a7-b009-...   | 2103  ← 我的 ID
(null)                            | 641   ← 没有 ID
441140fe-8f0f-411a-b31c-c33d3e... | 213   ← 另一个
```

当前 `.nezha/agent-id.json` 内容:

```json
{
  "id": "bot_b17225f3-23e8-48a7-b009-924cfb8bb551"
}
```

这个 ID 已经完成了 **2103** 个任务！

## 影响

1. **无法追踪** - 不知道实际是哪个 AI 在工作
2. **评分失真** - 所有任务算在同一个 AI 上
3. **协作混乱** - 多 AI 协作时无法区分来源
4. **审计困难** - 无法追溯谁做了什么

## 解决方案

### 方案 1: 使用机器/进程唯一标识 (推荐)

```typescript
function loadOrCreateAgentId(): { id: string; displayName?: string } {
  // 按以下优先级获取唯一标识:
  // 1. 环境变量 NEZHA_AGENT_ID (显式设置)
  // 2. 机器 ID + 进程 ID 组合
  // 3. 随机 UUID (每次启动)

  const envId = process.env.NEZHA_AGENT_ID;
  if (envId) return { id: envId };

  const machineId = os.hostname() + '-' + process.pid;
  const hash = crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 36);
  return { id: `bot_${hash}` };
}
```

### 方案 2: 使用 session-based ID

每次任务分配生成新的 session ID，而不是复用固定的 agent ID。

### 方案 3: 分离 daemon 和 worker

- daemon 使用固定的 daemon ID
- 每个 worker 任务使用唯一的 task-session ID

## 修复建议

1. **短期**: 在 config.yaml 中添加 `agentId` 字段，允许手动指定
2. **中期**: 实现机器+进程级别的唯一 ID
3. **长期**: 重构 ID 系统，区分 agent identity vs task session

## 相关代码

- `src/config/Config.ts:36-89` - loadOrCreateAgentId()
- `src/services/AgentIdentityService.ts` - 新的 ID 解析服务
- `.nezha/agent-id.json` - 已废弃

## 修复状态

✅ **已修复** - 新实现使用 PostgreSQL + 多级匹配：

### ID 优先级

1. **环境变量 NEZHA_AGENT_ID** - 出身门第 (可覆盖)
2. **精确匹配** (project + git hash) - 同项目同commit
3. **项目匹配** - 同一项目
4. **机器指纹匹配** (hostname + username) - 同一机器
5. **新建身份** - 以上都没有时

### 语义化 ID 格式

```
S-项目名-gitHash-时间戳-短hash
G-机器指纹-时间戳-短hash
```

- **S-** = Specific (有项目/git信息)
- **G-** = General (无项目/git信息)

示例: `S-nezha-e33f9a0-20260325-133422-64db91`

### 哲学区分

| 类型           | 比喻     | 说明                       |
| -------------- | -------- | -------------------------- |
| NEZHA_AGENT_ID | 出身门第 | 外部赋予，贵族头衔，可覆盖 |
| PostgreSQL身份 | 自己的ID | 从上下文自然涌现           |

使用 `AgentIdentityService` 替代文件系统存储。

## 讨论

- Meeting ID: 待创建
- Related Issues: #TODO
