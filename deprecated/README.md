# OpenCode 耦合分析

## 真实情况

**OpenCode 只是一个可选的、带 Tools 的 LLM 调用方式**

OpenCode 不是必须的，Nezha 可以完全独立运行。

### OpenCode 的实际角色

| 用途           | 说明                                |
| -------------- | ----------------------------------- |
| 给人类用的 CLI | 带 Tools（文件/命令），方便人类工作 |
| 可选的 LLM     | 可以用它的免费 model                |
| 端口自动检测   | 不需要硬编码 4096                   |

### 问题根源

某个 AI 错误地把 OpenCode 集成进来作为"任务执行器"：

```
错误设计: UnifiedAgent → OpenCode API
                ↓
    所有服务都开始依赖它
```

### 正确架构

```
Nezha (任务调度器)
    │
    ├── DatabaseClient (任务存储)
    ├── AIProvider (LLM 调用) ← 主要方式
    ├── OpenCode (可选) ← 如果要用免费 model
    │   └── 通过 AIProvider 接口封装
    └── 其他服务 (观察/记录)
```

### 端口检测

OpenCode 启动后端口是自动可检测的，不需要硬编码。

## 待办

- [ ] 移除硬编码的 4096 端口
- [ ] 将 OpenCode 封装为可选的 AIProvider
- [ ] 验证 AIProvider 可以完全替代
- [ ] 更新配置说明
