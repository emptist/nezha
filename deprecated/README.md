# OpenCode 耦合清理 - 已完成

## 状态：✅ 已完成

## 清理概述

本次重构删除了 ~3500 行不必要的 OpenCode HTTP API 耦合代码。

### 删除的文件

| 文件                               | 说明                        |
| ---------------------------------- | --------------------------- |
| `src/core/UnifiedAgent.ts`         | OpenCode API 封装           |
| `src/core/Agent.ts`                | HTTP transport 封装         |
| `src/core/AgentSystem.ts`          | 多 agent 管理               |
| `src/core/transports/`             | HttpTransport, CliTransport |
| `src/core/OpenCodeClient.ts`       | OpenCode CLI 客户端         |
| `src/services/HeartbeatService.ts` | 旧的 2440 行版本            |

### 新增的文件

| 文件                                         | 说明          |
| -------------------------------------------- | ------------- |
| `src/services/heartbeat/HeartbeatService.ts` | 精简版 99 行  |
| `src/services/AITaskExecutor.ts`             | AI 任务执行器 |
| `src/services/DocsImporter.ts`               | 文档导入工具  |

## 残留文件清单

以下文件仍存在但已废弃，建议后续清理：

```bash
./bin/opencode-watchdog.sh      # 旧脚本，可能需要
./bin/opencode-limited.sh       # 旧脚本，可能需要
./.nezha/agent-id.json         # ❌ 已废弃，使用数据库
./.tmp/discussion_opencode.sql  # 临时文件
./.git/opencode                 # git 配置？
```

## 正确架构

```
Nezha (任务调度器)
    │
    ├── DatabaseClient (任务存储)
    ├── AIProvider (LLM 调用) ← 主要方式
    └── 人类用 OpenCode 直接工作
```

## 验证

```bash
npm run build   # 编译通过
npm test        # 960 tests 通过
```

## 日期

2026-03-26
