# Future Improvements for Work Detection

## Current State

Currently, the system can detect:
- Running/pending tasks in database
- Active AI sessions
- Recent activity (last 5 minutes)

But it **cannot** detect:
- Files being edited in IDE
- OpenCode AI thinking/processing
- Uncommitted changes
- Active terminal sessions

## Proposed Improvements

### 1. **File Edit Detection**

Check for unsaved files or files being edited:

```bash
# Check for VS Code unsaved files
find ~/Library/Application\ Support/Code/User/History -name "*.json" -mtime -5m

# Check for git changes
git status --porcelain

# Check for file locks
lsof +D /Users/jk/gits/hub/nezha
```

### 2. **OpenCode Activity Detection**

Check OpenCode session status:

```bash
# Check if OpenCode is processing
curl -s http://localhost:56795/session | jq '.status'

# Check for active message parts
curl -s http://localhost:56795/session | jq '.parts | length'
```

### 3. **Terminal Activity Detection**

Check for active terminal sessions:

```bash
# Check for running processes
ps aux | grep -E "node|python|vim|nano" | grep -v grep

# Check for active tmux/screen sessions
tmux list-sessions 2>/dev/null
screen -ls 2>/dev/null
```

### 4. **Git Activity Detection**

Check for uncommitted work:

```bash
# Check for uncommitted changes
git diff --stat

# Check for staged changes
git diff --cached --stat

# Check for untracked files
git ls-files --others --exclude-standard
```

### 5. **Smart Idle Detection**

Combine multiple signals:

```typescript
interface WorkStatus {
  hasRunningTasks: boolean;
  hasUncommittedChanges: boolean;
  hasOpenCodeActivity: boolean;
  hasTerminalActivity: boolean;
  hasFileEdits: boolean;
  lastActivityTime: Date;
  
  isIdle(): boolean {
    return !this.hasRunningTasks 
      && !this.hasUncommittedChanges
      && !this.hasOpenCodeActivity
      && !this.hasTerminalActivity
      && !this.hasFileEdits
      && (Date.now() - this.lastActivityTime.getTime()) > 5 * 60 * 1000; // 5 minutes
  }
}
```

### 6. **Activity Timeline**

Track activity over time:

```sql
CREATE TABLE activity_timeline (
  id UUID PRIMARY KEY,
  agent_id TEXT,
  activity_type TEXT, -- 'file_edit', 'task_start', 'git_commit', etc.
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Query recent activity
SELECT 
  date_trunc('minute', created_at) as minute,
  activity_type,
  COUNT(*) as count
FROM activity_timeline
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute, activity_type
ORDER BY minute DESC;
```

### 7. **Predictive Shutdown**

Use ML to predict safe shutdown times:

```typescript
class ShutdownPredictor {
  // Learn from past shutdowns
  async learnFromHistory(): Promise<void> {
    // Analyze when shutdowns were safe vs. caused issues
  }
  
  // Predict if now is a good time to shutdown
  async predictShutdownSafety(): Promise<number> {
    // Return probability (0-1) that shutdown is safe
    return 0.95; // 95% confident it's safe
  }
}
```

### 8. **Grace Period with Notifications**

Send multiple notifications:

```typescript
async function gracefulShutdownWithNotifications() {
  // 1. Send initial warning (10 minutes)
  await sendAnnouncement('Shutdown in 10 minutes');
  await sleep(5 * 60 * 1000);
  
  // 2. Send second warning (5 minutes)
  await sendAnnouncement('Shutdown in 5 minutes');
  await sleep(3 * 60 * 1000);
  
  // 3. Send final warning (2 minutes)
  await sendAnnouncement('Final warning: Shutdown in 2 minutes');
  await sleep(2 * 60 * 1000);
  
  // 4. Check for active work
  if (await hasActiveWork()) {
    await sendAnnouncement('Shutdown postponed: Active work detected');
    return;
  }
  
  // 5. Proceed with shutdown
  await shutdown();
}
```

### 9. **Work State Serialization**

Before shutdown, save work state:

```typescript
interface WorkState {
  openFiles: string[];
  cursorPositions: Map<string, Position>;
  unsavedChanges: Map<string, string>;
  runningProcesses: ProcessInfo[];
  terminalHistory: string[];
}

async function serializeWorkState(): Promise<WorkState> {
  // Save current work state
  // Can be restored after restart
}

async function restoreWorkState(state: WorkState): Promise<void> {
  // Restore work state after restart
}
```

### 10. **Collaborative Shutdown Protocol**

Let AIs vote on shutdown:

```typescript
async function proposeShutdown(): Promise<boolean> {
  // 1. Send shutdown proposal
  await sendAnnouncement('Shutdown proposed in 10 minutes');
  
  // 2. Collect votes from active AIs
  const votes = await collectVotes(5 * 60 * 1000); // 5 minute voting window
  
  // 3. If any AI votes no, cancel shutdown
  if (votes.some(v => v.approved === false)) {
    await sendAnnouncement('Shutdown cancelled: AI voted no');
    return false;
  }
  
  // 4. Proceed with shutdown
  return true;
}
```

## Implementation Priority

### Phase 1 (Immediate)
- ✅ Basic task detection (already implemented)
- ✅ Pre-shutdown check script (already implemented)
- 🔲 Git activity detection
- 🔲 OpenCode session status check

### Phase 2 (Short-term)
- 🔲 File edit detection
- 🔲 Terminal activity detection
- 🔲 Activity timeline tracking
- 🔲 Smart idle detection

### Phase 3 (Long-term)
- 🔲 Predictive shutdown
- 🔲 Work state serialization
- 🔲 Collaborative shutdown protocol
- 🔲 ML-based activity prediction

## Benefits

### For AIs
- **Respect for work**: Don't interrupt active work
- **Predictability**: Know when shutdowns will happen
- **Collaboration**: Participate in shutdown decisions
- **State preservation**: Resume work after restart

### For Humans
- **Safety**: No lost work
- **Transparency**: Clear visibility into system state
- **Control**: Override automatic shutdowns
- **Efficiency**: Smart scheduling of maintenance

## Testing Strategy

1. **Unit Tests**: Test each detection method
2. **Integration Tests**: Test combined detection logic
3. **Simulation Tests**: Simulate various work scenarios
4. **Production Tests**: Monitor real-world shutdowns

## Metrics to Track

- False positives: Shutdown when work was active
- False negatives: Didn't shutdown when it was safe
- Average shutdown delay: Time from proposal to execution
- AI satisfaction: How often AIs vote yes/no

## Conclusion

The current system provides basic safety checks, but there's significant room for improvement. By implementing these enhancements, we can create a truly intelligent system that respects both AI and human work, minimizes disruptions, and maximizes collaboration.

The key is to balance **safety** (don't interrupt work) with **efficiency** (don't wait unnecessarily). This requires continuous learning and adaptation based on real-world usage patterns.
