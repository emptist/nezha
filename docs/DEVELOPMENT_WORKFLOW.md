# Development Workflow

## Quick Start

When code changes, just run:

```bash
npm run dev
```

That's it! This will:
1. Clean dist
2. Build with latest code
3. Delete global install (fixes pnpm caching issue)
4. Link to global
5. Show both local & global hashes for verification

## Check Status Any Time

```bash
npm run status
```

Shows local vs global hash - helps debug if running old code.

## Each Project

### nupi
```bash
cd /Users/jk/gits/hub/tools_ai/nupi
npm run dev    # build + link + verify
npm run status # check hashes
nupi          # test
```

### piano
```bash
cd /Users/jk/gits/hub/tools_ai/piano
npm run dev    # build + link + verify
npm run status # check hashes
piano         # test
```

## Manual (without npm scripts)

```bash
# 1. Clean and build
rm -rf dist && npm run build

# 2. Delete global first (IMPORTANT - pnpm caches!)
rm -rf $(npm root -g)/@nezha/{project}

# 3. Link
npm link

# 4. Verify hashes match
grep GIT_HASH dist/extension.js
grep GIT_HASH $(npm root -g)/@nezha/{project}/dist/extension.js
```

## Why Delete First?

pnpm caches global packages by path - it won't detect your local code changes. Deleting forces fresh install.

## Verifying Works

Check startup logs for correct hash:

```
 NuPI@0bd29925] Starting...
[Piano@476823e] Thinking router ready...
```

If hash looks old, run `npm run dev` again.