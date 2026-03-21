# OpenClaw Automation Features Research

**Date:** 2026-03-22
**Source:** `/Users/jk/gits/hub/opencode`

## Executive Summary

OpenClaw's automation features include: Plugin System, Skill System, Event Bus, and Experimental Config Hooks. **No "mail" or "convoy" features exist** in the current codebase. The review_2026-03-19 document appears to be aspirational or referring to planned features.

---

## 1. Plugin System

### Location

- `packages/opencode/src/plugin/index.ts`
- `packages/plugin/` (SDK)

### Architecture

Plugins are npm packages that can hook into OpenClaw's lifecycle:

```typescript
// Plugin interface (from SDK)
interface Plugin {
  name: string;
  init: (input: PluginInput) => Promise<Hooks>;
}

interface Hooks {
  auth?: AuthHook;
  tool?: ToolHook;
  event?: EventHook;
  config?: ConfigHook;
  [key: string]: any; // Allow custom hooks
}
```

### Available Hooks

| Hook              | Purpose                     |
| ----------------- | --------------------------- |
| `auth`            | Provider authentication     |
| `tool.definition` | Modify tool definitions     |
| `shell.env`       | Modify shell environment    |
| `session.start`   | Session initialization      |
| `session.end`     | Session cleanup             |
| `event`           | Subscribe to all bus events |
| `config`          | Modify configuration        |

### Built-in Plugins

- CodexAuthPlugin (OpenAI)
- CopilotAuthPlugin (Microsoft)
- GitlabAuthPlugin

### Configuration

```json
{
  "plugin": ["opencode-openai-codex-auth", "my-custom-plugin@1.0.0", "file:///path/to/local/plugin"]
}
```

---

## 2. Skill System

### Location

- `packages/opencode/src/skill/skill.ts`
- `packages/opencode/src/skill/service.ts`
- Discovery: `packages/opencode/src/skill/discovery.ts`

### Architecture

Skills are YAML-frontmatter markdown files discovered from:

| Location                                    | Scope                |
| ------------------------------------------- | -------------------- |
| `.opencode/skills/<name>/SKILL.md`          | Project              |
| `~/.config/opencode/skills/<name>/SKILL.md` | Global               |
| `.claude/skills/<name>/SKILL.md`            | Project (compatible) |
| `.agents/skills/<name>/SKILL.md`            | Project (compatible) |

### SKILL.md Format

```markdown
---
name: git-release
description: Create consistent releases and changelogs
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
---

## What I do

- Draft release notes from merged PRs
- Propose a version bump
- Provide a copy-pasteable `gh release create` command
```

### Skill Loading

1. Skills are scanned at startup
2. Agent sees available skills in system prompt
3. Agent calls `skill({ name: "git-release" })` to load
4. Skill content injected into conversation with base directory info

### Remote Skill Discovery

OpenClaw can fetch skills from remote URLs:

```json
{
  "skills": {
    "urls": ["https://example.com/skills-index.json"]
  }
}
```

---

## 3. Event Bus

### Location

- `packages/opencode/src/bus/bus-event.ts`
- `packages/opencode/src/bus/global.ts`

### Architecture

Typed event system using Zod schemas:

```typescript
// Define event
const FileChanged = BusEvent.define("file.changed", z.object({
  path: z.string(),
  type: z.enum(["add", "change", "unlink"])
}))

// Subscribe
GlobalBus.on("event", handler)
Bus.subscribeAll(handler)

// Publish
GlobalBus.emit("event", { type: "file.changed", ... })
```

### Event Routing

- `/event` - SSE endpoint for subscribing to events
- `/global/event` - Global event stream
- Plugins can subscribe via `hook.event`

---

## 4. Experimental Config Hooks

### Location

`packages/sdk/js/src/gen/types.gen.ts` (line 1346-1362)

### Available Triggers

```json
{
  "experimental": {
    "hook": {
      "file_edited": {
        "pattern-match": [
          {
            "command": ["npm", "run", "lint"],
            "environment": { "FILE": "{file}" }
          }
        ]
      },
      "session_completed": [
        {
          "command": ["notify-send", "OpenCode", "Session done"],
          "environment": { "RESULT": "{result}" }
        }
      ]
    }
  }
}
```

---

## 5. What OpenClaw Does NOT Have

Based on codebase analysis:

| Feature         | Status | Notes                           |
| --------------- | ------ | ------------------------------- |
| Mail System     | ❌     | No inter-agent messaging system |
| Convoys         | ❌     | No workflow chains              |
| Scheduled Tasks | ❌     | No cron-like scheduling         |
| Remote Hooks    | ❌     | Only local command execution    |

---

## 6. Recommendations for Nezha

### Implement (High Priority)

1. **Skill System** - Already partially implemented, needs polish
   - Add YAML frontmatter validation
   - Add remote skill discovery
   - Add skill permission system

2. **Event Bus** - Already implemented via PostgreSQL
   - Already has publish/subscribe pattern
   - Consider SSE endpoint for real-time subscriptions

3. **Plugin Hooks** - Consider lightweight version
   - Task lifecycle hooks (before/after execution)
   - Notification hooks (task complete, task failed)

### Consider (Medium Priority)

1. **Experimental Config Hooks** - File edit and session hooks
   - Less critical than event bus
   - Can be simulated via task chaining

### Skip (Low Priority)

1. **Mail System** - Not needed with existing database-based approach
2. **Convoys** - Over-engineered for current scale

---

## Key Files Reference

| File                     | Purpose                            |
| ------------------------ | ---------------------------------- |
| `src/plugin/index.ts`    | Plugin loading and hook management |
| `src/skill/service.ts`   | Skill discovery and loading        |
| `src/skill/discovery.ts` | Remote skill fetching              |
| `src/bus/global.ts`      | Global event bus                   |
| `src/bus/bus-event.ts`   | Event type definitions             |
| `src/config/config.ts`   | Configuration management           |
