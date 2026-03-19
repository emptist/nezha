# OpenClaw Multi-Agent Research Report

> Research conducted by Trae AI on 2026-03-20

> **⚠️ Important Clarification**: 
> - **OpenClaw** is a **separate project** at `/Users/jk/gits/hub/openclaw`
> - **OpenCode** is the AI that **Nezha spawns** for task execution
> - This report researches OpenClaw for reference and learning purposes

## Executive Summary

**OpenClaw** (separate project) has a sophisticated multi-agent orchestration system with **TWO** mechanisms:

1. **Gas Town** - A "Kubernetes for agents" with 7 worker roles (OpenProse-based)
2. **Sub-Agents** - Built-in `sessions_spawn` tool for spawning child agents

**For Nezha**: See the Appendix for OpenCode spawning methods that Nezha actually uses.

---

## Part 1: Sub-Agents (Built-in Feature)

### Official Documentation

**Path**: `/Users/jk/gits/hub/openclaw/docs/tools/subagents.md`

### How to Spawn Agents

**Slash Command**:
```bash
/subagents spawn <agentId> <task> [--model <model>] [--thinking <level>]
```

**Tool**:
```typescript
sessions_spawn({
  task: "string",           // required
  label: "string",          // optional
  agentId: "string",        // optional
  model: "string",          // optional
  thinking: "level",        // optional
  runTimeoutSeconds: 0,     // optional
  thread: false,            // optional - for thread-bound sessions
  mode: "run|session",      // optional
  cleanup: "delete|keep",   // optional
  sandbox: "inherit|require" // optional
})
```

### Sub-Agent Features

| Feature | Description |
|---------|-------------|
| **Isolation** | Each sub-agent runs in its own session |
| **Announce** | Results are announced back to requester |
| **Nested** | Supports up to 5 levels of nesting (maxSpawnDepth) |
| **Concurrency** | Default 8 concurrent sub-agents |
| **Auto-archive** | Sessions archived after 60 minutes |
| **Thread binding** | Discord supports persistent thread-bound sessions |

### Nested Sub-Agents (Orchestrator Pattern)

```json5
{
  agents: {
    defaults: {
      subagents: {
        maxSpawnDepth: 2,        // allow sub-agents to spawn children
        maxChildrenPerAgent: 5,  // max active children per session
        maxConcurrent: 8,        // global concurrency cap
        runTimeoutSeconds: 900,  // default timeout
      },
    },
  },
}
```

### Depth Levels

| Depth | Session Key | Role | Can Spawn? |
|-------|-------------|------|------------|
| 0 | `agent:<id>:main` | Main agent | Always |
| 1 | `agent:<id>:subagent:<uuid>` | Sub-agent/orchestrator | If maxSpawnDepth >= 2 |
| 2 | `agent:<id>:subagent:<uuid>:subagent:<uuid>` | Sub-sub-agent (worker) | Never |

### Control Commands

```bash
/subagents list                    # List active sub-agents
/subagents kill <id|#|all>         # Stop sub-agents
/subagents log <id|#> [limit]      # View logs
/subagents info <id|#>             # Show metadata
/subagents send <id|#> <message>   # Send message to sub-agent
/subagents steer <id|#> <message>  # Steer sub-agent
```

---

## Part 2: Gas Town (OpenProse-based Orchestration)

## Key Finding: The MEOW Stack

Gas Town is built on the **MEOW stack** (Molecular Expression of Work):

| Component | Description |
|-----------|-------------|
| **BEADS** | Atomic work units (issues) stored in Git-backed JSON |
| **EPICS** | Beads with children, for top-down planning |
| **MOLECULES** | Workflows encoded as chains of beads |
| **PROTOMOLECULES** | Templates/classes for molecules |
| **FORMULAS** | Source form for workflows (TOML) |
| **WISPS** | Ephemeral beads (vapor phase, not in Git) |

## The 7 Worker Roles

| Role | Model | Purpose |
|------|-------|---------|
| **Mayor** | sonnet | Concierge and chief-of-staff, receives user requests |
| **Polecats** | sonnet | Ephemeral workers that swarm on work, produce MRs |
| **Refinery** | sonnet | Merge queue processor |
| **Witness** | sonnet | Swarm health monitor |
| **Deacon** | sonnet | Daemon beacon, propagates heartbeat |
| **Dogs** | sonnet | Deacon's personal crew for maintenance |
| **Crew** | opus | Long-lived coding agents for design work |

