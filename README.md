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

# Or import from NPM
import { DatabaseClient, Config } from "nezha";
```

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
