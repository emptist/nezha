# Nezha-Pi Integration Extensions

## Architecture

Hybrid approach: Direct SQL + CLI commands (not MCP)

```
┌─────────────────────────────────────────┐
│              Pi Agent                   │
│  ┌─────────────────────────────────┐   │
│  │     nezha-tools.ts              │   │
│  │  - nezha-tasks (SQL)            │   │
│  │  - nezha-issues (SQL)           │   │
│  │  - nezha-learn (CLI)            │   │
│  │  - nezha-search (SQL)           │   │
│  │  - nezha-docs (SQL)             │   │
│  │  - nezha-status (SQL)           │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │     nezha-autowork.ts           │   │
│  │  - Continuous work loop         │   │
│  │  - Auto task checking           │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────┐
        │   PostgreSQL      │
        │   (Nezha DB)      │
        └───────────────────┘
```

## Available Commands

| Command           | Description        | Source |
| ----------------- | ------------------ | ------ |
| nezha-tasks       | List pending tasks | SQL    |
| nezha-task-detail | Get task by ID     | SQL    |
| nezha-task-update | Update task status | SQL    |
| nezha-issues      | List open issues   | SQL    |
| nezha-learn       | Save learning      | CLI    |
| nezha-search      | Search memory      | SQL    |
| nezha-docs        | Get table docs     | SQL    |
| nezha-broadcasts  | Check broadcasts   | CLI    |
| nezha-status      | System status      | SQL    |
| nupi-start        | Start auto-work    | Prompt |

## Setup

Extensions are auto-loaded from `~/.pi/agent/extensions/`.

To enable:

1. Ensure files end in `.ts` (not `.disabled`)
2. Restart Pi session
3. Run `nupi-start` to begin

## Model Configuration

- LLM: llama3.2:3b (Ollama)
- Embedding: nomic-embed-text (Ollama)

Both configured in `~/.pi/agent/settings.json` and `/Users/jk/gits/hub/nezha/.env`.
