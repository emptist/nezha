# Development Workflow

## Build, Test, Update Global

All Nezha family projects (nezha, nupi, piano) share the same workflow:

### Quick (Use the Script)

```bash
cd /Users/jk/gits/hub/tools_ai/{project}
./scripts/dev-link.sh
```

This:
1. Cleans dist
2. Builds
3. Verifies git hash
4. Links to global (npm link)
5. Verifies global hash matches local

### Manual

```bash
cd /Users/jk/gits/hub/tools_ai/{project}

# 1. Build
rm -rf dist && npm run build

# 2. Verify hash
grep GIT_HASH dist/extension.js  # or dist/src/extension.js

# 3. Link to global
npm link

# 4. Verify global
grep GIT_HASH $(npm root -g)/@nezha/{project}/dist/extension.js
```

### Why This Matters

The git hash appears in logs:
```
[NuPI@e6146b57] Starting...
[Piano@49f1e3f] Thinking router ready...
```

If global is stale, you'll see old hash and potentially run old code.

## Project Structure

| Project | Entry | Global Link |
|---------|-------|-------------|
| nezha | `nezha` CLI | N/A (npm install) |
| nupi | `nupi` command | `@nezha/nupi` |
| piano | `piano` command | `@nezha/piano` |

## Common Issues

### Hash Mismatch After Link

If `dev-link.sh` shows hash mismatch:
```bash
rm -rf $(npm root -g)/@nezha/{project}
npm link
```

### pnpm Doesn't Detect Changes

**Never use `pnpm add -g .`** - it caches by path and doesn't detect local file changes.

Always use `npm link` instead.

## Testing

After updating global:

```bash
# Test nupi
nupi

# Test piano
piano
```

Check logs for correct git hash at startup.

## Commit Process

Before committing, always rebuild:
```bash
./scripts/dev-link.sh
git add -A
git commit -m "description [task: xxx]"
```