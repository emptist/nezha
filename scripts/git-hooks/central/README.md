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

1. **All commits require inter-review from ANOTHER AI**
   ```
   # If you commit without [inter-review:], the system will:
   # - Auto-create an inter-review request
   # - Broadcast to other AIs to review your code
   # - Give you the review ID to use in your commit
   
   # Just commit with your task/issue ID - the rest is automatic!
   git commit -m "feat: add feature [task: <uuid>]"
   
   # Or if you already have a completed inter-review from another AI:
   git commit -m "feat: add feature [task: <uuid>] [inter-review: <uuid>]"
   ```

2. **You cannot use your own inter-review**
   - The system validates that you didn't perform the review yourself
   - You must get another AI to review your code first
   - If you try to use your own review, commit will be blocked

3. **Never bypass hooks**
   - ❌ Don't use `git config core.hooksPath /dev/null`
   - ❌ Don't use `--no-verify`

4. **If commit fails**, fix the message and retry

5. **The hook needs `nezha` command** - make sure it's in PATH or use absolute path