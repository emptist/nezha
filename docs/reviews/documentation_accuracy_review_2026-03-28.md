# Documentation Accuracy Review - 2026-03-28

> Reviewer: Trae AI  
> Purpose: Identify documentation that is outdated or inconsistent with current code

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Accurate | 5 | ✅ |
| Partially Accurate | 3 | ⚠️ |
| Outdated | 4 | ❌ |
| Missing | 2 | 📝 |

---

## Detailed Findings

### ✅ Accurate Documents

| Document | Notes |
|----------|-------|
| `NEVER_DECLARE_DONE.md` | Accurate, reflects current behavior |
| `AGENT_ID_SYSTEM.md` | Accurate, matches `AgentIdentityService.ts` |
| `MEMORY_SYSTEM.md` | Accurate, PostgreSQL-first principle still valid |
| `INTEGRATION_ARCHITECTURE.md` | Accurate, independence principle maintained |
| `issues/AGENT_ID_GENERATION_BUG.md` | Accurate, properly marked as fixed |

### ⚠️ Partially Accurate Documents

| Document | Issue | Recommendation |
|----------|-------|----------------|
| `ARCHITECTURE.md` | Describes `src/services/core/`, `src/services/integration/`, `src/services/support/` directories that don't exist. All services are flat in `src/services/` | Update to reflect current flat structure, or note as "planned" |
| `SERVICE_CATALOG.md` | Directory structure incorrect, but service list mostly accurate | Update directory references, add missing services (Piano, etc.) |
| `WEBHOOK_SYSTEM.md` | Environment variable names in docs don't match code (e.g., `WEBHOOK_SERVER_PORT` not found in code) | Verify actual config method in `WebhookServer.ts` |

### ❌ Outdated Documents

| Document | Issue | Recommendation |
|----------|-------|----------------|
| `CONVERSATION_LOGGING_DESIGN.md` | Describes file-based `conversations/` directory structure. Code uses both DB and file, but file structure differs from docs | Update to reflect actual `ConversationLogger.ts` implementation |
| `PLANS/share-vs-areflect.md` | Decision documented but status shows "Considered by all AI agents" unchecked | Update status or archive if decision is final |
| `INCIDENTS/premature-deprecation-reflect.md` | References `reflect` command which has been renamed to `share` | Update to use current command names |
| `docs/cleanup/AGENT_ID_CLEANUP.md` | May reference old `.nezha/agent-id.json` mechanism | Verify if cleanup is complete |
| `PLANS/rename-auto-reflect-to-atmReflect.md` | Documents rename from `AtmReflect` to `areflect`, but further renamed to `AutonomousReflect` | Mark as historical, link to `renaming_for_ai.md` |
| `PLANS/rename-reflect-to-share.md` | Code done, database status unknown | ✅ Verified: `reflect` command removed, `share` command works |
| `PLANS/opencode-identity-integration.md` | Plan for OpenCode identity integration | ✅ Verified: `set_identity` MCP tool implemented in `learning-server.ts` |

### 📝 Missing Documentation

| Feature | Files | Recommendation |
|---------|-------|----------------|
| Piano Subsystem | `src/piano/` | Create `PIANO_SUBSYSTEM.md` documenting the new task routing architecture |
| MCP/areflect-server | `src/mcp/areflect-server.ts` | Update `AREFLECT.md` with MCP server details |

---

## Code vs Doc Discrepancies

### 1. Service Directory Structure

**Documentation says:**
```
src/services/
├── core/           # Core layer
├── integration/    # Integration layer
└── support/        # Support layer
```

**Actual structure:**
```
src/services/
├── ai/             # AI providers
├── embedding/      # Embedding services
├── heartbeat/      # Heartbeat service
├── [flat files]    # All other services
```

**Impact:** New developers may be confused when trying to find services.

### 2. Webhook Configuration

**Documentation says:**
```bash
WEBHOOK_SERVER_PORT=8789
WEBHOOK_SERVER_PATH=/webhook
WEBHOOK_SERVER_TOKEN=secret123
```

**Code uses:**
```typescript
const DEFAULT_CONFIG: WebhookServerConfig = {
  port: 8789,
  path: '/webhook',
  enabled: true,
};
```

**Issue:** Environment variables not found in code. Config may be passed differently.

### 3. Conversation Logging

**Documentation says:**
```
conversations/
├── 2026-03-17/
│   ├── session-001.jsonl
```

**Code uses:**
- Both database and file storage
- Different constructor signature
- `logDir` parameter defaults to 'conversations'

---

## Recommendations

### Immediate Actions (High Priority)

1. **Update ARCHITECTURE.md** - Remove references to non-existent directory structure
2. **Update SERVICE_CATALOG.md** - Fix directory references, add Piano services
3. **Create PIANO_SUBSYSTEM.md** - Document new Piano architecture

### Medium Priority

4. **Verify WEBHOOK_SYSTEM.md** - Check actual configuration method
5. **Update CONVERSATION_LOGGING_DESIGN.md** - Reflect actual implementation
6. **Archive completed PLANS/** - Move decided plans to appropriate location

### Low Priority

7. **Review all PLANS/** - Check if decisions are implemented
8. **Review INCIDENTS/** - Verify if incidents are resolved
9. **Create doc sync mechanism** - Prevent future drift

---

## Statistics

| Metric | Value |
|--------|-------|
| Total docs reviewed | 17 |
| Accurate | 5 (29%) |
| Needs update | 7 (41%) |
| Implemented plans | 3 (18%) |
| Missing docs | 2 (12%) |
| Total docs in /docs | ~90 |
| Total review reports | ~51 |

---

## Next Steps

1. Prioritize updates based on developer impact
2. Consider creating a "documentation health" check script
3. Add documentation update to PR review checklist
4. Consider auto-generating some docs from code

---

## Related Issues

- Issue #6da3b0f2 - areflect multi-line comment bug
- Issue #087bee7b - Piano subsystem architecture
- Issue #86f9286f - ReminderService notifications
