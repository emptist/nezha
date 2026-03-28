# Webhook System

Nezha supports both inbound (receiving) and outbound (sending) webhooks for external integrations and event-driven automation.

## Architecture

```
┌──────────────┐     HTTP POST      ┌─────────────────┐
│   External   │ ──────────────────▶│  WebhookServer  │
│   Service    │                    │  (Inbound :8789) │
│  (GitHub,    │                    └────────┬────────┘
│   Gmail,     │                             │
│   Slack...)  │                             ▼
└──────────────┘                    ┌─────────────────┐
                                    │  PluginManager  │
                                    │  (onWebhook)    │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │   Heartbeat     │
                                    │   (Task Queue)  │
                                    └─────────────────┘
```

## Inbound Webhooks (WebhookServer)

Receives HTTP POST requests from external services and triggers actions.

### Configuration

```bash
# Environment variables
WEBHOOK_SERVER_PORT=8789          # Server port
WEBHOOK_SERVER_PATH=/webhook      # Base path
WEBHOOK_SERVER_TOKEN=secret123    # Bearer token auth (optional)
WEBHOOK_SERVER_ENABLED=true        # Enable/disable
```

### Endpoints

| Endpoint             | Action | Description                 |
| -------------------- | ------ | --------------------------- |
| `POST /webhook/wake` | Wake   | Triggers agent wake         |
| `POST /webhook/task` | Task   | Creates a task from payload |

### Template Variables

Use `{{payload.field}}` in task templates:

```
POST /webhook/task
{
  "title": "New GitHub issue",
  "description": "Issue: {{payload.title}}\nURL: {{payload.html_url}}"
}
```

### Example: GitHub Webhook

```bash
# Create webhook config
WEBHOOK_SERVER_TOKEN=github_secret

# Task template for GitHub issues
# In code: mapping.taskTemplate = "New issue: {{payload.title}}\nURL: {{payload.html_url}}"
```

## Outbound Webhooks (WebhookService)

Sends HTTP POST notifications to external services when events occur.

### Configuration

```bash
# Environment variables
WEBHOOK_URL=https://hooks.slack.com/services/xxx  # Required for outbound
WEBHOOK_SECRET=secret123                            # Optional auth header
WEBHOOK_RETRY_COUNT=3                               # Retry attempts
WEBHOOK_RETRY_DELAY=1000                            # Delay between retries (ms)
```

### Events

| Event                | Payload               |
| -------------------- | --------------------- |
| `task:completed`     | Task details + result |
| `task:failed`        | Task details + error  |
| `alert:created`      | Alert details         |
| `alert:acknowledged` | Alert details         |

### Example: Slack Notification

```typescript
const webhook = new WebhookService({
  url: process.env.SLACK_WEBHOOK_URL,
  secret: process.env.WEBHOOK_SECRET,
  enabled: true,
});

await webhook.sendTaskCompleted(taskId, title, desc, result);
```

## Plugin Hooks

Plugins can react to webhook events:

```typescript
const myPlugin: Plugin = {
  name: 'github-sync',
  version: '1.0.0',
  hooks: {
    onWebhook: async context => {
      logger.info(`Webhook received: ${context.path}`);
    },
    onWake: async context => {
      // Agent was woken by webhook
    },
    onWebhookTask: async (context, task) => {
      logger.info(`Task created from webhook: ${task.id}`);
    },
  },
};
```

## Security

- **Inbound**: Bearer token authentication via `Authorization` header
- **Outbound**: `X-Webhook-Secret` header sent with requests
- **Rate limiting**: Configurable retry with exponential backoff

## Comparison with OpenClaw

| Feature           | OpenClaw                               | Nezha                          |
| ----------------- | -------------------------------------- | ------------------------------ |
| Hook discovery    | Filesystem (HOOK.md)                   | Plugin registry                |
| Internal events   | Yes (command, session, agent, gateway) | Yes (task, startup, heartbeat) |
| HTTP webhooks     | `/hooks/*`                             | `/webhook/*`                   |
| Gmail Pub/Sub     | Yes                                    | Planned                        |
| External channels | WhatsApp, Telegram, etc.               | Via webhooks                   |
