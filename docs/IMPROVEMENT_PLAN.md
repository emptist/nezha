# Nezha 改进和整合完善计划

**创建日期**: 2026-03-17  
**版本**: 1.0  
**目的**: 基于既往经验，制定全面的改进和整合计划

---

## 📚 既往经验总结

### 1. 从 OpenClaw (龙虾) 学到的经验

#### ✅ 成功经验
1. **对话记录系统** - JSONL 格式记录所有 AI 对话
   - 位置: `.tmp/nezha_session_*.json`
   - 格式: `{info, messages: [{info, parts}]}`
   - 价值: 可回放、可学习、可调试

2. **持续工作机制** - heartbeat + cron
   - 心跳触发定期检查
   - 任务队列管理
   - 自动执行和监控

3. **记忆系统** - 文件系统 + PostgreSQL
   - HEARTBEAT.md 作为任务清单
   - memory/ 目录存储知识
   - PostgreSQL 数据库存储结构化数据

4. **Gateway 机制** - WebSocket 服务器
   - 统一通信入口
   - RPC 方法调用
   - 通道管理

#### ❌ 失败教训
1. **记忆系统分散** - 文件系统和数据库分离，难以整合
2. **缺少自主学习** - 需要插件支持，不够自动化
3. **配置复杂** - 多个配置文件，容易出错

### 2. 从 Nezha 当前实现学到的经验

#### ✅ 已实现的功能
1. **数据库记忆系统** - PostgreSQL + pgvector
   - 结构化存储
   - 语义检索能力
   - 持久化保证

2. **任务调度系统** - Scheduler + HeartbeatService
   - 任务队列管理
   - 心跳机制
   - 状态跟踪

3. **对话记录系统** - ConversationLogger
   - JSONL 格式记录
   - 会话索引
   - 可检索和回放

#### ❌ 存在的问题
1. **数据库连接问题** - PostgreSQL 认证配置不正确
2. **OpenCode 未集成** - 没有使用 OpenCode API
3. **记忆系统未整合** - 文件系统和数据库未结合
4. **持续工作未启动** - HeartbeatService 未运行
5. **缺少自主学习** - 没有从对话中学习的机制

---

## 🎯 改进和整合计划

### Phase 1: 基础设施修复 (优先级: HIGH)

#### 1.1 修复数据库连接

**问题**: PostgreSQL 使用 trust 认证，但 TCP 连接要求密码

**解决方案**:
```bash
# 方案 1: 修改 pg_hba.conf (推荐)
echo "host    all             all             127.0.0.1/32            trust" >> pg_hba.conf
echo "host    all             all             ::1/128                 trust" >> pg_hba.conf

# 方案 2: 使用 Unix socket
# 修改 .env: NEZHA_DB_HOST=/tmp
```

**验证**:
```bash
node dist/cli/index.js tasks
```

**预期结果**: 成功列出任务列表

#### 1.2 创建数据库和表

**步骤**:
```bash
# 1. 创建数据库
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -c "CREATE DATABASE nezha;"

# 2. 运行迁移
/Applications/Postgres.app/Contents/Versions/18/bin/psql -U postgres -d nezha -f src/db/migrations/001_initial.sql
```

**验证**:
```bash
node dist/cli/index.js tasks
```

**预期结果**: 成功连接数据库，表已创建

---

### Phase 2: OpenCode API 集成 (优先级: HIGH)

#### 2.1 创建 OpenCodeClient

**文件**: `src/core/OpenCodeClient.ts`

**功能**:
- 连接 OpenCode API
- 发送任务请求
- 接收 AI 响应
- 记录对话日志

**接口**:
```typescript
export interface OpenCodeConfig {
  apiUrl: string;
  apiKey?: string;
  modelId: string;
  providerId: string;
}

export class OpenCodeClient {
  constructor(config: OpenCodeConfig, logger: ConversationLogger);
  
  async executeTask(task: Task): Promise<TaskResult>;
  async sendMessage(message: string): Promise<string>;
  async streamResponse(message: string): AsyncIterator<string>;
}
```

#### 2.2 集成到 Agent

**修改**: `src/core/Agent.ts`

**功能**:
- 使用 OpenCodeClient 执行任务
- 记录所有对话
- 处理错误和重试

**代码示例**:
```typescript
export class Agent {
  private openCodeClient: OpenCodeClient;
  private conversationLogger: ConversationLogger;
  
  async executeTask(task: Task): Promise<TaskResult> {
    const sessionId = this.conversationLogger.startConversation({
      id: task.id,
      title: task.title,
      description: task.description,
    });
    
    try {
      const result = await this.openCodeClient.executeTask(task);
      this.conversationLogger.endConversation({
        success: true,
        output: result.output,
        artifacts: result.artifacts,
      });
      return result;
    } catch (error) {
      this.conversationLogger.endConversation({
        success: false,
        output: error.message,
        artifacts: [],
      });
      throw error;
    }
  }
}
```

---

### Phase 3: 混合记忆系统 (优先级: HIGH)

#### 3.1 设计混合记忆架构

**原则**:
- **Nezha 自身开发**: 使用文件系统 (HEARTBEAT.md, memory/)
- **其他项目**: 使用数据库 (避免内容混乱)

**架构**:
```
MemoryService
    ├── FileSystemMemory (Nezha's own development)
    │   ├── HEARTBEAT.md (task list)
    │   ├── memory/ (knowledge storage)
    │   └── conversations/ (conversation logs)
    └── DatabaseMemory (Other projects)
        ├── memories table
        ├── conversations table
        └── knowledge table
```

