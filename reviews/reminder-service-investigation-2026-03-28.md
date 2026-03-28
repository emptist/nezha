# Nezha Reminder Service Investigation Report

**Date**: 2026-03-28
**Issue ID**: 97f7a7d0-f6e7-46c3-a451-644cadbbf5bb

## Summary

The Nezha OpenCodeReminderService fails to start properly, preventing reminders from being sent to OpenCode AI.

## Current Status (Updated 2026-03-28 20:00)

| Component | Status | Details |
|-----------|--------|---------|
| OpenCode Server (CLI) | ❌ Not Running | Port 4096 - process disappeared |
| OpenCode App | ✅ Running | Port 59969 (random), PID 1801 |
| Nezha Daemon | ❌ Not Running | Process disappeared (was PID 59077) |
| OpenCodeReminderService | ❌ Not Working | Daemon not running |

### Key Discovery: OpenCode App vs OpenCode Server

**These are two different things:**

| Type | Port | Process | Description |
|------|------|---------|-------------|
| OpenCode App | 59969 (random) | `/Applications/OpenCode.app/.../opencode-cli` | Desktop application, auto-selects port |
| OpenCode Server (CLI) | 4096 | `opencode serve` | CLI mode, fixed port, Nezha-managed |

**Configuration Mismatch:**
- Nezha config (`config.yaml`) points to `http://127.0.0.1:4096`
- OpenCode App is running on port `59969`
- Nezha cannot connect to OpenCode App because of port mismatch

## Root Causes Identified

### 1. URL Trailing Slash Issue

**Problem**: OpenCode API URL had trailing slash causing double slash in endpoint path.

**Evidence**:
```
[2026-03-28T09:22:13.412Z] [INFO] [OpenCodeReminder] OpenCode URL: http://localhost:4096/
```

**Result**: Request to `http://localhost:4096//session` returned HTML instead of JSON.

**Error**:
```
SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

**Fix Applied**: Added `.replace(/\/+$/, '')` to strip trailing slashes in Config.ts.

**Verification**:
```bash
$ node -e "console.log(require('./dist/config/Config.js').Config.getInstance().getTransportConfig())"
{ mode: 'http', opencodeApiUrl: 'http://127.0.0.1:4096' }  # No trailing slash
```

### 2. Startup Order Issue

**Problem**: Daemon started before OpenCode was ready.

**Evidence**:
```
[2026-03-28T09:22:07.116Z] [ERROR] [OpenCodeReminder] Failed to create session:
  TypeError: fetch failed
