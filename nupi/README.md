# NuPI (牛派)

**NuPI** = Nezha united with PI

**独立系统**，完全不依赖 OpenCode。

## 架构

```
NuPI = Pi (TUI前端) + Nezha (后端服务)
```

- **Pi**: 交互界面，工具执行
- **Nezha**: 数据库，任务/记忆/学习

## 目录结构

```
nupi/
├── src/           # NuPI 核心代码 (未来 npm 包)
├── extensions/    # Pi 扩展
│   ├── nezha-tools.ts      # 数据库/CLI 工具
│   └── nezha-autowork.ts   # 永续工作循环
└── skills/        # Pi Skills
    └── SKILL.md   # AI 必读文档
```

## 安装

### 作为 Pi 扩展

```bash
# 复制扩展到 Pi
cp nupi/extensions/*.ts ~/.pi/agent/extensions/

# 复制 skill 到 Pi
cp -r nupi/skills/ ~/.pi/agent/skills/
```

### 未来：npm 包 (TODO)

```bash
npm install @nezha/nupi
```

## NuPI vs Piano

| 系统      | 组成                     | 复杂度 |
| --------- | ------------------------ | ------ |
| **NuPI**  | Nezha + Pi = 二合一      | 简单   |
| **Piano** | NuPI + OpenCode = 三合一 | 复杂   |

## 本地 LLM

- **Model**: llama3.2:3b (Ollama)
- **Embedding**: nomic-embed-text (Ollama)

零 API 成本，24/7 运行。
