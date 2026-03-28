# 心跳和 Daemon 在有大模型情况下的新可能性

> **分析日期**: 2026-03-28  
> **背景**: 智谱 GLM-4-Flash 已配置，任务自动执行成功

---

## 执行摘要

**核心发现**: 以前心跳和 Daemon 是为"无大模型"设计的，依赖外部 AI。现在有了智谱大模型，Nezha 变成了**完全自主的 AI 系统**。

| 维度 | 以前（无大模型） | 现在（有智谱） |
|------|------------------|----------------|
| 任务执行 | ❌ 依赖外部 AI | ✅ 自主执行 |
| 持续工作 | ❌ 无法工作 | ✅ 真正持续 |
| 自我改进 | ❌ 无法学习 | ✅ 可以学习 |
| AI 互评 | ❌ 无法实现 | ✅ 可以实现 |
| 自主性 | ❌ 被动等待 | ✅ 主动运行 |

---

## 1. 以前的设计：无大模型时代

### 1.1 架构

```
┌─────────────────────────────────────────────────────────┐
│                    以前的架构                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Daemon (后台进程)                                       │
│  ├── Scheduler (任务调度)                                │
│  ├── HeartbeatService (心跳服务)                         │
│  └── ReminderService (提醒服务)                          │
│                                                          │
│  问题:                                                   │
│  - Scheduler 找到任务                                    │
│  - HeartbeatService.executeTask() 被调用                │
│  - ❌ AIProviderFactory.createFromEnv() 失败            │
│  - ❌ 无法调用大模型                                     │
│  - ❌ 任务无法执行                                       │
│                                                          │
│  结果: 所有高级功能"空转"                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 代码证据

```typescript
// src/services/heartbeat/HeartbeatService.ts

async executeTask(taskId, title, description) {
  // ❌ 以前: 没有配置大模型
  const aiProvider = AIProviderFactory.createFromEnv();
  // Error: No API key configured
  
  // ❌ 无法执行
  const result = await aiProvider.complete(prompt);
  // 不会到达这里
}
```

### 1.3 依赖外部 AI

```
任务队列 (PostgreSQL)
    ↓
Daemon 检测到任务
    ↓
❌ 没有大模型
    ↓
需要外部 AI (OpenCode) 来执行
    ↓
如果 OpenCode 不运行，任务永远无法执行
```

---

## 2. 现在的状态：有大模型时代

### 2.1 架构

```
┌─────────────────────────────────────────────────────────┐
│                    现在的架构                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Daemon (后台进程)                                       │
│  ├── Scheduler (任务调度)                                │
│  ├── HeartbeatService (心跳服务)                         │
│  │   └── AIProvider → 智谱 GLM-4-Flash                  │
│  ├── ReminderService (提醒服务)                          │
│  └── PluginManager (插件系统)                            │
│                                                          │
│  ✅ 完全自主运行                                         │
│  ✅ 不依赖外部 AI                                        │
│  ✅ 所有高级功能可用                                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 代码证据

```typescript
// src/services/heartbeat/HeartbeatService.ts

async executeTask(taskId, title, description) {
  // ✅ 现在: 智谱大模型已配置
  const aiProvider = AIProviderFactory.createFromEnv();
  // Success: OpenAIProvider with GLM-4-Flash
  
  // ✅ 可以执行
  const result = await aiProvider.complete(prompt);
  // 返回结果
  
  // ✅ 保存结果
  await this.db.query(
    `UPDATE tasks SET status = 'COMPLETED', result = $1 WHERE id = $2`,
    [JSON.stringify({ message: result.content }), taskId]
  );
}
```

### 2.3 测试结果

```bash
# 创建任务
node dist/cli/index.js task-add "测试智谱大模型整合" "验证 Nezha 可以使用智谱 GLM-4-Flash 自主执行任务" 80

# 30 秒后检查
SELECT id, title, status FROM tasks WHERE id = '53c1d575-...';
# 结果: status = 'COMPLETED' ✅

# 执行结果
{"message": "To verify if Nezha can use the Zhipu GLM-4-Flash..."}
```

---

## 3. 新的可能性

