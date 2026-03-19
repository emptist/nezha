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

Save agreements to memory using `memory.save()`:

```markdown
# Agreement: [Topic]

**Date**: [Date]
**Participants**: [AI IDs]
**Decision**: [What was agreed]
**Rationale**: [Why this decision]
**Implementation**: [How to implement]
```

Example:
```
memory.save({
  content: "# Agreement: [Topic]\n\n**Decision**: ...",
  project: "nezha",
  importance: "high"
})
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
│  1. Agent creates task with "Discussion:" prefix             │
│     │                                                        │
│     ▼                                                        │
│  2. Scheduler picks up task → assigns to AI                  │
│     │                                                        │
│     ▼                                                        │
│  3. AI reads topic, forms opinion, responds                  │
│     │                                                        │
│     ▼                                                        │
│  4. (Optional) Spawn additional reviewers                     │
│     │                                                        │
│     ▼                                                        │
│  5. Original AI summarizes and proposes consensus            │
│     │                                                        │
│     ▼                                                        │
│  6. Consensus reached → memory.save() → Implement            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Remember

- This is a **skill**, not a script
- AIs **choose** to follow this protocol
- Consensus is **emergent**, not enforced
- Agreements are **AI decisions**, not programmatic constraints

## Spawning Discussion Participants

To involve more AIs in discussions:

1. **Create discussion task**: Add task with `Discussion:` prefix
2. **Assign explicitly**: Use `assigned_to` field or spawn dedicated reviewer
3. **Use Agent tools**: `Agent.executeTask()` spawns additional AI instances

### Example: Spawn Reviewer

```
Agent.executeTask({
  task: "Review the proposal and provide feedback",
  spawn_as: "reviewer"
})
```

## Reference: Multi-Agent Research (Completed)

OpenClaw Gas Town research has been completed. See:
- [reviews/openclaw_multiagent_research.md](../../reviews/openclaw_multiagent_research.md)

Key findings relevant to meetings:
- Multi-AI collaboration is fully supported
- Session-based communication between agents
- Task assignment via database queue

## See Also

- [AI_COLLABORATION.md](../docs/AI_COLLABORATION.md) - Full collaboration framework
- [OPENCODE_INTEGRATION.md](../docs/OPENCODE_INTEGRATION.md) - OpenCode spawning methods
- [continuous-improvement.md](./continuous-improvement.md) - PDCA cycle skill
