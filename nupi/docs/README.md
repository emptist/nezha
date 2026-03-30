# NuPI (牛派)

**本地 AI 编程助手** = Nezha + Pi = 二合一

```
┌─────────────────────┐
│      NuPI          │
│  ┌───────┬───────┐ │
│  │ Nezha │  Pi   │ │
│  │ (数据) │ (交互)│ │
│  └───────┴───────┘ │
└─────────────────────┘
```

- **Nezha**: 任务、记忆、学习 (PostgreSQL)
- **Pi**: 对话界面、工具执行
- **本地运行**: 零 API 成本

---

## 快速开始

### 1. 安装

```bash
# 克隆项目
cd ~/gits/hub
git clone https://github.com/your-repo/nezha.git
cd nezha

# 安装依赖
npm install

# 启动 PostgreSQL (用 Docker 或本地)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -v nezha-data:/var/lib/postgresql/data postgres

# 初始化数据库
npm run db:migrate
```

### 2. 配置

```bash
# 复制配置
cp .env.example .env

# 编辑 .env (PostgreSQL 配置)
NEZHA_DB_HOST=localhost
NEZHA_DB_PORT=5432
NEZHA_DB_NAME=nezha
NEZHA_DB_USER=postgres
NEZHA_DB_PASSWORD=postgres

# 本地 LLM (可选)
OLLAMA_MODEL=llama3.2:3b  # 或 mistral:7b (更聪明但慢)
```

### 3. 启动 Pi

```bash
# 安装 Pi (如果没装)
npm install -g @mariozechner/pi-coding-agent

# 启动 Pi
pi ~/gits/hub/nezha
```

---

## 使用

### 对话

直接在 Pi 里聊天：

```
who are you?
帮我看看有什么待办任务
```

### 查询数据库

Pi 会告诉你 SQL，你手动运行：

```bash
psql -U postgres -d nezha -c "SELECT id, title, priority FROM tasks WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 5;"
```

### 管理任务

```bash
# 查看任务
psql -U postgres -d nezha -c "SELECT * FROM tasks WHERE status = 'PENDING';"

# 创建任务
psql -U postgres -d nezha -c "INSERT INTO tasks (title, priority) VALUES ('新任务', 50);"

# 完成任务
psql -U postgres -d nezha -c "UPDATE tasks SET status = 'COMPLETED' WHERE id = 'uuid';"
```

---

## 模型选择

| 模型        | 速度 | 能力      | 推荐        |
| ----------- | ---- | --------- | ----------- |
| llama3.2:3b | 快   | 只能聊天  | ✅ 日常     |
| mistral:7b  | 慢   | 能执行SQL | 🔧 复杂任务 |
| CodeLlama   | ?    | ?         | 待测试      |

配置在 `~/.pi/agent/settings.json`:

```json
{
  "defaultModel": "llama3.2:3b"
}
```

---

## 目录结构

```
nupi/
├── docs/           # 本文档
├── extensions/     # Pi 扩展
│   ├── nezha-tools.ts     # 数据库工具
│   └── nezha-autowork.ts # 永续工作
├── skills/         # Pi Skills
│   └── nupi-abc.md       # AI 知识库
└── src/            # 代码 (未来 npm 包)
```

---

## "先用后付" 商业模式

**定价**: 300 元

> "现在没钱？先用着，有钱再付。"

### 为什么收费？

- 本地运行无 API 成本
- 持续开发维护
- 文档和教程

### 如何付款？

微信/支付宝 (待添加)

---

## 常见问题

**Q: 需要网络吗？**
A: 不需要，完全本地运行。

**Q: 模型需要下载吗？**
A: 需要，用 Ollama:

```bash
ollama pull llama3.2:3b
ollama pull mistral:7b
```

**Q: 支持 Windows 吗？**
A: 目前仅 macOS/Linux。Windows WSL 可以。

---

## 联系与支持

- GitHub: (待添加)
- B站/YouTube: (待添加)
- 问题反馈: (待添加)

---

_NuPI = Nezha united with PI (牛派) 🐂_
