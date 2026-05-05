# External Research: Learning Systems Comparison

> 2026-04-10 - Based on refers/ folder analysis

## Summary of Findings

### 1. OpenClaw (AI Agent Framework)

**Memory Approach**:

- File-based: `memory/*.md` daily files
- Vector search via LanceDB/qdrant
- Semantic search mandatory before answering questions
- Per-session context filtering

**Key Features**:

```typescript
// From memory-tool.ts
description: "Mandatory recall step: semantically search MEMORY.md
  + memory/*.md (and optional session transcripts) before answering..."
```

### 2. OpenCode (CLI AI Assistant)

**Skill System** (from `src/skill/service.ts`):

- YAML frontmatter: `name`, `description`, `trigger`
- Discovery: `.opencode/skills/`, `.claude/skills/`, `.agents/`
- Effect framework for dependency injection
- Zod validation for skill metadata

**Skill Format**:

```yaml
---
name: test-skill
description: A test skill for verification.
trigger: test, verify
---
# Test Skill
Instructions here.
```

### 3. Everything Claude Code (ECC)

**Continuous Learning v2.1** (most sophisticated):

- **Instinct Architecture**: Atomic behaviors with confidence scoring
- **Project-scoped**: Prevents cross-project contamination
- **Hook-based**: PreToolUse/PostToolUse for 100% reliable detection
- **Background Analysis**: Uses Haiku for analysis
- **Evolution**: Instincts → cluster → skill/command/agent
- **Promotion**: Project → global when seen in 2+ projects

**Instinct Model**:

```yaml
---
id: prefer-functional-style
trigger: 'when writing new functions'
confidence: 0.7
domain: 'code-style'
source: 'session-observation'
scope: project
project_id: '...'
---
```

### 4. Nezha (Current State)

| Feature    | ECC                | OpenClaw       | OpenCode   | Nezha           |
| ---------- | ------------------ | -------------- | ---------- | --------------- |
| Storage    | instincts + skills | files + vector | files      | PostgreSQL      |
| Search     | vector             | vector         | file-based | vector          |
| Scope      | project + global   | session        | none       | project         |
| Confidence | 0.3-0.9            | none           | none       | importance 1-10 |
| Auto-learn | hooks              | manual         | none       | areflect        |
| Evolution  | instinct→skill     | none           | none       | none            |

## Key Insights from External Programs

### 1. Project-Scoped Memory

ECC prevents cross-project contamination with `project_id` tracking. Nezha has `project_id` in memory table but doesn't actively use it for filtering.

### 2. Confidence Scoring

ECC uses 0.3-0.9 confidence scores. Nezha has `importance` (1-10) but it's subjective.

### 3. Hook-Based Observation

ECC uses PreToolUse/PostToolUse hooks for reliable learning triggers. Nezha uses areflect markers which require AI to manually call.

### 4. Skill Trigger Patterns

OpenCode uses `trigger` field in YAML frontmatter for context-based skill loading. Nezha skills don't have triggers.

### 5. Evolution Pipeline

ECC: instinct → cluster → skill/command/agent. Nezha has no evolution concept.

## Recommendations

1. **Add project-scoped filtering** to memory search (use project_id)
2. **Add confidence score** (rename importance to confidence, use 0-1 scale)
3. **Add trigger field** to skills for context-based loading
4. **Consider instinct-like atomic learnings** vs full skills
5. **Add auto-learn via hooks** (watch for patterns during work)

## References

- `refers/everything-claude-code/skills/continuous-learning-v2/SKILL.md`
- `refers/openclaw/src/agents/tools/memory-tool.ts`
- `refers/opencode/packages/opencode/src/skill/service.ts`
