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
