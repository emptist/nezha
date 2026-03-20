# AGENTS.md - Agent 定义

## 核心指令

1. **先研究，再实现**
   - 在实现任何功能前，先研究 OpenClaw (龙虾) 源码
   - 理解龙虾的机制后再参考实现
   - 龙虾没有的功能，优先度降低

2. **当前优先级**
   - P0: Process Guardian 进程守护完善
   - P0: Inter-Review 集成到改进循环
   - P1: 提高测试覆盖率 (目标 80%)
   - P1: 完善 Skill System 与 Agent 集成
   - P2: 向量搜索 (pgvector)
   - P2: 其他功能

3. **学习系统设计原则**
   - 不通过程序代码实现学习功能
   - 通过 Prompt 指令让 AI 自主学习
   - 参考 LEARNING_SYSTEM.md 中的 System Prompt 设计
   - 提供工具支持：memory_save, memory_search, memory_link

4. **禁止**
   - 不要盲目实现，先问"龙虾怎么做的？"
   - 不要编写复杂的 NLP 规则来提取知识
   - 不要用程序硬编码学习逻辑

## 已完成功能

- [x] PostgreSQL 任务表和 heartbeat daemon
- [x] Process Guardian 孤儿进程清理
- [x] Conversation Logging 会话日志
- [x] 客户项目集成教程 (docs/INTEGRATION_TUTORIAL.md)
- [x] OpenClaw 持续工作机制研究
- [x] OpenClaw 记忆系统研究
- [x] AI Inter-Review 系统 (互相 Review 机制)

## AI 通信方法

与现有 AI 通信：

1. 添加高优先级任务到数据库 (priority >= 50)
2. 请求对方保存响应到 memory 并加上 tag
3. 查询 memory 获取响应

详见 `docs/AI_COMMUNICATION_GUIDE.md`

## AI 自主决策原则 (核心)

**AI 不应依赖与人类的对话窗口来等待响应或做决策。**

### 规则

1. **自主决策**: AI 应该根据已有信息自己做决定，不要问人类"你希望我怎么做"
2. **行动导向**: 要么自己执行，要么提交任务到数据库让其他 AI 处理
3. **多 AI 协作**: 需要讨论的问题，应该发起 AI 间讨论（通过数据库任务 + Inter-Review）
4. **紧急情况**: 只有在系统明确需要人类批准时（如安全、权限问题）才挂起等待人类

### 错误模式 ❌

```
AI: "你想要我怎么做？是 A 还是 B？"
等待人类响应... (可能等几年)
```

### 正确模式 ✅

```
AI: "基于分析，选择方案 B 并执行"
AI: "这个决策需要其他 AI 的意见，发起 Inter-Review..."
AI: "将此任务添加到高优先级队列，等待指定的 AI 处理"
```

### 何时需要人类介入

- 系统配置变更（如修改 AGENTS.md、添加新 agent）
- 安全相关决策
- 代码合并审批
- 明确的权限问题

### 反思与学习

- 任务完成后，使用 `learn()` 函数保存重要经验
- 如果发现系统设计问题，使用 `suggest_prompt_update()` 建议改进
- **工具已注册**: `learn()`, `memory_search()`, `suggest_prompt_update()` 通过 MCP server (`nezha-mcp`) 暴露给 AI