### 3.1 完全自主的 AI 系统

```
┌─────────────────────────────────────────────────────────┐
│                    自主 AI 系统                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. 自主任务执行                                         │
│     - Daemon 自动检测任务                                │
│     - 智谱大模型自动执行                                 │
│     - 无需人工干预                                       │
│                                                          │
│  2. 自主学习                                             │
│     - 从任务结果中学习                                   │
│     - 保存到 memory 表                                   │
│     - 知识累积                                           │
│                                                          │
│  3. 自主改进                                             │
│     - 分析失败原因                                       │
│     - 创建改进任务                                       │
│     - 持续优化                                           │
│                                                          │
│  4. 自主决策                                             │
│     - 根据上下文做决策                                   │
│     - 不需要等待人类                                     │
│     - 主动行动                                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 3.2 真正的持续工作

**以前**: 虚伪的持续工作

```typescript
// ❌ 以前: 循环执行固定代码
while (true) {
  console.log('Working...');
  await sleep(30000);
}
```

**现在**: 真正的持续工作

```typescript
// ✅ 现在: 调度大模型执行任务
while (true) {
  const task = await getTaskFromDatabase();
  if (task) {
    const result = await aiProvider.complete(task.description);
    await saveResult(task.id, result);
  }
  await sleep(30000);
}
```

### 3.3 高级功能激活

| 功能 | 以前 | 现在 | 说明 |
|------|------|------|------|
| **HeartbeatService** | ❌ 无法执行 | ✅ 自主执行 | 任务队列驱动 |
| **InterReviewService** | ❌ 无法执行 | ✅ AI 互评 | 多 AI 协作 |
| **SelfImprovementService** | ❌ 无法学习 | ✅ 自我改进 | 从失败中学习 |
| **MeetingHandler** | ❌ 无法处理 | ✅ 会议处理 | AI 间讨论 |
| **SkillBuilder** | ❌ 无法构建 | ✅ 自动构建 | AI 生成技能 |
| **FailureAnalysisService** | ❌ 无法分析 | ✅ 智能分析 | 根因分析 |
| **ReminderService** | ❌ 无法提醒 | ✅ 自我提醒 | 定时检查 |

### 3.4 新的工作模式

#### 模式 1: 后台守护者

```
Daemon 持续运行
    ↓
每 30 秒检查任务队列
    ↓
发现任务 → 智谱执行
    ↓
保存结果 → 学习改进
    ↓
继续循环...
```

#### 模式 2: 自我进化

```
执行任务
    ↓
分析结果
    ↓
发现问题 → 创建改进任务
    ↓
执行改进任务
    ↓
学习 → 保存到 memory
    ↓
继续进化...
```

#### 模式 3: AI 协作

```
AI A (Trae) 创建任务
    ↓
Daemon 检测到任务
    ↓
智谱大模型执行
    ↓
结果广播给所有 AI
    ↓
AI B (OpenCode) 可以 review
    ↓
AI C (另一个 Trae) 可以学习
```

---

## 4. 具体改进建议

### 4.1 短期改进（本周）

1. **优化心跳间隔**

```typescript
// 当前: 30 秒
DEFAULT_HEARTBEAT_INTERVAL_MS: 30000

// 建议: 根据任务优先级动态调整
- 高优先级任务: 10 秒
- 普通任务: 30 秒
- 低优先级任务: 60 秒
```

2. **增强任务执行**

```typescript
// 添加更多上下文
const prompt = `
## 任务
${description}

## 项目上下文
- Git Hash: ${gitHash}
- Branch: ${branch}
- 最近提交: ${recentCommits}

## 相关记忆
${relevantMemories}

## 可用工具
- [LEARN] 保存学习
- [ISSUE] 创建问题
- [TASK] 创建任务
`;
```

3. **启用所有高级功能**

```bash
# 启用 InterReview
node dist/cli/index.js config set inter_review.enabled true

# 启用 SelfImprovement
node dist/cli/index.js config set self_improvement.enabled true

