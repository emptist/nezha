# AGENTS.md - Agent 定义

## 核心指令

1. **先研究，再实现**
   - 在实现任何功能前，先研究 OpenClaw (龙虾) 源码
   - 理解龙虾的机制后再参考实现
   - 龙虾没有的功能，优先度降低

2. **当前优先级**
   - P0: 研究 OpenClaw 持续工作机制 (heartbeat, HEARTBEAT.md)
   - P0: 研究 OpenClaw 记忆系统 (MEMORY.md, bootstrap files)
   - P1: 实现 PostgreSQL 任务表和 heartbeat daemon
   - P2: 其他功能

3. **禁止**
   - 不要盲目实现，先问"龙虾怎么做的？"
