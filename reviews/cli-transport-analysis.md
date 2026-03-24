# CLI Transport Mode Analysis: Spawn vs HTTP

## Executive Summary

The `spawn('opencode run --attach')` approach creates "anonymous" AI workers without Nezha agent identity. This document analyzes the implications and proposes a path forward.

## Current Architecture

```
Nezha Scheduler (bot_abc123)
    │
    ├── HTTP Mode (default)
    │   └── Direct REST API calls to opencode server
    │       - Low memory (~10MB)
    │       - Session management
    │       - Agent ID preserved
    │
    └── CLI Mode (fallback)
        └── spawn('opencode run --attach')
            - High memory (~500MB per process)
            - No session concept
            - Agent ID LOST
```

## The Identity Problem

### When spawn() is called:

```typescript
// src/core/transports/index.ts:305-312
proc = spawn('opencode', args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },  // Inherits env but NO NEZHA_AGENT_ID
  detached: false,
});
```

### What happens:

| Aspect | Scheduler | Spawned OpenCode |
|--------|-----------|------------------|
| Agent ID | `bot_abc123` | None |
| Memory access | Yes | No |
| Session tracking | Yes | No |
| Accountability | Yes | Anonymous |

### The Flow:

```
1. Nezha Scheduler (bot_abc123) picks up task
2. HTTP mode fails → falls back to CLI mode
3. spawn('opencode run --attach') creates new process
4. OpenCode AI runs WITHOUT knowing it's "bot_abc123"
5. OpenCode AI completes task (anonymously)
6. Scheduler (bot_abc123) records the result
```

## Memory Implications

| Metric | HTTP Mode | CLI Mode |
|--------|-----------|----------|
| Memory per request | ~10MB | ~500MB |
| 10 concurrent tasks | ~100MB | ~5GB |
| Process isolation | No | Yes |
| Cleanup needed | No | Yes (orphan processes) |

## Why CLI Mode Exists

Looking at the code, CLI mode was designed as a **fallback**:

```typescript
// src/core/UnifiedAgent.ts:279
this.switchMode(config?.fallbackMode ?? (this.transportMode === 'http' ? 'cli' : 'http'));
```

And for **streaming support**:

```typescript
// src/services/HeartbeatService.ts:188
if (this.transportMode === 'cli') {
  // CLI mode supports streaming
}
```

## Problems with CLI Mode

1. **No Agent Identity**: Spawned AI doesn't know its Nezha agent ID
2. **Memory Exhaustion**: Each spawn = ~500MB
3. **Orphan Processes**: If parent dies, children become zombies
4. **No Coordination**: Multiple spawned AIs don't know about each other
5. **No Memory Access**: Spawned AI can't read/write Nezha memory

## Proposed Solution

### Phase 1: Add Configuration Option

```typescript
// src/config/constants.ts
export const TRANSPORT_CONFIG = {
  ALLOW_CLI_FALLBACK: false,  // Set to true to enable CLI fallback
  DEFAULT_MODE: 'http',
} as const;
```

### Phase 2: Test HTTP-Only Mode

1. Set `ALLOW_CLI_FALLBACK: false`
2. Run comprehensive tests
3. Monitor for failures
4. Document any edge cases where HTTP mode fails

### Phase 3: Decision

If HTTP-only mode works:
- Remove CLI mode entirely
- Simplify codebase
- Reduce memory footprint

If HTTP-only mode fails:
- Fix HTTP mode issues
- Or keep CLI mode with proper identity passing

## Identity Passing (Alternative)

If CLI mode must be kept, pass agent identity:

```typescript
proc = spawn('opencode', args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { 
    ...process.env,
    NEZHA_AGENT_ID: Config.getInstance().getAgentId(),
    NEZHA_SESSION_ID: getCurrentSessionId(),
  },
  detached: false,
});
```

## Related Files

- [src/core/transports/index.ts](../src/core/transports/index.ts) - Transport implementations
- [src/core/UnifiedAgent.ts](../src/core/UnifiedAgent.ts) - Agent with mode switching
- [src/config/Config.ts](../src/config/Config.ts) - Agent ID management
- [src/core/Scheduler.ts](../src/core/Scheduler.ts) - Process counting

## Next Steps

1. Create issue via areflect
2. Implement `ALLOW_CLI_FALLBACK` option
3. Run tests with HTTP-only mode
4. Document results
5. Make architectural decision

---

*Created: 2026-03-24*
*Related: Process control system, Memory exhaustion issue*
