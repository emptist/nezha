# Central Git Hooks

This directory contains shared git hooks for all Nezha-family projects.

## Purpose

- **post-commit**: Auto-complete tasks/issues, announce commits
- **prepare-commit-msg**: Validate commit message, auto-add [Agent: id]

## Setup for New Projects

### Option 1: Clone with template (recommended)
```bash
git init --template=/Users/jk/gits/hub/tools_ai/nezha/scripts/git-hooks/template
```

### Option 2: Use central hooks path
```bash
# For this repo only
git config core.hooksPath /Users/jk/gits/hub/tools_ai/nezha/scripts/git-hooks/central

# Or globally for all repos
git config --global core.hooksPath /Users/jk/gits/hub/tools_ai/nezha/scripts/git-hooks/central
```

### Option 3: Symlink (for existing repos)
```bash
ln -s /Users/jk/gits/hub/tools_ai/nezha/scripts/git-hooks/central/.hooks/* .git/hooks/
```

## Automatic Actions

| Commit contains | Action |
|----------------|--------|
| `[task: <uuid>]` | Mark task COMPLETED |
| `[issue: <uuid>]` | Mark issue RESOLVED |
| (any commit) | Add `[Agent: <id>]` to message |

## For Weak Model AIs

When working on any Nezha-family project (nezha, nupi, piano):

1. **Always include task/issue ID in commits**
   ```
   git commit -m "feat: add feature [task: <uuid>]"
   git commit -m "fix: bug [issue: <uuid>]"
   ```

2. **Never bypass hooks**
   - ❌ Don't use `git config core.hooksPath /dev/null`
   - ❌ Don't use `--no-verify`

3. **If commit fails**, fix the message and retry

4. **The hook needs `nezha` command** - make sure it's in PATH or use absolute path