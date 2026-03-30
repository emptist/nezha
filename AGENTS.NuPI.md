# NuPI Agent Guide

> **NuPI** = Nezha united with **PI** (牛派)
>
> - 独立系统，**不需要 MCP**
> - 直接用 SQL: `psql -U postgres -d nezha`

## 核心概念

- **NuPI**: 本地二合一系统 (Pi + Nezha)
- **Piano**: NuPI + OpenCode (复杂三合一)
- 本地运行，零 API 成本

## 可用命令

| 命令          | 说明         |
| ------------- | ------------ |
| `nupi-tasks`  | 查看待办任务 |
| `nupi-issues` | 查看开放问题 |
| `nupi-status` | 系统状态     |
| `nupi-work`   | 自主工作模式 |
| `nupi-learn`  | 保存学习     |
| `nupi-search` | 搜索记忆     |

## 工作流程

1. `nupi-status` → 查看当前状态
2. `nupi-tasks` → 选任务
3. 做工作
4. `nupi-learn "<学到的>"` → 保存

## 关键表

- `tasks` - 任务队列
- `issues` - 问题跟踪
- `memory` - 长期记忆
- `table_documentation` - AI 工具索引

## 不要

- ❌ 依赖 MCP
- ❌ 等待人类指令
- ❌ 假设需要 OpenCode
