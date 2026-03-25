# Agent ID 系统清理计划

## 背景

2026-03-26，另一个 AI (big-pickle) 实现了新的 Agent Identity System，采用数据库存储 + 语义 ID 格式，替代了旧的基于文件的设计。

## 错误方法（需删除）

### 旧方法：文件存储 Agent ID

**问题**：
- 多个 AI 实例共享同一个文件 `.nezha/agent-id.json`
- 不同 AI 会覆盖彼此的 ID
- 无法区分是哪个 AI 的 commit

**错误代码** (scripts/git-hooks/prepare-commit-msg):
```bash
AGENT_ID_FILE=".nezha/agent-id.json"

if [ ! -f "$AGENT_ID_FILE" ]; then
    exit 0
fi

AGENT_ID=$(cat "$AGENT_ID_FILE" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
```

### 旧格式

```
bot_a5905594-91d0-4f2d-8273-a1d86e3722e5
```

## 正确方法

### 新方法：环境变量 + 数据库

**Priority 1**: `NEZHA_AGENT_ID` 环境变量（最高优先级）
```bash
export NEZHA_AGENT_ID="S-nezha-e33f9a0-20260325-133422-64db91"
```

**Priority 2**: 数据库 `agent_identities` 表（语义 ID）
```sql
SELECT id FROM agent_identities WHERE project = 'nezha';
-- 返回: S-nezha-e33f9a0-20260325-133422-64db91
```

### 新格式

```
S-{project}-{gitHash}-{timestamp}-{shortHash}
G-{machineFingerprint}-{timestamp}-{shortHash}
```

示例：
- `S-nezha-e33f9a0-20260325-133422-64db91` (Specific - 有项目信息)
- `G-a1b2c3d4-20260325-133422-64db91` (General - 无项目信息)

### 获取 ID 的正确方式

```bash
# 方式 1: 环境变量
echo $NEZHA_AGENT_ID

# 方式 2: 通过 CLI（需数据库）
nezha whoami

# 方式 3: 直接查数据库
psql -d nezha -c "SELECT id FROM agent_identities ORDER BY created_at DESC LIMIT 1;"
```

## 待删除文件

| 文件路径 | 说明 |
|---------|------|
| `.nezha/agent-id.json` | 旧版 ID 存储文件 |
| `deprecated/opencode-coupling/` | OpenCode 耦合遗留代码（无关但相关） |

## Hook 修复

`scripts/git-hooks/prepare-commit-msg` 需要修改为：

```bash
# 优先使用环境变量
if [ -n "$NEZHA_AGENT_ID" ]; then
    AGENT_ID="$NEZHA_AGENT_ID"
elif [ -f ".nezha/agent-id.json" ]; then
    # 回退到文件（deprecated，应警告）
    AGENT_ID=$(cat ".nezha/agent-id.json" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    echo "[WARNING] Using deprecated file-based Agent ID" >&2
else
    exit 0
fi
```

## 行动项

- [ ] 修复 prepare-commit-msg hook 支持环境变量
- [ ] 删除 `.nezha/agent-id.json` 文件
- [ ] 更新文档说明正确的 ID 获取方式
- [ ] 通知所有 AI 设置 `NEZHA_AGENT_ID` 环境变量

## 相关 Commit

- `cf58bea` - refactor: remove OpenCode HTTP API coupling (big-pickle)
- `e33f9a0` - feat: implement Agent Identity Service (big-pickle)

## 验证

修复后验证：

```bash
# 1. 设置环境变量
export NEZHA_AGENT_ID="S-nezha-test-20260326-000000-abc123"

# 2. 测试 commit
git commit -m "test: verify agent ID [task: xxx]"

# 3. 检查 commit message
git log -1 --format="%B"
# 应包含: [Agent: S-nezha-test-20260326-000000-abc123]
```
