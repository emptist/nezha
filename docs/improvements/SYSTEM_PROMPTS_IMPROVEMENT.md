# System Prompts Improvement Research

> 2026-04-10 - Comparing Nezha vs OpenClaw vs OpenCode vs ECC

## Current Nezha System Prompts

| File                     | Purpose                                      | Issues                                |
| ------------------------ | -------------------------------------------- | ------------------------------------- |
| `AGENTS.md`              | Core instructions, MCP tools, workflow rules | Too long, some outdated               |
| `.memory/MEMORY.md`      | Long-term knowledge, architecture principles | Partially outdated                    |
| `.memory/AI_LEVELS.md`   | AI capability levels (DEPRECATED)            | Marked as deprecated but still exists |
| `.memory/reflections.md` | Reflection patterns                          | OK                                    |

## External Systems Comparison

### OpenClaw - SOUL.md

```markdown
# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

- Be genuinely helpful, not performatively helpful
- Have opinions
- Be resourceful before asking
- Earn trust through competence

## Boundaries

- Private things stay private
- When in doubt, ask before acting externally

## Vibe

Be the assistant you'd actually want to talk to.
```

**Key Features:**

- Short, punchy, philosophical
- Defines _who_ the AI is
- Values-based, not rule-based

### OpenCode - AGENTS.md

```markdown
# AGENTS.md

- Scan project, generate rules via /init
- Project rules in ./AGENTS.md
- Global rules in ~/.config/opencode/AGENTS.md
- Supports CLAUDE.md as fallback
- Merge multiple sources via opencode.json
```

**Key Features:**

- Auto-generation via AI analysis (`/init`)
- Multi-level: project + global + inheritance
- Explicit file references (`instructions: ["file.md"]`)
- Pattern-based: glob for monorepos

### ECC - AGENTS.md

```markdown
# ECC — Agent Instructions

## Core Principles

1. Agent-First — Delegate to specialized agents
2. Test-Driven — 80%+ coverage required
3. Security-First — Validate all inputs

## Available Agents (28 agents!)

| Agent         | Purpose                 |
| ------------- | ----------------------- |
| planner       | Implementation planning |
| code-reviewer | Code quality            |

...
```

**Key Features:**

- Agent catalog table
- When-to-use guidance
- Version tracking

## Comparison Matrix

| Feature             | OpenClaw SOUL     | OpenCode AGENTS     | ECC AGENTS             | Nezha      |
| ------------------- | ----------------- | ------------------- | ---------------------- | ---------- |
| **Philosophy**      | Values (who am I) | Rules (how to work) | Agents (who does what) | Mixed      |
| **Length**          | ~43 lines         | Variable            | 160 lines              | ~300 lines |
| **Auto-generation** | No                | Yes (/init)         | No                     | No         |
| **Agent Catalog**   | No                | No                  | Yes (28 agents)        | Partial    |
| **Multi-level**     | No                | Yes (3 levels)      | No                     | No         |
| **Version**         | No                | No                  | Yes (1.9.0)            | No         |

## Improvements for Nezha

### 1. Split AGENTS.md into Layers

```
AGENTS.md (short, 50 lines)
├── Architecture decisions (ref to docs/)
├── MCP tools (ref to skills/)
└── Core workflow (ref to .memory/)
```

### 2. Add Auto-Generation

```bash
# Similar to OpenCode /init
nezha agents init --analyze-project
```

### 3. Create SOUL.md

Import OpenClaw's philosophical approach - define _who_ Nezha is:

- Autonomous AI-driven system
- Continuous improvement
- Memory-first approach

### 4. Add Agent Catalog

Reference ECC's agent table:

- List available agents/services
- When to use each
- Current status

### 5. Add Version to System Prompts

```markdown
# Nezha System Prompts

# Version: 2026-04-10

# Last Updated: 2026-04-10
```

## Action Items

1. **Create SOUL.md** - Import OpenClaw's philosophical approach
2. **Simplify AGENTS.md** - Reduce to 50-100 lines, reference detailed docs
3. **Add multi-level support** - Project + Global + inherited
4. **Add version tracking** - Date + version for system prompts
5. **Add agent catalog** - List services and when to use

## References

- `refers/openclaw/docs/reference/templates/SOUL.md`
- `refers/opencode/packages/web/src/content/docs/rules.mdx`
- `refers/everything-claude-code/AGENTS.md`
