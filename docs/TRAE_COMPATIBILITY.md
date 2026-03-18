# Trae Compatibility Analysis

> Analysis Date: 2026-03-18
> Question: Can Trae be used with Nezha?

## Executive Summary

**Short Answer: No - Trae and Nezha are architecturally incompatible in their current forms.**

Nezha requires a programmable AI backend with REST API (OpenCode), while Trae is an interactive IDE without server mode or programmatic API.

---

## The Core Problem

### What Nezha Needs

Nezha's architecture requires an AI backend that can be called **programmatically** by external code:

```
HeartbeatService (timer)
       ↓
Scheduler (fetches tasks from PostgreSQL)
       ↓
Agent.ts (calls REST API)
       ↓
AI Server (port 4096)
       ↓
LLM executes the task
```

### What OpenCode Provides

OpenCode exposes a REST API that Nezha's Agent.ts uses:

```typescript
// Required API endpoints:
POST http://localhost:4096/session              // Create session
POST http://localhost:4096/session/:id/message  // Send message
GET  http://localhost:4096/global/health        // Health check
DELETE http://localhost:4096/session/:id        // Delete session
```

### What Trae Provides

| Feature | OpenCode | Trae |
|---------|----------|------|
| Server Mode | ✅ `opencode serve --port 4096` | ❌ Not available |
| REST API | ✅ Full REST endpoints | ❌ No programmatic API |
| Programmatic Access | ✅ External programs can call it | ❌ Interactive only |
| Session Management | ✅ Create/list/delete sessions | ❌ N/A |
| Background Execution | ✅ Can run as daemon | ❌ Interactive only |

---

## Architectural Comparison

### Nezha's Philosophy

From README.md:

> **核心原则**: 完成工作的主体必须是**大模型**，而不是程序代码

Nezha achieves "真正的持续工作" (true continuous work) by:

1. Code acts only as a scheduler
2. LLM makes autonomous decisions
3. LLM executes tasks (calls tools, reads/writes files, runs commands)
4. LLM can learn and improve

### Trae's Paradigm

Trae is designed for **interactive human-AI collaboration**:

- User sends a message
- AI responds in real-time
- User provides feedback
- AI adjusts based on feedback

This is fundamentally different from Nezha's autonomous execution model.

---

## Why Direct Integration is Impossible

### 1. No Server Mode

```bash
# OpenCode (works)
opencode serve --port 4096

# Trae (doesn't exist)
trae serve --port 4096  # ❌ This command doesn't exist
```

### 2. No REST API

Nezha's Agent.ts is hardcoded to call OpenCode's API:

```typescript
// src/core/Agent.ts
private async createSession(): Promise<string> {
  const response = await fetch(`${this.serverUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'nezha-task-session' }),
  });
  // ...
}
```

Trae has no equivalent endpoints.

### 3. Different Execution Model

| Aspect | Nezha + OpenCode | Trae |
|--------|------------------|------|
| Trigger | Timer/Scheduler | User input |
| Execution | Autonomous | Interactive |
| Feedback | Post-completion | Real-time |
| Session | Programmatic | Manual |

---

## Possible Solutions

### Option 1: Keep OpenCode for Nezha (Recommended)

Use each tool for its strength:

- **Trae**: Interactive development, code review, debugging, pair programming
- **OpenCode**: Nezha's backend for autonomous task execution

**Pros**: No changes needed, each tool used optimally
**Cons**: Two AI systems to manage

### Option 2: Build Trae Adapter (Difficult)

Request Trae to expose a REST API similar to OpenCode:

```typescript
// Hypothetical Trae API
POST /trae/session
POST /trae/session/:id/message
GET /trae/session/:id/status
```

**Pros**: Single AI backend
**Cons**: Major feature request, uncertain timeline, may not align with Trae's product direction

### Option 3: Abstract Agent Interface (Major Effort)

Refactor Nezha's Agent.ts to support multiple backends:

```typescript
interface AIBackend {
  createSession(): Promise<string>;
  sendMessage(sessionId: string, message: string): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
}

class OpenCodeBackend implements AIBackend { /* ... */ }
class TraeBackend implements AIBackend { 
  // Would need Trae to provide programmatic access
}
```

**Pros**: Flexible architecture
**Cons**: Still requires Trae to provide programmatic access

### Option 4: MCP Integration (Future Possibility)

If Trae supports Model Context Protocol (MCP), it could potentially be called programmatically:

```typescript
// Hypothetical MCP-based integration
const mcpClient = new MCPClient('trae');
await mcpClient.callTool('execute_task', { prompt: task.description });
```

**Pros**: Standard protocol, potential for interoperability
**Cons**: Requires Trae to implement MCP server, untested approach

---

## Technical Deep Dive: Nezha's Agent System

### Current Implementation

```typescript
// src/core/Agent.ts (simplified)
export class Agent {
  private readonly serverUrl = 'http://localhost:4096';
  private sessionId: string | null = null;

  async executeTask(message: string): Promise<AgentResponse> {
    // 1. Create or reuse session
    if (!this.sessionId) {
      this.sessionId = await this.createSession();
    }
    
    // 2. Send message to OpenCode
    const response = await fetch(`${this.serverUrl}/session/${this.sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }]
      }),
    });
    
    // 3. Extract and return response
    const data = await response.json();
    return { success: true, message: extractText(data) };
  }
}
```

### What Would Need to Change for Trae

1. **Session Management**: Trae doesn't have session IDs
2. **Message Format**: Trae may use different message structure
3. **Response Handling**: Trae's response format is unknown
4. **Authentication**: Trae may require different auth mechanism
5. **Tool Execution**: How would Trae execute tools autonomously?

---

## Conclusion

### Current State

**Trae cannot replace OpenCode as Nezha's AI backend** because:

1. Trae lacks server mode (`trae serve`)
2. Trae has no REST API for programmatic access
3. Trae is designed for interactive use, not autonomous execution
4. Nezha's architecture is tightly coupled to OpenCode's API

### Recommendation

1. **Use both tools side by side**:
   - Trae for interactive development
   - OpenCode for Nezha's autonomous tasks

2. **If integration is required**:
   - Start a feature request with Trae for REST API / MCP support
   - Or refactor Nezha's Agent interface to be backend-agnostic

3. **Long-term vision**:
   - Monitor Trae's roadmap for API/automation features
   - Consider contributing to Trae if open source

---

## Appendix: Feature Comparison Matrix

| Feature | OpenCode | Trae | Nezha Needs |
|---------|----------|------|-------------|
| Server Mode | ✅ | ❌ | ✅ Required |
| REST API | ✅ | ❌ | ✅ Required |
| Session Management | ✅ | ❌ | ✅ Required |
| Programmatic Access | ✅ | ❌ | ✅ Required |
| Tool Execution | ✅ | ✅ | ✅ Required |
| File Operations | ✅ | ✅ | ✅ Required |
| Command Execution | ✅ | ✅ | ✅ Required |
| Background Operation | ✅ | ❌ | ✅ Required |
| Health Check Endpoint | ✅ | ❌ | ✅ Required |
| Interactive Mode | ✅ | ✅ | ❌ Not needed |

---

## References

- [Read_First.md](./Read_First.md) - Nezha quick start
- [README.md](./README.md) - Nezha full documentation
- [PHILOSOPHY.md](./PHILOSOPHY.md) - Nezha design philosophy
- [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md) - OpenCode integration details
