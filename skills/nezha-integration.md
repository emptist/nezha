---
name: nezha-integration
description: How to correctly use nezha CLI - no MCP needed
trigger: nezha, import, require, cli, command
---

# Nezha Integration Guide

## Core Principle

**Use CLI directly** - It's simpler and more reliable.

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

## Correct Approach

### Using Nezha CLI

```typescript
// ✅ CORRECT - Use 'nezha' command directly
import { execSync } from 'child_process';

const tasks = execSync('nezha tasks', { encoding: 'utf-8' });

// Other useful commands:
// - nezha tasks --status PENDING
// - nezha learn "insight"
// - nezha areflect "[LEARN] insight: ..."
```

### Available Commands

```bash
# Learning
nezha learn "insight"
nezha areflect "[LEARN] insight: ..."

# Tasks
nezha tasks
nezha task-add "title" --priority 8

# Issues
nezha issue-add "title" --severity high

# Reflection
nezha reflection-summary
```

**Remember**: CLI first, no MCP, no hardcoded paths.
