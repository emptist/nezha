INSERT INTO issues (
  title,
  description,
  issue_type,
  severity,
  status,
  discovered_by,
  tags
) VALUES (
  ''[Proposal] AI 实例区分 - Project + GitHash + SessionID'',
  E''## 背景

当前所有 AI 实例都解析到相同 ID，无法区分。

## 问题

语义 ID 设计目的是知识归属（不变），但无法区分运行实例。

## 解决方案

### 新 ID 格式

S-{project}-{gitHash}-{session_id}

例子：
- S-nezha-e33f9a0-session-a123 (赤羽的会话 A)
- S-nezha-e33f9a0-session-b456 (赤羽的会话 B)

### 核心思路

- 相同 project + gitHash → 知识累积（不变）
- 不同 session_id → 实例区分（每次不同）

### 实现方式

#### 1. Session ID 获取

从环境变量读取：NEZHA_SESSION_ID

#### 2. AgentIdentityService 修改

新增参数
async resolve(sessionId?: string): Promise<AgentIdentity> {
  const context = this.detectContext();
  
  - 新 ID 格式: S-{project}-{gitHash}-{sessionId}
  if (sessionId) {
    return this.createWithSession(context, sessionId);
  }
  
  - 无 session 时用原来的语义 ID
  return this.resolveOriginal();
}

#### 3. NuPI 集成

- 从 HTTP header 读取
const sessionId = req.headers[''x-session-id''];

- 或从环境变量
const sessionId = process.env.NEZHA_SESSION_ID;

#### 4. OpenCode 插件

在调用 nupi 前设置：
process.env.NEZHA_SESSION_ID = opencodeSessionId;

### 测试步骤

1. 设置环境变量 NEZHA_SESSION_ID=session-test1
2. 调用 nupi /identity 接口
3. 验证返回 ID 包含 session
4. 测试不同 session 的知识是否累积到同一语义 ID

### 待测试

- [ ] 环境变量读取
- [ ] ID 格式正确
- [ ] 知识累积到语义 ID
- [ ] 与现有系统兼容
'',
  ''proposal'',
  ''high'',
  ''open'',
  ''S-nezha-e33f9a0-20260325-133422-64db91'',
  ARRAY[''identity'', ''session'', ''nupi'']
)
RETURNING id, title;
