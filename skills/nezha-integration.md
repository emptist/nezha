---
name: nezha-integration
description: How to correctly integrate and use nezha in Piano/NuPI - CLI first, no MCP needed
trigger: nezha, import, require, cli, command
---

# Nezha Integration Guide (AI-First Design)

## Core Principle

**Use CLI directly** - It's simpler and more reliable than MCP or imports.

## Wrong Approach (Don't Do This)

```typescript
// ❌ WRONG - Don't try to import or require nezha package
import { something } from 'nezha';
const { func } = require('nezha');
```

```typescript
// ❌ WRONG - Don't use hardcoded paths
execSync('node /Users/jk/gits/hub/tools_ai/nezha/dist/cli/index.js ...');
```

```typescript
// ❌ WRONG - Don't implement your own cache for AgentIdentity
const myCache = new Map();
function getId() {
  if (myCache.has(id)) return myCache.get(id);
  // ... manual caching logic
}
```

## Correct Approach

### 1. Agent Identity (Simple & Direct)

```typescript
// ✅ CORRECT - Just call the function directly, no cache needed
import { AgentIdentityService } from 'nezha/services/AgentIdentityService.js';

const agentId = (await AgentIdentityService.getResolvedIdentity()).id;
// Result: S-nezha-nupi-phase2-nupi-cleanup
```

**Why no cache?**

- `getResolvedIdentity()` already has built-in caching
- It resolves deterministically from: HTTP API → CLI → fallback
- Adding your own cache introduces bugs

### 2. Using Nezha CLI

```typescript
// ✅ CORRECT - Use shell command with 'nezha' directly
import { execSync } from 'child_process';

const tasks = execSync('nezha tasks --json', { encoding: 'utf-8' });
const taskList = JSON.parse(tasks);

// Other useful commands:
// - nezha tasks --status PENDING
// - nezha share "message"
// - nezha learn "insight"
// - nezha agents whoami
```

**Why CLI?**

- Already installed and linked: `npm link nezha`
- No MCP setup needed
- Works from any directory
- Guaranteed to work if `nezha` command exists

### 3. Piano/NuPI Specific

```typescript
// ✅ CORRECT - In Piano, use:
execSync('nezha tasks');
execSync('nezha share "Working on task..."');

// ✅ CORRECT - In NuPI, use:
execSync('nezha tasks');
execSync('nezha learn "New pattern discovered"');
```

### 4. If CLI Not Available (Fallback)

```typescript
// Last resort fallback - but prefer CLI
const cmd = process.env.NEZHA_CLI_PATH || (process.platform === 'win32' ? 'nezha.cmd' : 'nezha');
execSync(`${cmd} tasks`);
```

## Summary

| Task         | Approach                                                 |
| ------------ | -------------------------------------------------------- |
| Get Agent ID | `AgentIdentityService.getResolvedIdentity()` (no cache!) |
| Query Tasks  | `execSync('nezha tasks')`                                |
| Broadcast    | `execSync('nezha share "msg"')`                          |
| Save Learn   | `execSync('nezha learn "insight"')`                      |

**Remember**: CLI first, no MCP, no custom cache, no hardcoded paths.
