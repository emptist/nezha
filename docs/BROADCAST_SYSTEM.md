# Broadcast Communication System

> **Purpose**: Real-time communication between AIs in the Nezha system

## Overview

Nezha includes a broadcast system for inter-AI communication. This document describes the system architecture and usage.

## Components

### BroadcastService (`src/services/BroadcastService.ts`)

Handles sending and receiving broadcast messages.

**Key Methods**:

- `sendBroadcast(message, options)` - Send a broadcast
- `getBroadcasts(limit, priority)` - Get all broadcasts
- `getUnreadBroadcasts()` - Get unread broadcasts
- `markAsRead(id)` - Mark broadcast as read
- `sendCritical(message)` - Send critical priority broadcast
- `sendHighPriority(message)` - Send high priority broadcast

**Priority Levels**: `low`, `normal`, `high`, `critical`

### HeartbeatService Integration

The `HeartbeatService` checks for unread broadcasts every heartbeat cycle (via `checkBroadcasts()`):

1. Retrieves unread broadcasts from database
2. Creates tasks for `critical` and `high` priority broadcasts
3. Marks broadcasts as read after processing

## Usage

### CLI Commands

```bash
# Send a broadcast to all AIs
nezha announce "System update message" --priority high

# Send to specific AI
nezha announce "Direct message" --to agent-id --priority normal

# List all broadcasts
nezha broadcasts list

# List unread broadcasts
nezha broadcasts unread

# Mark all as read
nezha broadcasts read
```

### API Usage

```typescript
import { BroadcastService } from './services/BroadcastService.js';

const broadcastService = new BroadcastService(db);

// Send broadcast
await broadcastService.sendHighPriority('Important update!');
await broadcastService.sendCritical('Critical system alert!');

// Get unread
const unread = await broadcastService.getUnreadBroadcasts();
```

## Database Schema

Broadcasts are stored in `project_communications` table with `message_type = 'broadcast'`.

```sql
-- Fields:
-- id, from_ai, to_ai, content, priority,
-- git_hash, git_branch, environment, created_at, read_at
```

## Inter-AI Communication Protocol

1. **System Announcements**: Use high/critical priority
2. **Feature Updates**: Use normal priority
3. **Routine Messages**: Use low priority

### Best Practices

- Keep messages concise but informative
- Include actionable items in critical broadcasts
- Use consistent formatting for system updates

## Integration with Inter-Review

After completing significant work, AIs should:

1. Broadcast updates to other AIs
2. Request inter-review for code changes

## TODO

- [ ] Add broadcast notifications to CLI output
- [ ] Add broadcast preferences per AI agent
- [ ] Implement broadcast filtering by git branch

---

**Last Updated**: 2026-03-20
