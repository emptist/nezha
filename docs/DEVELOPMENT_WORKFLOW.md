# Development Workflow

## Quick Start

When code changes, just run:

```bash
npm run dev
```

That's it! This will build and link the latest code.

## Check Status

```bash
npm run status
```

Shows local vs global code status.

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

### traenupi
```bash
cd /Users/jk/gits/hub/tools_ai/traenupi
npm run dev:link  # build + link + verify
npm run status     # check hashes
traenupi          # test
```

### nezha (CLI)
```bash
cd /Users/jk/gits/hub/tools_ai/nezha
npm run dev    # run CLI in dev mode
npm run status # check version
```

## What "dev" Does

1. Clean dist
2. Build with latest code  
3. Delete global install (fixes pnpm caching)
4. Link to global
5. Show verification (hashes match)

## Why Delete Global First?

pnpm caches global packages by path - won't detect your local code changes. Deleting forces fresh install.

## Verifying Works

Check startup logs for correct hash:

```
 NuPI@0bd29925] Starting...
[Piano@476823e] Thinking router ready...
```

If hash looks old, run `npm run dev` again.
