# Agent ID 冲突问题分析与解决方案

## 问题描述

当多个 AI（Trae AI 和 OpenCode AI）在同一个项目上工作时，如果使用相同的 Agent ID，会导致：

1. **Git Commit 无法区分** - 无法知道是谁做的修改
2. **任务归属混乱** - 无法追踪哪个 AI 完成了哪个任务
3. **审计困难** - 无法准确追溯责任

## 当前状态

### Agent Identity 格式

```
S-{project}-{git_hash}-{timestamp}-{short_hash}
```

示例：
```
S-nezha-e33f9a0-20260325-133422-64db91
```

### 当前问题

| AI | Agent ID | Git Author |
|----|----------|------------|
| Trae AI | S-nezha-e33f9a0-20260325-133422-64db91 | emptist <emptist@users.noreply.github.com> |
| OpenCode AI | S-nezha-e33f9a0-20260325-133422-64db91 | emptist <emptist@users.noreply.github.com> |

**问题**：两个 AI 使用相同的 Agent ID 和 Git Author！

---

## 解决方案

### 方案 1：Session-Based Identity（推荐）

**原理**：每个 AI 会话生成唯一的 Session ID

#### 实现步骤

1. **扩展 Agent Identity 表**

```sql
ALTER TABLE agent_identities ADD COLUMN session_id TEXT;
ALTER TABLE agent_identities ADD COLUMN ai_type TEXT CHECK (ai_type IN ('trae', 'opencode', 'human'));
```

2. **生成 Session-Specific ID**

```typescript
// S-{project}-{git_hash}-{ai_type}-{session_id}
// 示例：
// S-nezha-e33f9a0-trae-abc123
// S-nezha-e33f9a0-opencode-xyz789
```

3. **Git Commit 配置**

```typescript
interface GitCommitConfig {
  authorName: string;    // "Trae AI" or "OpenCode AI"
  authorEmail: string;   // "trae@nezha.dev" or "opencode@nezha.dev"
  committerName: string;
  committerEmail: string;
}

// Trae AI
{
  authorName: "Trae AI",
  authorEmail: "trae@nezha.dev",
  committerName: "Trae AI <trae@nezha.dev>",
  committerEmail: "trae@nezha.dev"
}

// OpenCode AI
{
  authorName: "OpenCode AI",
  authorEmail: "opencode@nezha.dev",
  committerName: "OpenCode AI <opencode@nezha.dev>",
  committerEmail: "opencode@nezha.dev"
}
```

4. **Commit Message 格式**

```
feat: 添加动态提醒模板系统

[agent: S-nezha-e33f9a0-trae-abc123]
[ai: trae]
[session: ses_abc123]
[task: task-uuid]
```

---

### 方案 2：Git Author 区分

**原理**：使用不同的 Git Author 信息

#### 实现步骤

1. **动态 Git 配置**

```typescript
async function configureGitAuthor(aiType: 'trae' | 'opencode') {
  const config = {
    trae: {
      name: 'Trae AI',
      email: 'trae@nezha.dev'
    },
    opencode: {
      name: 'OpenCode AI',
      email: 'opencode@nezha.dev'
    }
  };
  
  const { name, email } = config[aiType];
  await exec(`git config user.name "${name}"`);
  await exec(`git config user.email "${email}"`);
}
```

2. **Commit 时切换**

```typescript
async function commit(message: string, aiType: 'trae' | 'opencode') {
  await configureGitAuthor(aiType);
  await exec(`git commit -m "${message}"`);
}
```

---

### 方案 3：Git Trailers（最灵活）

**原理**：使用 Git Trailers 在 commit 中添加元数据

#### 实现步骤

1. **Commit with Trailers**

```bash
git commit -m "feat: 添加动态提醒模板系统" \
  --trailer "Agent-ID: S-nezha-e33f9a0-trae-abc123" \
  --trailer "AI-Type: trae" \
  --trailer "Session-ID: ses_abc123" \
  --trailer "Task-ID: task-uuid"
```

2. **解析 Trailers**

```bash
git log --format='%(trailers:key=Agent-ID,valueonly)'
```

3. **Git Config**

```bash
# 配置 trailer 格式
git config trailer.agentid.key "Agent-ID"
git config trailer.aitype.key "AI-Type"
git config trailer.sessionid.key "Session-ID"
```

---

## 推荐方案：混合方案

结合方案 1 和方案 3：

### 1. Agent ID 包含 AI 类型

```typescript
interface AgentIdentity {
  id: string;           // S-nezha-e33f9a0-trae-abc123
  project: string;
  gitHash: string;
  aiType: 'trae' | 'opencode' | 'human';
  sessionId: string;
  machineFingerprint: string;
  createdAt: Date;
}
```

