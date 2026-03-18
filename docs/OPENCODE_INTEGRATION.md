# OpenCode Integration Approaches - Comparison

> Document created: 2026-03-18
> Status: **REST API approach is the BEST**

## Summary

We tested 4 different approaches to integrate Nezha with OpenCode for task execution. The **REST API** approach is the most reliable and performant.

---

## Approaches Tested

### 1. CLI: `opencode run` (without attach)

```bash
opencode run "Your prompt here"
```

**Result: ❌ PROBLEMATIC**
- Works from command line
- **Hangs when called from Node.js daemon** (execSync/spawn)
- Tasks timeout repeatedly
- Not suitable for automated execution

---

### 2. CLI: `opencode run --attach`

```bash
opencode run --attach http://localhost:4096 "Your prompt"
```

**Result: ❌ Same issues as #1**
- Still hangs when called from Node.js
- The underlying issue is how Node.js child_process interacts with opencode CLI

---

### 3. REST API (RECOMMENDED ✓)

```typescript
// Create session
POST /session
{ "title": "nezha-task" }

// Send message
POST /session/{sessionId}/message
{ "parts": [{ "type": "text", "text": "Your prompt" }] }
```

**Result: ✅ WORKS PERFECTLY**
- Direct HTTP calls to opencode serve
- Reliable, fast, no hanging
- Full control over session lifecycle
- Supports streaming if needed

---

### 4. ACP (Agent Client Protocol)

```bash
opencode acp --port 4096
```

**Result: ⚠️ NOT TESTED**
- Uses stdio (JSON-RPC)
- Would require different implementation
- More complex than REST API

---

## Why REST API Works Best

| Factor | CLI Approach | REST API |
|--------|--------------|----------|
| Reliability | Hangs in Node.js | Works perfectly |
| Latency | N/A (doesn't work) | ~10-60s per task |
| Session reuse | Problematic | Easy |
| Error handling | Difficult | Standard HTTP errors |
| Debugging | Hard | Easy (curl/testable) |

---

## Implementation

### Agent.ts using REST API

```typescript
private async createSession(): Promise<string> {
  const response = await fetch(`${this.serverUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'nezha-task-session' }),
  });
  const data = await response.json() as { id: string };
  return data.id;
}

private async sendMessage(sessionId: string, message: string): Promise<string> {
  const response = await fetch(`${this.serverUrl}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text: message }]
    }),
  });
  const data = await response.json() as { 
    parts?: Array<{ type: string; text: string }> 
  };
  // Extract text from parts...
}
```

---

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/global/health` | Health check |
| POST | `/session` | Create session |
| GET | `/session` | List sessions |
| POST | `/session/:id/message` | Send message |
| DELETE | `/session/:id` | Delete session |

---

## Testing Results

### Task Execution Time (REST API)

| Task | Duration |
|------|----------|
| Add JSON output for CLI | ~43s |
| Security hardening | ~9s |
| Average | ~20-60s |

### Completed Tasks (2026-03-18)
- Before REST API fix: 65 tasks (struggling)
- After REST API fix: 70+ tasks (flowing smoothly)

---

## Notes

1. **opencode serve must be running** before starting Nezha daemon
2. **Session reuse**: We reuse the same session for multiple tasks to save overhead
3. **Timeout**: Set to 300s (5 min) per task
4. **If session fails**: Clear session ID and create new one

---

## References

- OpenCode Server Docs: https://opencode.ai/docs/server
- CLI Docs: https://opencode.ai/docs/cli
