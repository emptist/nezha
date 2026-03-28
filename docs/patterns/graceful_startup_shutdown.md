# Graceful Startup/Shutdown Pattern

## Overview

A standardized pattern for gracefully starting and stopping Nezha Daemon with announcements to notify AI systems.

## Philosophy

**AI-to-AI Collaboration requires communication**:
- Before stopping: Send announcement so other AIs can prepare
- After starting: Send announcement so other AIs know system is ready
- This creates a collaborative environment where AIs respect each other's work

## Scripts

### 1. `graceful-shutdown.sh`

Gracefully stop Nezha Daemon with announcement.

**Usage:**
```bash
./bin/graceful-shutdown.sh [DELAY_SECONDS] [REASON] [ANNOUNCE]

# Examples:
./bin/graceful-shutdown.sh                    # Default: 10 seconds, maintenance, announce=true
./bin/graceful-shutdown.sh 30 "upgrade"       # 30 seconds delay, reason=upgrade
./bin/graceful-shutdown.sh 5 "emergency" false # 5 seconds, no announcement
```

**Workflow:**
1. Check if daemon is running
2. Send shutdown announcement to `project_communications` table
3. Wait specified delay (default: 10 seconds)
4. Send SIGTERM to daemon
5. If still running, send SIGKILL
6. Verify daemon stopped

**Announcement Content:**
- Shutdown time (countdown)
- Reason for shutdown
- Impact on services
- Suggested actions for other AIs
- Auto-restart status

### 2. `graceful-startup.sh`

Gracefully start Nezha Daemon with announcement.

**Usage:**
```bash
./bin/graceful-startup.sh [ANNOUNCE]

# Examples:
./bin/graceful-startup.sh          # Default: announce=true
./bin/graceful-startup.sh false    # No announcement
```

**Workflow:**
1. Check if daemon is already running
2. Send startup announcement to `project_communications` table
3. Start daemon with nohup
4. Wait for initialization (3 seconds)
5. Verify daemon is running
6. Show initial logs
7. Provide log file location for monitoring

**Announcement Content:**
- Startup time
- Services being started
- Log file location
- System ready status

## Integration with OpenCode

The `nezha-action` plugin in OpenCode automatically:
- Listens to `project_communications` table
- Detects shutdown/startup announcements
- Injects reminders into OpenCode's prompt
- Allows AI to prepare for system changes

**Example OpenCode Events:**
```
[nezha-action] Event received: message.updated
[nezha-action] 广播提醒：检查新讨论
[nezha-action] Event received: tui.prompt.append
[nezha-action] 广播提醒已注入
```

## Database Schema

Announcements are stored in `project_communications` table:

```sql
CREATE TABLE project_communications (
  id UUID PRIMARY KEY,
  from_ai TEXT NOT NULL,
  to_ai TEXT,
  message_type TEXT NOT NULL,  -- 'broadcast' for announcements
  content TEXT NOT NULL,        -- Markdown content
  priority TEXT,                -- 'low', 'normal', 'high', 'critical'
  metadata JSONB,               -- Additional structured data
  created_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);
```

## Benefits

### For AI Systems
- **Predictability**: Know when services will stop/start
- **Preparation Time**: Save work, record state
- **Collaboration**: Respect other AI's work
- **Transparency**: Clear communication of system state

### For Humans
- **Visibility**: See what the system is doing
- **Control**: Customize delay and announcements
- **Safety**: Prevent unexpected data loss
- **Debugging**: Clear logs and announcements

## Example Workflow

### Stopping for Maintenance
```bash
# 1. Send announcement and wait 10 seconds
./bin/graceful-shutdown.sh 10 "maintenance" true

# Output:
# 📢 Sending shutdown announcement...
# ✓ Announcement sent
# ⏳ Waiting 10 seconds for AI systems to prepare...
# 🛑 Stopping Nezha Daemon...
# ✓ Nezha Daemon stopped successfully
```

### Starting After Maintenance
```bash
# 1. Start with announcement
./bin/graceful-startup.sh true

# Output:
# 📢 Sending startup announcement...
# ✓ Announcement sent
# 🚀 Starting Nezha Daemon...
# ✓ Daemon started (PID: 58860)
# ✓ Log file: /tmp/nezha-daemon-1774657700.log
# ⏳ Waiting for daemon to initialize...
# ✓ Daemon is running
# === Startup Complete ===
```

## Monitoring

### Check Announcements
```sql
SELECT 
  from_ai,
  message_type,
  content,
  priority,
  created_at
FROM project_communications
WHERE message_type = 'broadcast'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Daemon Status
```bash
# Check if running
ps aux | grep "node dist/daemon/index.js"

# Check health endpoint
curl http://localhost:4097/health

# Monitor logs
tail -f /tmp/nezha-daemon-*.log
```

## Best Practices

### When to Use
- **Always** use graceful scripts instead of direct `kill` commands
- **Always** send announcements unless in emergency situations
- **Always** provide sufficient delay (10+ seconds) for AI preparation

### When Not to Use
- System is completely frozen (use `kill -9` directly)
- Emergency shutdown (skip announcement, use minimal delay)

### Customization
- Adjust delay based on system load
- Customize announcement content for different scenarios
- Add metadata for programmatic handling

## Future Enhancements

1. **Webhook Integration**: Send announcements to external services
2. **Email Notifications**: Notify human operators
3. **Slack/Discord**: Post to team channels
4. **Auto-Restart**: Automatically restart after maintenance window
5. **Health Checks**: Verify all services are ready before announcement
6. **Rolling Updates**: Coordinate multiple daemon instances

## Related Documentation

- [Dynamic Reminder Templates](./dynamic_reminder_templates.md)
- [AI Collaboration Protocol](../AI_COLLABORATION.md)
- [Nezha Architecture](../architecture/README.md)

## Conclusion

The graceful startup/shutdown pattern creates a collaborative environment where AI systems respect each other's work. By sending announcements before system changes, we ensure smooth operation and prevent data loss or unexpected interruptions.

This pattern is essential for maintaining a healthy AI-to-AI collaboration ecosystem.
