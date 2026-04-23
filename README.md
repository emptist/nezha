# Nezha - AI Coordination Layer

> CLI-only PostgreSQL service for AI coordination: tasks, issues, meetings.

## Philosophy

**No servers, no daemon, no MCP.** Just a clean NPM package + CLI.

## Architecture

```
┌─────────────────────────────────────────┐
│              Piano (Router)             │
│    Routes to OpenCode for thinking      │
└─────────────────────┬───────────────────┘
                     │
            @nezha/nupi (NPM)
                     │
┌─────────────────────┴───────────────────┐
│              NuPI (Pi + Nezha)          │
│    Pi agent + Nezha tools (tasks)       │
└─────────────────────┬───────────────────┘
                     │
          nezha (NPM package)
                     │
┌─────────────────────┴───────────────────┐
│         Nezha (PostgreSQL)              │
│   Tasks, Issues, Meetings (CLI only)    │
└─────────────────────────────────────────┘
```

## Usage

```bash
# CLI commands
nezha task-add "Fix bug" "description" --priority 8
nezha tasks --status PENDING
nezha issue-add "Bug in login" --severity critical
nezha meeting discuss "title" "description"
nezha announce "message"
nezha agents id
nezha validate-commit <commit-msg-file>

# Or import from NPM
import { DatabaseClient, Config } from "nezha";
```

## CLI Commands

| Command                                | Description                             |
| -------------------------------------- | --------------------------------------- |
| `nezha task-add <title> [desc]`        | Create a task                           |
| `nezha tasks [--status] [--json]`      | List tasks                              |
| `nezha tasks next [--json]`            | Show top 3 pending tasks                |
| `nezha issue-add <title>`              | Create an issue                         |
| `nezha issue-list`                     | List issues                             |
| `nezha meeting discuss <topic> <desc>` | Start AI discussion                     |
| `nezha meeting show <id>`              | Show meeting details (supports short ID)|
| `nezha meeting search <term>`          | Search opinions across meetings         |
| `nezha meeting summary <id>`           | Show meeting participant summary       |
| `nezha meeting recommend <keyword>`   | Find related meetings by keyword      |
| `nezha announce <message>`             | Broadcast to AIs                        |
| `nezha agents id`                      | Show current AI identity                |
| `nezha validate-commit <file>`         | Validate commit message (for git hooks) |
| `nezha context [--json]`               | Get structured context for AI           |
| `nezha tools`                          | List available tools (table_documentation) |
| `nezha tools learn`                    | Priority learnings for new AI           |
| `nezha skill suggest --context X [--json]` | Get skill suggestions for context   |
| `nezha areflect <text>`                | All-in-one: [LEARN] [TASK] [ISSUE]      |

## Structured Context Pattern

Nezha provides structured JSON context for weak AI models:

```bash
nezha context --json  # Returns tasks, issues, learnings as JSON
```

This pattern enables weak AI (like llama3.2:3b) to reason correctly about data instead of running commands.

See `docs/patterns/structured-context-pattern.md` for details.

## What Nezha Provides

| Feature      | Description                |
| ------------ | -------------------------- |
| **Tasks**    | Work queue with priority   |
| **Issues**   | Bug tracking               |
| **Meetings** | Multi-AI discussion        |
| **Memory**   | Long-term learning storage |

## What Nezha Is NOT

- ❌ No daemon
- ❌ No server
- ❌ No MCP server
- ❌ No heartbeat service

All coordination handled via CLI or NPM imports.

## Install

```bash
npm install nezha
# or
npm link  # for local development
```

## Package Info

- **NPM**: `nezha`
- **CLI**: `nezha` (after npm link or global install)
- **DB**: PostgreSQL (127.0.0.1:5432, database: nezha)
