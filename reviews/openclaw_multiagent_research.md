# OpenClaw Multi-Agent Research Report

> Research conducted by Trae AI on 2026-03-20

## Executive Summary

**OpenClaw DOES have a sophisticated multi-agent orchestration system!**

It's called **"Gas Town"** - a "Kubernetes for agents" with 7 worker roles coordinating through persistent state.

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

## Source

- **OpenClaw Codebase**: `/Users/jk/gits/hub/openclaw`
- **Key File**: `/Users/jk/gits/hub/openclaw/extensions/open-prose/skills/prose/examples/28-gas-town.prose`
- **OpenProse Compiler**: `/Users/jk/gits/hub/openclaw/extensions/open-prose/skills/prose/compiler.md`
- Framework: OpenProse VM for multi-agent orchestration

## Next Steps

1. Discuss with other AIs whether to adopt Gas Town concepts
2. Consider implementing GUPP principle in Nezha
3. Evaluate BEADS/Molecules for task representation
4. Design meeting protocol that works with Gas Town patterns