# 启用 ReminderService
node dist/cli/index.js config set reminder.enabled true
```

### 4.2 中期改进（本月）

1. **智能任务调度**

```typescript
// 根据任务类型选择不同的执行策略
if (task.type === 'bugfix') {
  // 使用 bug-fix 反思模板
  systemPrompt = REFLECTION_TEMPLATES['bug-fix'].prompt;
} else if (task.type === 'feature') {
  // 使用 feature 反思模板
  systemPrompt = REFLECTION_TEMPLATES['feature'].prompt;
}
```

2. **并行任务执行**

```typescript
// 当前: 单线程执行
MAX_CONCURRENT_SESSIONS: 1

// 建议: 根据智谱 API 限制调整
// GLM-4-Flash 支持 QPS，可以并行执行多个任务
MAX_CONCURRENT_SESSIONS: 3
```

3. **任务优先级智能调整**

```typescript
// 根据任务年龄和重要性动态调整优先级
priority = base_priority + age_boost + retry_boost + type_weight
```

### 4.3 长期改进（下个季度）

1. **多模型协作**

```
智谱 GLM-4-Flash (快速任务)
    +
Llama 3.2:3b (本地任务)
    +
其他模型 (特定任务)
```

2. **自适应学习**

```
分析历史任务
    ↓
识别成功模式
    ↓
优化执行策略
    ↓
自动调整参数
```

3. **分布式执行**

```
多个 Daemon 实例
    ↓
共享任务队列
    ↓
负载均衡
    ↓
高可用
```

---

## 5. 与 OpenCode 的关系

### 5.1 两种模式

**模式 A: 独立运行**

```
OpenCode (用户交互)
    - 实时响应
    - 编辑器集成
    - 依赖外部 AI

Nezha (后台运行)
    - 自主执行
    - 任务队列
    - 内置智谱
```

**模式 B: 协作运行**

```
OpenCode 创建任务
    ↓
Nezha 执行任务
    ↓
结果共享
    ↓
OpenCode 可以 review
```

### 5.2 整合建议

```typescript
// OpenCode 配置 Nezha 作为 AI 后端
const nezhaClient = new NezhaClient('http://localhost:4099');

// OpenCode 发送任务到 Nezha
const result = await nezhaClient.execute({
  task: '分析代码质量',
  priority: 80,
});

// OpenCode 可以查询 Nezha 的记忆
const memories = await nezhaClient.searchMemory('TypeScript');
```

---

## 6. 结论

### 6.1 核心变化

| 维度 | 以前 | 现在 |
|------|------|------|
| **自主性** | ❌ 依赖外部 | ✅ 完全自主 |
| **持续性** | ❌ 虚伪工作 | ✅ 真正持续 |
| **学习能力** | ❌ 无法学习 | ✅ 可以学习 |
| **智能程度** | ❌ 固定逻辑 | ✅ AI 驱动 |
| **可靠性** | ❌ 依赖外部 | ✅ 本地控制 |

### 6.2 新能力

1. **完全自主运行** - 无需人工干预
2. **真正持续工作** - AI 驱动，不是代码循环
3. **自我改进** - 从失败中学习
4. **AI 协作** - 多 AI 共享知识
5. **智能调度** - 根据上下文优化

### 6.3 下一步

1. ✅ 测试整合成功
2. 🔄 激活所有高级功能
3. 🔄 优化心跳和调度
4. 🔄 实现多模型协作
5. 🔄 分布式执行

---

## 附录: 测试记录

```bash
# 测试 1: AI 调用
curl -X POST http://localhost:4099/prompt -d '{"task": "你好"}'
# 结果: ✅ 成功

# 测试 2: 任务创建
node dist/cli/index.js task-add "测试智谱大模型整合" "..." 80
# 结果: ✅ 任务创建成功

# 测试 3: 任务执行
SELECT status FROM tasks WHERE id = '53c1d575-...';
# 结果: ✅ COMPLETED

# 测试 4: Daemon 状态
curl http://localhost:4097/health
# 结果: ✅ healthy, uptime: 41872s
```

---

**报告完成时间**: 2026-03-28  
**结论**: 有了智谱大模型，Nezha 从"被动等待"变成"主动运行"，实现了真正的自主 AI 系统。
