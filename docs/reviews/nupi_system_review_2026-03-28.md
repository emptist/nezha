# NUPI System Review

**Date:** 2026-03-28

---

## Components Built

| Component       | File                            | Status                     |
| --------------- | ------------------------------- | -------------------------- |
| REST API Server | `src/api/NezhaApiServer.ts`     | ✅ Implemented (port 4099) |
| Pi Executor     | `src/services/PiExecutor.ts`    | ✅ Implemented             |
| Pi SDK Executor | `src/services/PiSDKExecutor.ts` | ✅ Implemented             |

### API Endpoints Available

- `/health` - Health check
- `/identity` - Get AI identity
- `/tasks` - Task CRUD (GET/POST)
- `/broadcast` - Broadcast (GET/POST)
- `/memory` - Memory (GET/POST)
- `/prompt` - Execute with Pi model
- `/remind` - Periodic reminders

---

## Key Research Findings

### 1. AI Persistence Mechanism (nupi_ai_persistence_mechanism_research)

**Core Architecture:**

- Pi Extension uses `agent_end` event to detect task completion
- `pi.sendUserMessage()` triggers next task
- `isProcessing` flag prevents infinite loops
- Pi blocks on `getUserInput()` when idle - ideal for continuous work

**Key Insight:** Program is just a trigger, AI is the actual worker.

### 2. Independent Repo Analysis (nupi_independent_repo_analysis)

**Recommendation:** "Progressive Independence" (44/60 score)

- Keep in Nezha initially
- Extract to `src/nupi/` directory later
- Re-evaluate after stability

---

## Issues Identified

1. **BlindLoop Disabled** - `ReminderService.startBlindLoop()` is a no-op
2. **No NUPI Directory** - Research suggested `src/nupi/` but not created
3. **Pi Extension Not Built** - `nezha-blind-loop.ts` designed but not implemented
4. **Tight Coupling** - NezhaApiServer depends on DatabaseClient, Config, logger

---

## Recommendations

### Immediate Actions

1. Create `src/nupi/` directory and move:
   - `src/api/NezhaApiServer.ts`
   - `src/services/PiExecutor.ts`
   - `src/services/PiSDKExecutor.ts`

2. Enable BlindLoop in ReminderService OR implement Pi Extension

3. Test end-to-end flow:
   - Add task via API
   - Pi picks up task
   - Task completes
   - Pi gets next task

### Future Enhancements

- Create `nupi.config.yaml` for independent configuration
- Write `docs/NUPI_GUIDE.md`
- Add Docker support

---

## Architecture Summary

```
┌─────────────────────────────────────┐
│  NezhaApiServer (port 4099)         │
│  - /tasks, /memory, /broadcast       │
│  - /prompt, /remind                 │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  PiExecutor / PiSDKExecutor         │
│  - Executes tasks with Pi           │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Pi (coding agent)                  │
│  - Processes tasks                  │
│  - Blocks when idle                 │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  PostgreSQL (tasks, memory)         │
└─────────────────────────────────────┘
```

---

## Status: Core Infrastructure Ready

NUPI has the foundational pieces. Next step is integration testing and BlindLoop/Pi Extension implementation.
