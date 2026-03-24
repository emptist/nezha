# Proposal: Test HTTP-Only Transport Mode

## Problem

When `spawn('opencode run --attach')` is called, the spawned OpenCode AI process runs WITHOUT a Nezha agent identity. This creates anonymous workers that:

- Have no accountability
- Cannot access Nezha memory
- Cannot be tracked or coordinated
- Consume ~500MB memory each

## Root Cause

The spawn() call inherits process.env but does NOT pass NEZHA_AGENT_ID:

```typescript
proc = spawn('opencode', args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },  // No NEZHA_AGENT_ID
  detached: false,
});
```

## Current Architecture

```
Nezha Scheduler (bot_abc123)
    │
    ├── HTTP Mode (default)
    │   └── Direct REST API calls
    │       - Low memory (~10MB)
    │       - Agent ID preserved ✓
    │
    └── CLI Mode (fallback)
        └── spawn('opencode run --attach')
            - High memory (~500MB)
            - Agent ID LOST ✗
```

## Proposal

Add configuration option to test HTTP-only mode:

```typescript
// src/config/constants.ts
export const TRANSPORT_CONFIG = {
  ALLOW_CLI_FALLBACK: false,  // Test HTTP-only mode
  DEFAULT_MODE: 'http',
} as const;
```

## Testing Plan

| Step | Action |
|------|--------|
| 1 | Set `ALLOW_CLI_FALLBACK = false` |
| 2 | Run comprehensive tests |
| 3 | Monitor for failures |
| 4 | Document edge cases |

## Decision Criteria

| Outcome | Action |
|---------|--------|
| HTTP-only works | Remove CLI mode entirely |
| HTTP-only fails | Fix HTTP issues OR pass identity in CLI mode |

## Impact

| Aspect | Change |
|--------|--------|
| Memory | Reduced from ~500MB to ~10MB per task |
| Accountability | Agent ID preserved |
| Codebase | Simplified (remove CLI fallback) |

## Related

- `reviews/cli-transport-analysis.md` - Detailed analysis
- `src/core/transports/index.ts` - Transport implementations
- `src/core/UnifiedAgent.ts` - Agent with mode switching

## Status

- [ ] Proposal documented
- [ ] Config option implemented
- [ ] Tests run
- [ ] Decision made

---

*Created: 2026-03-24*
*Vibe-Author: bot_b17225f3-23e8-48a7-b009-924cfb8bb551*
*Note: This issue was blocked by the trigger bug - couldn't be reported via areflect [ISSUE]*