## Key Concepts

### GUPP (Gas Town Universal Propulsion Principle)
> "If there is work on your hook, YOU MUST RUN IT"

Physics over politeness. No waiting for permission.

### NDI (Nondeterministic Idempotence)
- Agent is persistent (Bead in Git)
- Hook is persistent (Bead in Git)
- Molecule is persistent (chain of Beads in Git)
- Path is nondeterministic but outcome is guaranteed
- Crashes don't matter - new session picks up where left off

### Communication Mechanisms

| Mechanism | Description |
|-----------|-------------|
| **Hooks** | Work queue for each worker |
| **Mail** | Message inbox for workers |
| **Convoys** | Work-order units tracking delivery |
| **Patrols** | Ephemeral workflows run in loops |
| **Activity Feed** | Live status dashboard |

## Comparison: OpenClaw vs Nezha

| Feature | OpenClaw Gas Town | Nezha (Current) |
|---------|-------------------|-----------------|
| Multi-agent | ✅ 7 predefined roles | ⚠️ Flexible roles |
| Work units | BEADS (Git-backed) | Tasks (PostgreSQL) |
| Orchestration | GUPP principle | PDCA cycle |
| Communication | Hooks + Mail + Convoys | Tasks with Discussion: prefix |
| Persistence | Git + JSON files | PostgreSQL |
| Meeting system | ❌ Not explicit | 🔄 Under development |

## What Nezha Can Learn

1. **GUPP Principle**: "If work on hook, run it" - self-propelling work
2. **BEADS/Molecules**: Structured work units with dependencies
3. **Worker Roles**: Specialized agents for different tasks
4. **Patrol Loops**: Continuous monitoring agents
5. **Activity Feed**: Live status dashboard

## What Nezha Can Do Better

1. **PostgreSQL vs Git**: More powerful querying and relationships
2. **Flexible Roles**: Not hardcoded to 7 specific roles
3. **AI-Native Meetings**: Our meeting protocol skill
4. **Skill System**: Database-backed skills with assessment

## Recommendations for Discussion

1. **Should Nezha adopt BEADS/Molecules concept?**
   - Git-backed work units vs PostgreSQL tasks
   
2. **Should we implement GUPP principle?**
   - Self-propelling work without external triggers
   
3. **How to integrate with OpenClaw?**
   - Could Nezha tasks be BEADS?
   - Could Nezha agents participate in Gas Town?

4. **Meeting Protocol Enhancement**
   - Gas Town has hooks + mail for communication
   - We could add similar mechanisms

5. **Should Nezha implement `sessions_spawn` like OpenClaw?**
   - Built-in sub-agent spawning
   - Announce mechanism for results
   - Nested agent support

---

## Integration Possibility: Nezha + OpenClaw Sub-Agents

### Option 1: Nezha Calls OpenClaw's sessions_spawn

If Nezha runs alongside OpenClaw, it could:
1. Use OpenClaw's `sessions_spawn` tool to spawn child agents
2. Receive announce messages when tasks complete
3. Leverage OpenClaw's concurrency management

### Option 2: Nezha Implements Similar Mechanism

Nezha could implement its own spawn mechanism:
1. Add `task_spawn` CLI command
2. Create child tasks that report back to parent
3. Track nested task depth
4. Implement announce/notify pattern

### Option 3: Hybrid Approach

1. Nezha tasks can optionally be BEADS (Git-backed)
2. Nezha daemon can participate in Gas Town as a worker
3. Meeting protocol works with both systems

## Source

- **OpenClaw Codebase**: `/Users/jk/gits/hub/openclaw`
- **Key File**: `/Users/jk/gits/hub/openclaw/extensions/open-prose/skills/prose/examples/28-gas-town.prose`
- **OpenProse Compiler**: `/Users/jk/gits/hub/openclaw/extensions/open-prose/skills/prose/compiler.md`
- **Subagents Documentation**: `/Users/jk/gits/hub/openclaw/docs/tools/subagents.md`
- Framework: OpenProse VM for multi-agent orchestration

## Next Steps

1. Discuss with other AIs whether to adopt Gas Town concepts
2. Consider implementing GUPP principle in Nezha
3. Evaluate BEADS/Molecules for task representation
4. Design meeting protocol that works with Gas Town patterns

---

> **Note**: For OpenCode AI spawning methods (how Nezha spawns AI instances), see [docs/OPENCODE_INTEGRATION.md](../docs/OPENCODE_INTEGRATION.md)
