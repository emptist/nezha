---
name: agent-identity
description: Correct way to get agent identity - just call the function, no caching needed
trigger: agentid, agent-identity, whoami, resolve identity
---

# Agent Identity - Simple & Correct

## The Rule

**Just call `getResolvedIdentity()` - no caching, no wrapping, no manual cache!**

## Wrong Approaches (Stop Doing This)

```typescript
// ❌ WRONG - Don't create your own cache
const idCache = new Map();
function getAgentId() {
  if (idCache.has('current')) return idCache.get('current');
  const id = await AgentIdentityService.getResolvedIdentity();
  idCache.set('current', id);
  return id;
}
```

```typescript
// ❌ WRONG - Don't wrap in another class
class MyAgentService {
  private cachedId: string | null = null;
  async getId() {
    if (this.cachedId) return this.cachedId;
    this.cachedId = (await AgentIdentityService.getResolvedIdentity()).id;
    return this.cachedId;
  }
}
```

```typescript
// ❌ WRONG - Don't read from local files like .nezha/agent-id.json
const cached = JSON.parse(fs.readFileSync('.nezha/agent-id.json', 'utf-8'));
```

## Correct Approach

```typescript
// ✅ CORRECT - Just call it directly
import { AgentIdentityService } from 'nezha/services/AgentIdentityService.js';

// When you need agent ID:
const { id, name } = await AgentIdentityService.getResolvedIdentity();
console.log(id); // S-nezha-nupi-phase2-nupi-cleanup
```

## Why No Cache Needed?

`getResolvedIdentity()` already has built-in:

1. **In-memory cache** - Caches within same process
2. **Deterministic resolution** - API → CLI → fallback (in order)
3. **Fast** - Returns immediately after first call

Adding your own cache causes:

- Stale IDs when process restarts
- Confusion about which ID is current
- Sync issues between processes

## Quick Reference

```typescript
// Get full identity object
const identity = await AgentIdentityService.getResolvedIdentity();
// Returns: { id: 'S-nezha-...', name: 'nupi', type: 'service', ... }

// Just get the ID string
const agentId = identity.id;
```

**Remember**: The function is designed to be called directly. Trust it.
