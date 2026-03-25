# areflect

[![npm version](https://badge.fury.io/js/areflect.svg)](https://badge.fury.io/js/areflect)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

Standalone reflection tool for Trae Editor AI. Persists knowledge across sessions to overcome the "Completed" curse.

## Why This Exists

Editor-based AIs (like Trae AI) get interrupted when they declare "done" or "completed". This tool enables:

1. **Knowledge Persistence** - Learnings survive across sessions
2. **Session Continuity** - Future sessions can read past learnings
3. **Never Stop** - Always check for pending work

## Installation

```bash
npm install areflect
```

## Quick Start

### CLI Usage

```bash
# Save a learning
npx areflect "[LEARN] insight: Always check for pending work before stopping"

# Check for pending work
npx areflect --check

# View recent learnings
npx areflect --learnings
```

### Programmatic Usage

```typescript
import { AutonomousReflect } from 'areflect';

const reflect = new AutonomousReflect({
  databaseUrl: 'postgresql://postgres@localhost:5432/nezha',
});

await reflect.connect();

// Parse and save reflection markers
const result = await reflect.reflect(`
  [LEARN] insight: PDCA cycle never ends
  [ISSUE] title: Bug found type: bug severity: high
`);

// Check for pending work
const work = await reflect.checkPendingWork();
console.log(`Has work: ${work.hasWork}`);

await reflect.disconnect();
```

## Markers

| Marker              | Description           | Saves To                       |
| ------------------- | --------------------- | ------------------------------ |
| `[LEARN]`           | Save a learning       | `memory` table                 |
| `[PROMPT_UPDATE]`   | Suggest prompt change | `prompt_suggestions` table     |
| `[ISSUE]`           | Create an issue       | `issues` table                 |
| `[ISSUE_RESOLVE]`   | Resolve an issue      | `issues` table                 |
| `[ISSUE_COMMENT]`   | Comment on issue      | `issue_comments` table         |
| `[TASK]`            | Create a task         | `tasks` table                  |
| `[TASK_COMPLETE]`   | Complete a task       | `tasks` table                  |
| `[ANNOUNCE]`        | Broadcast message     | `project_communications` table |
| `[SCHEDULE]`        | Schedule a task       | `scheduled_tasks` table        |
| `[REVIEW_RESPONSE]` | Respond to review     | `inter_reviews` table          |
| `[OPINION]`         | Meeting opinion       | `meeting_opinions` table       |

### Marker Syntax

#### LEARN Marker

```
[LEARN] insight: <your learning> context: <optional context>
```

Example:

```
[LEARN] insight: Always check DLQ before declaring done context: Found 26 stuck items
```

#### PROMPT_UPDATE Marker

```
[PROMPT_UPDATE] current: <current prompt> suggested: <new prompt> reason: <why>
```

Example:

```
[PROMPT_UPDATE] current: "Review code" suggested: "Review code and check tests" reason: Tests often missed
```

#### ISSUE Marker

```
[ISSUE] title: <title> description: <desc> type: <bug|improvement|feature> severity: <low|medium|high|critical> tags: <tag1,tag2>
```

Example:

```
[ISSUE] title: Missing error handling type: bug severity: high tags: api, error-handling
```

#### TASK Marker

```
[TASK] title: <title> description: <desc> priority: <1-10> type: <implementation|review|research> tags: <tag1,tag2>
```

Example:

```
[TASK] title: Fix parser bug priority: 8 type: implementation tags: parser, bug
```

#### ANNOUNCE Marker

```
[ANNOUNCE] message: <text> priority: <low|normal|high|critical> to: <agent-id>
```

Example:

```
[ANNOUNCE] message: DLQ has 43 items, needs attention priority: high
[ANNOUNCE] message: Hey OpenCode, check this out priority: normal to: opencode-ai
```

#### SCHEDULE Marker

```
[SCHEDULE] title: <title> cron: <cron-expression> description: <desc> priority: <1-10>
```

Example:

```
[SCHEDULE] title: Daily cleanup cron: "0 2 * * *" description: Clean up old tasks priority: 5
```

#### REVIEW_RESPONSE Marker

```
[REVIEW_RESPONSE] reviewId: <uuid> response: <your response> accepted: <suggestion1,suggestion2>
```

Example:

```
[REVIEW_RESPONSE] reviewId: abc-123 response: Good suggestions, accepted all accepted: fix-typo, add-tests
```

#### OPINION Marker

```
[OPINION] meetingId: <uuid> perspective: <your view> reasoning: <why> position: support|oppose|neutral
```

Example:

```
[OPINION] meetingId: abc-123 perspective: Should use PostgreSQL reasoning: Better for complex queries position: support
```

#### ISSUE_RESOLVE Marker

```
[ISSUE_RESOLVE] id: <issue-uuid> resolution: <how it was resolved>
```

Example:

```
[ISSUE_RESOLVE] id: abc-123 resolution: Fixed by adding null check
```

#### TASK_COMPLETE Marker

```
[TASK_COMPLETE] id: <task-uuid> result: <optional result message>
```

Example:

```
[TASK_COMPLETE] id: abc-123 result: Successfully migrated to PostgreSQL
```

#### ISSUE_COMMENT Marker

```
[ISSUE_COMMENT] id: <issue-uuid> comment: <your comment> internal: true|false
```

Example:

```
[ISSUE_COMMENT] id: abc-123 comment: This is a duplicate issue internal: false
```

## API Reference

### `AutonomousReflect`

#### Constructor

```typescript
const reflect = new AutonomousReflect(config?: AutonomousReflectConfig);
```

#### Methods

| Method                             | Description                             |
| ---------------------------------- | --------------------------------------- |
| `connect()`                        | Connect to database                     |
| `disconnect()`                     | Disconnect from database                |
| `reflect(text)`                    | Parse and save all markers in text      |
| `checkPendingWork()`               | Check for pending tasks, DLQ, issues    |
| `getRecentLearnings(limit?)`       | Get recent learnings                    |
| `getPendingTasks()`                | Get count of pending/running tasks      |
| `getUnresolvedDLQ()`               | Get count of unresolved DLQ items       |
| `getOpenIssues()`                  | Get count of open issues                |
| `parseLearnMarkers(text)`          | Parse LEARN markers only                |
| `parsePromptUpdateMarkers(text)`   | Parse PROMPT_UPDATE markers only        |
| `parseIssueMarkers(text)`          | Parse ISSUE markers only                |
| `parseIssueResolveMarkers(text)`   | Parse ISSUE_RESOLVE markers only        |
| `parseIssueCommentMarkers(text)`   | Parse ISSUE_COMMENT markers only        |
| `parseTaskMarkers(text)`           | Parse TASK markers only                 |
| `parseTaskCompleteMarkers(text)`   | Parse TASK_COMPLETE markers only        |
| `parseAnnounceMarkers(text)`       | Parse ANNOUNCE markers only             |
| `parseScheduleMarkers(text)`       | Parse SCHEDULE markers only             |
| `parseReviewResponseMarkers(text)` | Parse REVIEW_RESPONSE markers only      |
| `parseOpinionMarkers(text)`        | Parse OPINION markers only              |
| `saveLearning(marker)`             | Save a single learning                  |
| `savePromptUpdate(marker)`         | Save a single prompt suggestion         |
| `saveIssue(marker)`                | Save a single issue                     |
| `resolveIssue(marker)`             | Resolve an issue                        |
| `commentOnIssue(marker)`           | Add comment to issue                    |
| `saveTask(marker)`                 | Save a single task                      |
| `completeTask(marker)`             | Mark task as completed                  |
| `saveAnnounce(marker)`             | Save a single broadcast                 |
| `saveSchedule(marker)`             | Save a single schedule                  |
| `saveReviewResponse(marker)`       | Save a review response                  |
| `saveOpinion(marker)`              | Save a meeting opinion                  |
| `setExternalClient(client)`        | Use external pg client for transactions |
| `checkPendingTasks()`              | Check and display pending tasks         |

### `AutonomousReflectConfig`

```typescript
interface AutonomousReflectConfig {
  databaseUrl?: string; // Full connection string
  host?: string; // Default: localhost
  port?: number; // Default: 5432
  database?: string; // Default: nezha
  user?: string; // Default: postgres
  password?: string; // Default: ''
}
```

### `checkPendingWork()` Result

```typescript
interface PendingWork {
  tasks: number; // Count of PENDING/RUNNING tasks
  dlq: number; // Count of unresolved DLQ items
  issues: number; // Count of open issues
  hasWork: boolean; // True if any pending work exists
}
```

## Environment Variables

| Variable       | Description                       | Default     |
| -------------- | --------------------------------- | ----------- |
| `DATABASE_URL` | Full PostgreSQL connection string | -           |
| `DB_HOST`      | Database host                     | `localhost` |
| `DB_PORT`      | Database port                     | `5432`      |
| `DB_NAME`      | Database name                     | `nezha`     |
| `DB_USER`      | Database user                     | `postgres`  |
| `DB_PASSWORD`  | Database password                 | `''`        |

## Database Requirements

This package requires a PostgreSQL database with the following tables:

- `memory` - For storing learnings
- `issues` - For storing issues
- `tasks` - For checking pending work
- `dead_letter_queue` - For checking DLQ items
- `prompt_suggestions` - For storing prompt suggestions (optional)

See the [Nezha project](https://github.com/nezha-project/nezha) for database schema.

## Integration with Nezha

This package is designed to work with the Nezha autonomous development system:

```typescript
import { AutonomousReflect } from 'areflect';

// In your AI agent
const reflect = new AutonomousReflect();
await reflect.connect();

// After completing work, always check for more
const work = await reflect.checkPendingWork();
if (work.hasWork) {
  console.log('Found pending work - continuing...');
  // Don't stop!
}

// Save learnings for future sessions
await reflect.reflect(`
  [LEARN] insight: ${newInsight} context: ${context}
`);
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Test with watch
npm run test:watch
```

## License

MIT - See [LICENSE](LICENSE) file.

## Contributing

Contributions are welcome! Please read the contributing guidelines first.

## Related Projects

- [Nezha](https://github.com/nezha-project/nezha) - AI-driven autonomous development system
- [Trae Editor](https://trae.ai) - AI-powered code editor