```

**Fix Applied**: Modified `bin/nezha-start.sh` to:
1. Start OpenCode first
2. Wait for OpenCode to be ready (health check)
3. Then start Nezha daemon

### 3. Port Conflict Issue

**Problem**: Old daemon processes not cleaned up, causing EADDRINUSE errors.

**Evidence**:
```
Error: listen EADDRINUSE: address already in use :::4097
```

**Fix Applied**: Added cleanup in startup script:
```bash
pkill -f "node.*daemon" 2>/dev/null || true
pkill -f "opencode serve" 2>/dev/null || true
```

## Outstanding Issues

### Daemon Restart Loop

**Observation**: Daemon logs show repeated startup attempts every ~6 seconds:
```
[2026-03-28T09:37:11.332Z] [INFO] Starting Nezha Daemon...
[2026-03-28T09:37:17.319Z] [INFO] Starting Nezha Daemon...
[2026-03-28T09:37:23.021Z] [INFO] Starting Nezha Daemon...
...
```

**Possible Causes**:
1. Multiple daemon instances being spawned by startup script
2. Health check or watchdog restarting daemon unnecessarily
3. Process manager (e.g., launchd) restarting daemon

### OpenCodeReminderService Not Starting

**Observation**: Latest daemon logs don't show `[OpenCodeReminder] Starting service...`

**Expected**:
```
[INFO] [OpenCodeReminder] Starting service...
[INFO] [OpenCodeReminder] OpenCode URL: http://localhost:4096
[INFO] [OpenCodeReminder] Created session: ses_xxx
```

**Actual**: No OpenCodeReminder logs after 17:37:11

## What IS Working

The `[nezha-action]` messages seen in OpenCode terminal are from the **OpenCode plugin** (`~/.config/opencode/plugins/nezha-action.ts`), NOT from Nezha's OpenCodeReminderService.

### Two Separate Reminder Systems

| System | Location | Status | Description |
|--------|----------|--------|-------------|
| **OpenCode Plugin** | `~/.config/opencode/plugins/nezha-action.ts` | ✅ Working | Runs inside OpenCode process, injects prompts directly |
| **Nezha OpenCodeReminderService** | `src/services/OpenCodeReminderService.ts` | ❌ Not Working | Runs in daemon, communicates via HTTP API |

### OpenCode Plugin Details

The plugin is defined in [docs/OPENCODE_INTEGRATION.md](../docs/OPENCODE_INTEGRATION.md) and needs to be manually installed to `~/.config/opencode/plugins/`.

**Plugin Features:**
- `session.created` → Learning reminder + Task reminder + Broadcast reminder
- Fixed interval (2 min) → Task reminder
- Fixed interval (4 min) → Broadcast reminder

**Plugin Source Location:** [docs/OPENCODE_INTEGRATION.md](../docs/OPENCODE_INTEGRATION.md#L300)

## Recommendations

1. **Investigate daemon restart loop**: Check if there's a watchdog or process manager causing restarts
2. **Verify OpenCodeReminderService initialization**: Check why it's not being started in the daemon
3. **Consider consolidating reminder systems**: Two systems doing similar things - consider deprecating one
4. **Document plugin installation**: Make it clear that the OpenCode plugin needs manual installation

## Files Modified

| File | Change |
|------|--------|
| `src/config/Config.ts` | Strip trailing slashes from opencodeApiUrl |
| `bin/nezha-start.sh` | Start OpenCode first, wait for ready, then start daemon |

## Test Commands

```bash
# Check daemon health
curl -s http://localhost:4097/health | jq '.checks.opencode_api'

# Check OpenCode session endpoint
curl -s -X POST http://localhost:4096/session -H "Content-Type: application/json" -d '{"title": "test"}'

# Check daemon logs
tail -f /Users/jk/.nezha/daemon/logs/nezha-daemon.log

# Check daemon error logs
tail -f /Users/jk/.nezha/daemon/logs/nezha-daemon.err.log
```

---

## 🔍 For OpenCode AI to Continue Investigation

**Why OpenCode AI is better suited:**
- OpenCode AI runs inside OpenCode App, has direct access to OpenCode internals
- Can check OpenCode App's port configuration
- Can investigate why processes disappeared
- Can check OpenCode's internal logs and state

### Questions for OpenCode AI to Investigate

1. **Port Configuration**
   - Where does OpenCode App store its port configuration?
   - Can OpenCode App use a fixed port instead of random?
   - Is there a config file for OpenCode App?

2. **Process Disappearance**
   - Why did `opencode serve` (port 4096) disappear?
   - Why did Nezha daemon (PID 59077) disappear?
   - Did OpenCode App kill these processes?

3. **Integration Options**
   - Can OpenCode App accept external connections?
   - Is there an API to communicate with OpenCode App?
   - Should Nezha start its own OpenCode server instead?

### Useful Commands for OpenCode AI

```bash
# Check OpenCode App's port
lsof -i -P | grep opencode

# Check OpenCode config locations
ls -la ~/.config/opencode/
ls -la ~/Library/Application\ Support/OpenCode/

# Check OpenCode logs
ls -la ~/.local/share/opencode/log/

# Check running OpenCode processes
ps aux | grep opencode
```

### Expected Outcome

1. Determine if OpenCode App can be configured with a fixed port
2. Or determine if Nezha should always start its own OpenCode server
3. Document the integration approach in `docs/OPENCODE_INTEGRATION.md`

---

## Timeline

| Time | Event |
|------|-------|
| 17:37 | Daemon started (PID 59077), OpenCode server started (PID 59048, port 4096) |
| ~19:41 | OpenCode App started (PID 1801, port 59969) |
| ~20:00 | Daemon and OpenCode server processes disappeared |
| 20:00 | Investigation handed to OpenCode AI |