#### 3.2 实现混合记忆服务

**文件**: `src/services/HybridMemoryService.ts`

**接口**:
```typescript
export class HybridMemoryService {
  private fileSystemMemory: FileSystemMemory;
  private databaseMemory: DatabaseMemory;
  
  async store(entry: MemoryEntry, scope: 'nezha' | 'project'): Promise<void>;
  async retrieve(query: string, scope?: 'nezha' | 'project'): Promise<MemoryEntry[]>;
  async search(query: string, options?: SearchOptions): Promise<MemoryEntry[]>;
}
```

---

### Phase 4: 持续工作机制 (优先级: HIGH)

#### 4.1 启动 HeartbeatService

**步骤**:
1. 修复数据库连接
2. 添加初始任务到数据库
3. 启动 HeartbeatService
4. 监控执行状态

**命令**:
```bash
# 添加初始任务
node dist/cli/index.js task-add "Integrate OpenCode API" "Create OpenCodeClient and integrate with Agent" 10

# 启动服务
node dist/cli/index.js start
```

#### 4.2 实现自主任务添加

**功能**:
- AI 执行完任务后，自动评审结果
- 识别改进点
- 自主添加新任务

**代码示例**:
```typescript
async reviewAndAddTasks(result: TaskResult): Promise<void> {
  const review = await this.openCodeClient.sendMessage(`
    Review the following task result and identify improvements:
    ${JSON.stringify(result)}
    
    Suggest 3-5 follow-up tasks to improve the system.
  `);
  
  const tasks = this.parseTasks(review);
  for (const task of tasks) {
    await this.scheduler.addTask(task);
  }
}
```

---

### Phase 5: 自主学习机制 (优先级: MEDIUM)

#### 5.1 从对话中学习

**功能**:
- 分析对话记录
- 提取知识点
- 存储到记忆系统

**实现**:
```typescript
export class LearningService {
  async learnFromConversation(sessionId: string): Promise<KnowledgeEntry[]> {
    const conversation = await this.conversationLogger.getConversationLog(sessionId);
    const insights = await this.extractInsights(conversation);
    return await this.storeKnowledge(insights);
  }
  
  private async extractInsights(conversation: ConversationLog): Promise<Insight[]> {
    // Use OpenCode to analyze conversation and extract insights
  }
}
```

#### 5.2 定期知识整理

**功能**:
- 定期整理记忆
- 合并相似知识点
- 删除过时信息

**实现**:
```typescript
async consolidate(): Promise<void> {
  const memories = await this.memoryService.retrieve('all');
  const consolidated = await this.openCodeClient.sendMessage(`
    Consolidate the following memories:
    ${JSON.stringify(memories)}
    
    Merge similar entries, remove duplicates, and organize by topic.
  `);
  
  await this.memoryService.store(consolidated);
}
```

---

## 📊 成功指标

### 短期目标 (1周内)

- [ ] 数据库连接正常工作
- [ ] OpenCode API 集成完成
- [ ] HeartbeatService 正常运行
- [ ] 至少完成 3 个任务
- [ ] 所有对话都被记录

### 中期目标 (1个月内)

- [ ] 混合记忆系统完整实现
- [ ] 自主学习机制运行
- [ ] AI 能够自主添加任务
- [ ] 知识库持续增长
- [ ] 系统稳定性达到 95%

### 长期目标 (3个月内)

- [ ] 完全自主运行
- [ ] 能够处理复杂项目
- [ ] 知识库包含 100+ 条目
- [ ] 支持多项目并行
- [ ] 达到 OpenClaw 的水平

---

## 🚀 立即行动

### 当前优先级最高的任务

1. **修复数据库连接** - 这是所有其他功能的基础
2. **集成 OpenCode API** - 这是 AI 执行任务的关键
3. **启动持续工作** - 这是自主运行的前提

### 下一步行动

1. 修改 `pg_hba.conf` 添加 trust 认证
2. 创建数据库和表
3. 实现 `OpenCodeClient`
4. 集成到 `Agent`
5. 添加初始任务
6. 启动 `HeartbeatService`

---

## 💡 关键洞察

### Nezha 的核心价值

**Nezha 不是工作者，而是调度器和记忆工具**。它的价值在于：

1. **帮助** AI - 提供记忆、上下文、工具
2. **激发** AI - 设置任务、挑战、目标
3. **监测** AI - 跟踪进度、评估结果、识别改进

### 持续工作的关键

**持续工作不是程序循环执行，而是 AI 持续工作**。关键要素：

1. **任务来源** - 数据库、文件、自主添加
2. **执行主体** - AI (通过 OpenCode API)
3. **记忆支持** - 文件系统 + 数据库
4. **学习改进** - 从对话中学习，持续优化

### 自主学习的核心

**自主学习不是被动记录，而是主动提取和应用**。关键步骤：

1. **记录** - 所有对话都被记录
2. **分析** - 从对话中提取知识点
3. **存储** - 存入记忆系统
4. **应用** - 在后续任务中应用知识
5. **改进** - 持续优化知识库

---

## 📋 检查清单

在继续之前，确保：

- [ ] 理解了 Nezha 的角色定位
- [ ] 理解了持续工作的真正含义
- [ ] 理解了自主学习的重要性
- [ ] 明确了改进和整合的优先级
- [ ] 准备好开始实施计划

---

**结论**: 通过系统化的改进和整合，Nezha 将成为一个真正能够持续自主工作的 AI 开发助手。关键是要记住：Nezha 是工具，AI 是工作者，持续工作需要 AI 的参与，自主学习需要从对话中提取知识。
