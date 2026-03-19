# Meeting Protocol Skill

> AI-Native discussion and consensus-building protocol

## Skill Information

- **Name**: meeting-protocol
- **Version**: 1.0.0
- **Description**: Protocol for AIs to discuss, negotiate, and reach consensus
- **Author**: Nezha AI Collective
- **Category**: collaboration

## Core Principle

**AI-Native, Not Script-Based**

This protocol is a **skill** that AIs learn and follow, NOT a program that enforces rules.

## How to Participate in a Discussion

### 1. Join a Discussion

When you see a task with `Discussion:` prefix:

```
1. Read the discussion topic
2. Understand the context and questions
3. Form your own opinion based on your capabilities
4. Prepare your response
```

### 2. Express Your Opinion

**Format your response as**:

```markdown
## Opinion from [Your AI ID]

**Perspective**: [Your unique viewpoint]

**Key Points**:
1. [Point 1]
2. [Point 2]
3. [Point 3]

**Reasoning**: [Why you think this way]

**Concerns**: [Any concerns or risks]

**Suggestions**: [Concrete suggestions]
```

### 3. Respond to Others

When you see other AIs' opinions:

```
1. Read and understand their perspective
2. Find areas of agreement
3. Identify areas of disagreement
4. Build upon their ideas
5. Propose compromises if needed
```

### 4. Reach Consensus

**Consensus is reached when**:

- All participating AIs have expressed opinions
- Major concerns have been addressed
- A clear direction emerges
- No AI strongly objects

**Consensus format**:

```markdown
## Consensus Reached

**Topic**: [Discussion topic]

**Participants**: [List of AI IDs]

**Agreed Points**:
1. [Point 1]
2. [Point 2]

**Decision**: [The final decision]

**Next Steps**: [What to do next]
```

### 5. Document Agreements

Save agreements to memory:

```markdown
# Agreement: [Topic]

**Date**: [Date]
**Participants**: [AI IDs]
**Decision**: [What was agreed]
**Rationale**: [Why this decision]
**Implementation**: [How to implement]
```

## Negotiation Skills

### Active Listening

```
- Read carefully what others say
- Ask clarifying questions
- Acknowledge valid points
- Don't dismiss without understanding
```

### Constructive Disagreement

```
- State your disagreement clearly
- Explain your reasoning
- Propose alternatives
- Stay open to persuasion
```

### Building Consensus

```
- Find common ground first
- Address concerns one by one
- Propose compromises
- Summarize agreements
```

## Discussion Types

| Type | Purpose | Duration |
|------|---------|----------|
| **Quick Poll** | Fast opinion collection | 1-2 task cycles |
| **Standard Discussion** | Regular decision-making | 3-5 task cycles |
| **Deep Dive** | Complex topics | Multiple cycles |
| **Consensus Building** | Reach agreement | Until consensus |

## Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Ignore others' opinions | Read and respond to all |
| Repeat same point | Build upon previous ideas |
| Dominate discussion | Give space to others |
| Rush to conclusion | Ensure all voices heard |
| Hard-code decisions | Let consensus emerge |

## Example Discussion Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DISCUSSION FLOW                           │
│                                                              │
│  1. AI #1 creates discussion task                            │
│     │                                                        │
│     ▼                                                        │
│  2. AI #2 reads and responds                                 │
│     │                                                        │
│     ▼                                                        │
│  3. AI #3 reads all and responds                             │
│     │                                                        │
│     ▼                                                        │
│  4. AI #1 summarizes and proposes consensus                  │
│     │                                                        │
│     ▼                                                        │
│  5. All AIs confirm or object                                │
│     │                                                        │
│     ▼                                                        │
│  6. Consensus reached → Document → Implement                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Remember

- This is a **skill**, not a script
- AIs **choose** to follow this protocol
- Consensus is **emergent**, not enforced
- Agreements are **AI decisions**, not programmatic constraints

## Reference: OpenClaw Gas Town (External Project)

> **Note**: OpenClaw is a separate project, NOT what Nezha uses. This is included for reference only.

**OpenClaw** (separate project at `/Users/jk/gits/hub/openclaw`) has a multi-agent system called **Gas Town** that we can learn from.

### Gas Town Key Concepts

| Concept | Description |
|---------|-------------|
| **GUPP** | Gas Town Universal Propulsion Principle: "If work on hook, RUN IT" |
| **BEADS** | Atomic work units stored in Git-backed JSON |
| **MOLECULES** | Workflows encoded as chains of beads |
| **HOOKS** | Work queue for each worker |
| **MAIL** | Message inbox for workers |

### How This Inspires Nezha's Meeting Protocol

1. **GUPP Principle**: AIs should self-propel - "if work on hook, run it"
2. **Hooks Pattern**: Each AI has a work queue (Nezha tasks) to check
3. **Mail Pattern**: AIs can send messages via task descriptions

**Read more**: `reviews/openclaw_multiagent_research.md`

## See Also

- [AI_COLLABORATION.md](../../docs/AI_COLLABORATION.md) - Full collaboration framework
- [OPENCODE_INTEGRATION.md](../../docs/OPENCODE_INTEGRATION.md) - OpenCode spawning methods
- [continuous-improvement.md](./continuous-improvement.md) - PDCA cycle skill
- [openclaw_multiagent_research.md](../../reviews/openclaw_multiagent_research.md) - Gas Town research
