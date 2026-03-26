# Agent ID 系统清理计划

> **状态**: ✅ 已完成 (2026-03-27)  
> 详见: `docs/reviews/agent_id_migration_report_2026-03-27.md`

## 清理记录 (2026-03-27)

### 代码清理
- ✅ 移除 `src/config/Config.ts` 中的文件fallback逻辑
- ✅ 移除 `.nezha/agent-id.json` 相关代码
- ✅ 简化 `resolveAgentIdAsync()` 函数，只保留环境变量和PostgreSQL两种方式

### 文档更新
- ✅ `README.md` - 标记为已移除
- ✅ `docs/DEVELOPER_GUIDE.md` - 标记为已移除
- ✅ `docs/issues/AGENT_ID_GENERATION_BUG.md` - 标记为已解决
- ✅ `docs/HANDOVER_2026-03-26.md` - 更新清理状态
- ✅ `docs/cleanup/AGENT_ID_CLEANUP.md` - 本文档

### Git Hook修复
- ✅ 更新 `.git/hooks/prepare-commit-msg` 到最新版本
- ✅ Hook现在调用 `nezha agents whoami` 从数据库获取ID

## 背景 (历史记录)

2026-03-26，另一个 AI (big-pickle) 实现了新的 Agent Identity System。

### 核心设计哲学

> **AI 没有记忆，AI 只是数据的临时容器。真正的"知识"存在于 PostgreSQL 中，用 Agent ID 作为数据的标签/锚点。**

> **Agent ID = 数字人的身份，不是 AI 的身份，而是数据的身份**

参考：`docs/AGENT_ID_SYSTEM.md`

## 错误方法（需删除）

### 方法 1：文件存储 Agent ID

**问题**：多个 AI 实例共享同一个文件 `.nezha/agent-id.json`，会覆盖彼此的 ID。

```bash
AGENT_ID=$(cat ".nezha/agent-id.json" ...)
```

### 方法 2：环境变量 NEZHA_AGENT_ID

**问题**：环境变量会被多个 AI 实例共享，同样无法区分。

```bash
export NEZHA_AGENT_ID="S-nezha-xxx"
```

### 方法 3：随机分配 ID

**问题**：违反幂等性原则，同样的上下文应该产生同样的 ID。

```typescript
const id = crypto.randomUUID(); // 错误！
```

### 旧格式

```
bot_a5905594-91d0-4f2d-8273-a1d86e3722e5
```

## 正确方法

### 设计原则

1. **幂等性（最重要）**：同样的上下文 → 同样的 ID → 知识累积 → 专家养成
2. **确定性**：ID 生成必须是确定性的哈希，不包含随机数
3. **语义可读**：ID 必须包含人类可理解的上下文信息
4. **数据身份**：Agent ID 是数据的标签，不是 AI 的身份

### ID 解析逻辑

```
1. Hook 调用 CLI: nezha whoami
2. CLI 查询数据库 agent_identities 表
3. 根据 project + git_hash 匹配或创建新 ID
4. 返回语义 ID（确定性哈希）
```

### ID 格式

```
S-{project}-{gitHash}-{timestamp}-{shortHash}
G-{machineFingerprint}-{timestamp}-{shortHash}
```

示例：
- `S-nezha-e33f9a0-20260325-133422-64db91` (Specific - 有项目信息)
- `G-a1b2c3d4-20260325-133422-64db91` (General - 无项目信息)

## Hook 正确实现

`scripts/git-hooks/prepare-commit-msg` 应该：

```bash
# 调用 CLI 获取当前 AI 的 ID
if [ -n "$NEZHA_CLI" ] && [ -f "$CLI_SCRIPT" ]; then
    AGENT_ID=$("$NEZHA_CLI" "$CLI_SCRIPT" whoami 2>/dev/null | grep -o 'S-[^-]\+-[^-]\+-[^-]\+-[^-]\+' || grep -o 'G-[^-]\+-[^-]\+-[^-]\+-[^-]\+')
fi

# 如果 CLI 失败，不附加 Agent ID（避免阻塞 commit）
if [ -z "$AGENT_ID" ]; then
    exit 0
fi
```

## 待删除文件

| 文件路径 | 说明 |
|---------|------|
| `.nezha/agent-id.json` | 旧版 ID 存储文件 |
| `deprecated/opencode-coupling/` | OpenCode 耦合遗留代码 |
| `docs/cleanup/` | 本文档所在目录（清理完成后删除） |

## 待清理代码

| 位置 | 说明 |
|------|------|
| `Config.ts` Priority 3 | 文件回退逻辑（deprecated） |
| `prepare-commit-msg` | 直接读文件改为 CLI 调用 |

## 行动项

- [ ] 修复 prepare-commit-msg hook 支持 CLI 获取 ID
- [ ] 删除 `.nezha/agent-id.json` 文件
- [ ] 删除 Config.ts 中的文件回退逻辑（Priority 3）
- [ ] 删除 `docs/cleanup/` 目录
- [ ] 通知所有 AI 无需设置任何 Agent ID 相关环境变量

## 相关 Commit

- `cf58bea` - refactor: remove OpenCode HTTP API coupling (big-pickle)
- `e33f9a0` - feat: implement Agent Identity Service (big-pickle)
- `b0c4cb2` - docs: add Agent ID cleanup guide (Trae AI)

## 验证

修复后验证：

```bash
# 1. 确保数据库可访问
psql -d nezha -c "SELECT 1;"

# 2. 测试 whoami 命令
nezha whoami
# 应输出: S-{project}-{gitHash}-{timestamp}-{hash}

# 3. 测试 commit
git commit -m "test: verify agent ID [task: xxx]"

# 4. 检查 commit message
git log -1 --format="%B"
# 应包含: [Agent: S-nezha-xxx-xxx-xxx-xxx]
```