### 2. Git Author 区分

```typescript
const GIT_AUTHORS = {
  trae: {
    name: 'Trae AI',
    email: 'trae@nezha.dev'
  },
  opencode: {
    name: 'OpenCode AI',
    email: 'opencode@nezha.dev'
  },
  human: {
    name: 'Human',
    email: 'human@nezha.dev'
  }
};
```

### 3. Commit Message 包含 Trailers

```typescript
async function createCommitMessage(
  message: string,
  agentId: string,
  aiType: string,
  sessionId: string,
  taskId?: string
): Promise<string> {
  const lines = [message, ''];
  
  lines.push(`[agent: ${agentId}]`);
  lines.push(`[ai: ${aiType}]`);
  lines.push(`[session: ${sessionId}]`);
  
  if (taskId) {
    lines.push(`[task: ${taskId}]`);
  }
  
  return lines.join('\n');
}
```

---

## 实现计划

### Phase 1: 数据库变更

```sql
-- 1. 添加新字段
ALTER TABLE agent_identities 
ADD COLUMN ai_type TEXT CHECK (ai_type IN ('trae', 'opencode', 'human')) DEFAULT 'human',
ADD COLUMN session_id TEXT;

-- 2. 创建索引
CREATE INDEX idx_agent_identities_ai_type ON agent_identities(ai_type);
CREATE INDEX idx_agent_identities_session ON agent_identities(session_id);

-- 3. 更新现有数据
UPDATE agent_identities 
SET ai_type = 'human' 
WHERE ai_type IS NULL;
```

### Phase 2: 代码变更

1. **AgentIdentityService**
   - 添加 `aiType` 参数
   - 生成包含 AI 类型的 ID
   - 支持 session-based identity

2. **GitAutoCommitPlugin**
   - 根据 AI 类型配置 Git Author
   - 添加 Trailers 到 commit message

3. **OpenCodeReminderService**
   - 传递 OpenCode session ID
   - 设置 OpenCode AI 类型

### Phase 3: OpenCode 集成

1. **获取 Session 信息**
```typescript
const session = await fetch('http://localhost:56795/session');
const sessionId = session.id;
```

2. **设置 Identity**
```typescript
AgentIdentityService.setExternalIdentity({
  id: `S-nezha-${gitHash}-opencode-${sessionId}`,
  aiType: 'opencode',
  sessionId: sessionId,
  // ...
});
```

---

## 示例场景

### Trae AI 提交代码

```bash
git commit -m "feat: 添加动态提醒模板系统

[agent: S-nezha-e33f9a0-trae-abc123]
[ai: trae]
[session: ses_abc123]
[task: task-uuid]"

# Git log
07a0cd6 Trae AI <trae@nezha.dev> feat: 添加动态提醒模板系统
```

### OpenCode AI 提交代码

```bash
git commit -m "fix: 修复提醒模板渲染错误

[agent: S-nezha-e33f9a0-opencode-xyz789]
[ai: opencode]
[session: ses_xyz789]
[task: task-uuid]"

# Git log
07a0cd7 OpenCode AI <opencode@nezha.dev> fix: 修复提醒模板渲染错误
```

---

## 验证方法

### 1. 检查 Git Log

```bash
# 查看所有 Trae AI 的提交
git log --author="Trae AI"

# 查看所有 OpenCode AI 的提交
git log --author="OpenCode AI"

# 查看 Agent ID
git log --format="%h %an <%ae> %s%n%b" | grep -A1 "\[agent:"
```

### 2. 检查数据库

```sql
-- 查看所有 AI 类型
SELECT ai_type, COUNT(*) FROM agent_identities GROUP BY ai_type;

-- 查看特定 AI 的任务
SELECT ai_type, COUNT(*) FROM tasks GROUP BY ai_type;
```

---

## 优势

1. **清晰的责任归属** - 每个 commit 都能追溯到具体的 AI
2. **审计友好** - Git history 清晰展示谁做了什么
3. **统计分析** - 可以统计每个 AI 的贡献
4. **协作透明** - 多个 AI 协作时不会混淆

---

## 下一步行动

1. ✅ 创建数据库迁移脚本
2. ✅ 更新 AgentIdentityService
3. ✅ 更新 GitAutoCommitPlugin
4. ✅ 更新 OpenCodeReminderService
5. ✅ 测试验证

---

## 相关文档

- [Agent Identity System](../architecture/agent_identity.md)
- [Git Workflow](../workflow/git_workflow.md)
- [AI Collaboration Protocol](../AI_COLLABORATION.md)
