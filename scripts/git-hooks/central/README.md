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

## Commit Message Validation Rules

**The hook enforces strict quality control:**

| Requirement | Description |
|-------------|-------------|
| `[inter-review: <uuid>]` | **MANDATORY** - Must exist in DB and be completed |
| `[task: <uuid>]` OR `[issue: <uuid>]` | **MANDATORY** - At least one required |

**Example valid commit:**
```bash
git commit -m "feat: add feature [task: abc123] [inter-review: def456]"
git commit -m "fix: bug [issue: xyz789] [inter-review: def456]"
```

**Validation process:**
1. If CLI available: Uses `nezha validate-commit` - strict validation against DB
2. If CLI unavailable: Falls back to simple regex check (less strict)

## Human Commits (Bypass)

**For human developers**, you can bypass the QC requirements by adding `<none ai>` to your commit message:

```bash
# Human commit - no validation required
git commit -m "Quick fix <none ai>"
git commit -m "Update docs [none ai]"
```

When `<none ai>` is detected:
- ✅ Commit is accepted without task/inter-review IDs
- ✅ No `[Agent: <id>]` is appended
- ✅ post-commit skips task auto-completion

## For Weak Model AIs

When working on any Nezha-family project (nezha, nupi, piano):

1. **All commits require inter-review**
   ```
   # First, request an inter-review
   nezha inter-review request <task-id>
   
   # After review is completed, commit with both IDs
   git commit -m "feat: add feature [task: <uuid>] [inter-review: <uuid>]"
   ```

2. **Never bypass hooks**
   - ❌ Don't use `git config core.hooksPath /dev/null`
   - ❌ Don't use `--no-verify`

3. **If commit fails**, fix the message and retry

4. **The hook needs `nezha` command** - make sure it's in PATH or use absolute path