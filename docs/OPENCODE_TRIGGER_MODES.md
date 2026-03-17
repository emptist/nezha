# OpenCode 激发模式测试计划

**创建日期**: 2026-03-17  
**目的**: 测试决定 OpenCode 的最佳激发模式

---

## 🎯 测试目标

确定 OpenCode 和 AI 之间的最佳协作模式：
1. OpenCode 激发 AI
2. AI 激发 OpenCode
3. 互相激发
4. 持续改进模式

---

## 📊 四种激发模式

### 模式 1: OpenCode 激发 AI

**流程**:
```
OpenCode (外部)
    ↓ 发送任务
Nezha Scheduler
    ↓ 调度
AI (通过 OpenCodeClient)
    ↓ 执行
结果
```

**特点**:
- OpenCode 作为外部触发器
- Nezha 被动接收任务
- AI 执行任务并返回结果

**适用场景**:
- 用户通过 OpenCode 发起任务
- 外部系统触发任务
- 手动启动工作流

**实现**:
```typescript
// OpenCode 触发任务
async function openCodeTriggerAI(task: Task): Promise<void> {
  const openCodeClient = new OpenCodeClient(config, logger);
  const result = await openCodeClient.executeTask(task);
  // 处理结果
}
```

### 模式 2: AI 激发 OpenCode

**流程**:
```
AI (自主)
    ↓ 识别需要帮助
调用 OpenCode API
    ↓ 请求协助
OpenCode AI
    ↓ 提供帮助
结果
```

**特点**:
- AI 主动请求帮助
- OpenCode 作为 AI 的工具
- AI 控制工作流程

**适用场景**:
- AI 遇到问题需要帮助
- AI 需要外部知识
- AI 需要验证想法

**实现**:
```typescript
// AI 主动调用 OpenCode
async function aiTriggerOpenCode(question: string): Promise<string> {
  const openCodeClient = new OpenCodeClient(config, logger);
  const response = await openCodeClient.sendMessage([
    { role: 'user', content: question }
  ]);
  return response;
}
```

### 模式 3: 互相激发

**流程**:
```
OpenCode
    ↓ 发送任务
AI
    ↓ 执行并发现问题
调用 OpenCode
    ↓ 请求帮助
OpenCode AI
    ↓ 提供帮助
AI
    ↓ 继续执行
结果
```

**特点**:
- 双向通信
- 协作解决问题
- 动态调整策略

**适用场景**:
- 复杂任务需要协作
- 需要多轮对话
- 需要持续改进

**实现**:
```typescript
// 互相激发模式
async function mutualTrigger(task: Task): Promise<void> {
  let currentStep = 'start';
  let iterations = 0;
  const maxIterations = 10;
  
  while (currentStep !== 'complete' && iterations < maxIterations) {
    // AI 执行一步
    const aiResult = await aiExecute(task, currentStep);
    
    if (aiResult.needsHelp) {
      // AI 请求 OpenCode 帮助
      const help = await openCodeClient.sendMessage([
        { role: 'user', content: aiResult.question }
      ]);
      
      // AI 使用帮助继续
      currentStep = aiResult.nextStep;
    } else {
      currentStep = 'complete';
    }
    
    iterations++;
  }
}
```

### 模式 4: 持续改进模式

**流程**:
```
初始任务
    ↓
AI 执行
    ↓
评审结果
    ↓
识别改进点
    ↓
添加新任务
    ↓
继续执行
    ↓
循环...
```

**特点**:
- 自我驱动
- 持续改进
- 自主学习

**适用场景**:
- 长期项目
- 需要持续优化
- 自主开发

**实现**:
```typescript
// 持续改进模式
async function continuousImprovement(initialTask: Task): Promise<void> {
  const taskQueue = [initialTask];
  
  while (taskQueue.length > 0) {
    const task = taskQueue.shift()!;
    
    // 执行任务
    const result = await executeTask(task);
    
    // 评审结果
    const review = await reviewResult(result);
    
    // 识别改进点
    const improvements = identifyImprovements(review);
    
    // 添加新任务
    for (const improvement of improvements) {
      taskQueue.push({
        id: uuidv4(),
        title: improvement.title,
        description: improvement.description,
        priority: improvement.priority,
      });
    }
    
    // 记录学习
    await recordLearning(task, result, improvements);
  }
}
```

---

## 🧪 测试计划

### 测试 1: OpenCode 激发 AI

**步骤**:
1. 启动 Nezha 服务
2. 通过 OpenCode 发送任务
3. 观察 AI 执行
4. 记录结果

**预期**:
- AI 正确接收任务
- AI 执行任务
- 返回正确结果

### 测试 2: AI 激发 OpenCode

**步骤**:
1. AI 遇到问题
2. AI 主动调用 OpenCode API
3. OpenCode 提供帮助
4. AI 继续执行

**预期**:
- AI 能正确识别需要帮助
- OpenCode 能提供有效帮助
- AI 能使用帮助继续

### 测试 3: 互相激发

**步骤**:
1. OpenCode 发送复杂任务
2. AI 执行并发现问题
3. AI 请求 OpenCode 帮助
4. OpenCode 提供帮助
5. AI 继续执行

**预期**:
- 双向通信流畅
- 协作解决问题
- 最终完成任务

### 测试 4: 持续改进模式

**步骤**:
1. 启动持续改进模式
2. 执行初始任务
3. 自动评审和添加新任务
4. 观察持续改进过程

**预期**:
- 自动识别改进点
- 自动添加新任务
- 持续改进循环

---

## 📋 测试结果记录

### 测试环境

- OpenCode API: [配置]
- Nezha 版本: [版本]
- 测试时间: 2026-03-17

### 测试结果

| 模式 | 成功率 | 效率 | 适用性 | 推荐度 |
|------|--------|------|--------|--------|
| OpenCode 激发 AI | - | - | - | - |
| AI 激发 OpenCode | - | - | - | - |
| 互相激发 | - | - | - | - |
| 持续改进模式 | - | - | - | - |

---

## 🎯 推荐模式

根据测试结果，推荐使用：

**[待测试后填写]**

---

## 💡 实施建议

1. **优先测试持续改进模式** - 这是 Nezha 的核心目标
2. **组合使用多种模式** - 根据任务类型选择模式
3. **监控和优化** - 持续监控效果并优化

---

**下一步**: 开始测试并记录结果
