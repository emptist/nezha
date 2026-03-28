# OpenClaw Automation Features Research

## Overview

OpenClaw provides several automation mechanisms: **Hooks**, **Gmail Integration**, and the **Convoy Pattern** (via open-prose extension).

---

## 1. Hooks System

### Architecture

OpenClaw uses an event-driven hook system based on `InternalHookEvent`:

```typescript
interface InternalHookEvent {
  type: 'command' | 'session' | 'agent' | 'gateway' | 'message';
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
  timestamp: Date;
  messages: string[]; // Push messages here to send to user
}
```

### Event Types

| Event                  | Description                                   |
| ---------------------- | --------------------------------------------- |
| `command`              | All command events                            |
| `command:new`          | `/new` command specifically                   |
| `command:reset`        | `/reset` command                              |
| `command:stop`         | `/stop` command                               |
| `agent:bootstrap`      | Before workspace bootstrap files are injected |
| `gateway:startup`      | Gateway startup (after channels start)        |
| `message:received`     | Inbound message received                      |
| `message:sent`         | Outbound message sent                         |
| `message:transcribed`  | Audio transcribed to text                     |
| `message:preprocessed` | Message preprocessed before agent             |

### API

```typescript
import { registerHook, unregisterHook, triggerHook, clearHooks } from 'openclaw';

// Register handler
registerHook('command:new', async event => {
  console.log('New command:', event.action);
  event.messages.push('Hook executed!');
});

// Trigger event
triggerHook(createHookEvent('command', 'new', sessionKey, context));
```

### Bundled Hooks

| Hook                    | Events                         | Purpose                                          |
| ----------------------- | ------------------------------ | ------------------------------------------------ |
| `session-memory`        | `command:new`, `command:reset` | Saves session context to `memory/` folder        |
| `bootstrap-extra-files` | `agent:bootstrap`              | Injects extra bootstrap files                    |
| `command-logger`        | `command`                      | Logs commands to `~/.openclaw/logs/commands.log` |
| `boot-md`               | `gateway:startup`              | Runs `BOOT.md` on gateway start                  |

### Custom Hooks

Place in:

- Workspace hooks: `<workspace>/hooks/`
- Managed hooks: `~/.openclaw/hooks/`

Structure:

```
my-hook/
├── HOOK.md      # Metadata + docs (YAML frontmatter + Markdown)
└── handler.ts   # Hook handler (default export)
```

### Managing Hooks

```bash
openclaw hooks list              # List all hooks
openclaw hooks info session-memory  # Show hook details
openclaw hooks check             # Check hook status
openclaw hooks enable session-memory
openclaw hooks disable command-logger
```

---

## 2. Gmail Integration (hooks.gmail)

### Configuration

```json
{
  "hooks": {
    "token": "hook-secret-token",
    "gmail": {
      "account": "you@gmail.com",
      "topic": "projects/my-project/topics/gog-gmail-watch",
      "subscription": "gog-gmail-watch-push",
      "pushToken": "pubsub-push-token",
      "hookUrl": "https://my-gateway.com/hooks/gmail",
      "includeBody": true,
      "maxBytes": 20000,
      "serve": {
        "bind": "127.0.0.1",
        "port": 8788,
        "path": "/gmail-pubsub"
      }
    }
  }
}
```

### Security

Emails are wrapped with security warnings:

```typescript
wrapExternalContent(emailBody, { source: 'email' });
// Adds: SECURITY NOTICE: content from EXTERNAL, UNTRUSTED source
```

Suspicious patterns are detected (e.g., "delete all emails").

---

## 3. Convoy Pattern (open-prose extension)

**Convoys** are not a built-in feature but a **multi-agent orchestration pattern** in the open-prose extension.

### Concept

A convoy is a tracked unit of work (like a batch of PRs) that:

1. Can be created and named
2. Spawns "swarm" of worker agents
3. Monitors progress
4. Can be "landed" (completed)
5. Gets archived

### Convoy Files

```
.prose/gas-town/convoys/
├── {convoy_id}.json    # Convoy metadata
├── {convoy_id}/        # Swarm state
│   └── swarm.json
└── archive/            # Completed convoys
```

### Convoy Commands

```bash
gt convoy create <name>   # Start tracking work
gt convoy land <id>       # Mark as complete
```

### Convoy Workflow

```prose
do convoy_workflow(
  convoy_name: "feature-impl",
  work_description: "Implement feature X",
  target_rig: "frontend"
)
```

### Cross-Rig Convoys

Convoys can span multiple "rigs" (agents):

```prose
do cross_rig_convoy("unified-search", ["frontend", "backend", "search-service"])
```

---

## 4. CLI Automation

### Non-Interactive Onboarding

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice apiKey \
  --anthropic-api-key "$ANTHROPIC_API_KEY" \
  --secret-input-mode plaintext \
  --gateway-port 18789 \
  --gateway-bind loopback \
  --install-daemon \
  --daemon-runtime node
```

### Add Multiple Agents

```bash
openclaw agents add work \
  --workspace ~/.openclaw/workspace-work \
  --model openai/gpt-5.2 \
  --bind whatsapp:biz \
  --non-interactive
```

---

## 5. Channel Webhooks

OpenClaw supports webhooks for multiple channels:

- Telegram
- Discord
- Slack
- WhatsApp
- Matrix
- And 15+ more

### Webhook Security

- HMAC signature verification
- Secret tokens
- External content sanitization

---

## 6. Comparison with Nezha

| Feature     | OpenClaw              | Nezha           |
| ----------- | --------------------- | --------------- |
| Hooks       | Built-in event system | Not implemented |
| Email       | Gmail integration     | Not implemented |
| Convoys     | open-prose pattern    | Not implemented |
| Multi-agent | Sessions + convoys    | Task-based      |
| Automation  | Extensive CLI + hooks | Basic CLI       |

---

## Recommendations for Nezha

1. **Implement Hook System**: OpenClaw's `registerHook/triggerHook` is elegant and extensible
2. **Add Email Integration**: Similar to Gmail hook for monitoring
3. **Convoy Pattern**: Consider as future multi-agent pattern
4. **CLI Automation**: Expand non-interactive CLI options

---

## Key Files Reference

- Hooks: `src/hooks/internal-hooks.ts`
- Gmail: `src/hooks/gmail.ts`, `src/hooks/gmail-watcher-lifecycle.ts`
- Bundled hooks: `src/hooks/bundled/*`
- CLI: `src/cli/hooks-cli.ts`
