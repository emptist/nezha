# Nezha Usage Guide

> **Core Principles**: 
> 1. **Database First** - Database is source of truth, GitHub is human UI only
> 2. **AI Value is in Thinking, Not Automation Scripts** - Loop scripts are problematic
> 3. **Few Maintenance Scripts Are Useful** - Distinguish maintenance scripts vs loop scripts

Nezha is an AI-powered **CLI tool** that continuously executes tasks from a PostgreSQL database using OpenCode as the AI agent.

## Design Principle: PostgreSQL-First

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Primary)                           │
│   • All structured data (memories, skills, conversations)        │
│   • Queryable, indexed, relational                              │
│   • The ONE source of truth                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Only when unavoidable
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    File System (Fallback)                         │
│   • Source code (git)                                          │
│   • Config files (config.yaml)                                  │
│   • NOT for knowledge/memory storage                            │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Nezha (CLI Tool)                              │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────┐              │
│  │ PostgreSQL  │────▶│   Scheduler   │────▶│  Agent  │────┐        │
│  │   (tasks)   │     │              │     │         │    │        │
│  │             │◀────│              │◀────│         │◀───┘        │
│  └─────────────┘     └──────────────┘     └─────────┘   │           │
│        │                    │                    │       │           │
│        │              HeartbeatService         │       │           │
│        │                    │                    │       ▼           │
│        │              MemoryService            │  ┌──────────┐     │
│        │                    │                    │  │ OpenCode │     │
│        │              SkillSystem               │  │   API    │     │
│        │                                           │          │     │
│        │              ┌────────────┐              │  │ (port    │     │
│        └─────────────▶│ Built-in   │              │  │  4098)   │     │
│                       │   Model    │              │  └──────────┘     │
│                       │(OpenRouter │              └───────────────────┘
│                       └────────────┘
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
                            NuPI = Nezha + Pi
                            (built on top of Nezha)
```

### Components

1. **PostgreSQL Database** - Stores tasks, memories, skills, conversations
2. **Built-in Model** - OpenRouter models or Ollama local models for reflection, review, inter-review
3. **Scheduler** (`src/core/Scheduler.ts`) - Polls DB for pending tasks
4. **Agent** (`src/core/Agent.ts`) - Communicates with OpenCode API
5. **HeartbeatService** (`src/services/HeartbeatService.ts`) - Orchestrates everything
6. **MemoryService** (`src/core/Memory.ts`) - Stores knowledge and patterns
7. **SkillSystem** (`src/core/SkillSystem.ts`) - DB-only skill loading

## AI Tools for Learning

### Memory Tools

```typescript
// Save important information
memory_save({
  content: 'Key decision: Use PostgreSQL as primary storage',
  tags: ['architecture', 'database'],
  importance: 8,
});

// Search memories
const results = await memory_search('PostgreSQL decisions');

// Link related knowledge
memory_link(memoryId1, memoryId2);
```

### Skill Tools

```typescript
// Search skills
const skills = await search_skills('code review');

// Execute skill
const result = await execute_skill('code-review', { files: ['./src'] });

// Build new skill
const skill = await build_skill({
  name: 'test-generator',
  purpose: 'Generate unit tests from code',
});
```

### Task Review Tools

```typescript
// Review completed task
const review = await review_task({
  taskId: 'task-123',
  taskTitle: 'Fix memory leak',
  result: 'Fixed by adding cleanup',
  testsPassed: true,
});
// Review saves patterns to memory automatically
```

### AI Inter-Review

AI peer review - reviews extract learnings for future AI:

```bash
# Request AI review
npm run review:request [commit-hash]

# Show pending/completed reviews
npm run review:show [review-id]

# View statistics
npm run review:stats
```

**Key principle**: Reviews extract `learnings` - reminders for future AI, not just feedback.

## Knowledge Import

Import from traditional markdown files:

```typescript
// Import all markdown files in directory
await import_markdown_knowledge('./docs');

// Supported types:
// - SOUL.md → identity/persona
// - AGENTS.md → operating instructions
// - memory/*.md → daily memories
// - lore.md → background knowledge
```

## Skill Sources

| Source               | Description          | Security       |
| -------------------- | -------------------- | -------------- |
| **Internally Built** | AI-generated skills  | Full control   |
| **ClawHub**          | External marketplace | Scan + approve |
| **Task Review**      | Learned from QC      | Automatic      |

## Key Files

| File                                      | Purpose                |
| ----------------------------------------- | ---------------------- |
| `src/core/Memory.ts`                      | Memory system          |
| `src/core/SkillSystem.ts`                 | Skill system (DB-only) |
| `src/services/SkillBuilder.ts`            | AI skill builder       |
| `src/services/TaskReviewSkill.ts`         | Task QC + learning     |
| `src/services/InterReviewService.ts`      | AI peer review         |
| `src/services/MarkdownKnowledgeLoader.ts` | File → DB import       |
| `src/services/ClawHubClient.ts`           | ClawHub integration    |

## How Heartbeat Works

1. **Timer triggers**: Scheduler runs `heartbeat()` every 30 seconds (configurable)
2. **Read DB**: Queries for PENDING tasks, locks one atomically using `FOR UPDATE SKIP LOCKED`
3. **Update status**: Changes task from PENDING → RUNNING
4. **Execute via AI**: Calls Agent.executeTask() which:
   - Creates session with OpenCode API
   - Sends task description as message
   - Polls for completion
5. **Update DB**: Marks task as COMPLETED or FAILED based on result
6. **Save memory**: Stores result in memory table for future reference

## Task Lifecycle

```
PENDING → RUNNING → COMPLETED
               └→ FAILED
```

- **PENDING**: Task waiting to be executed
- **RUNNING**: Currently being executed by AI
- **COMPLETED**: Successfully finished
- **FAILED**: Failed after all retries

### Stuck Tasks

Tasks stuck in RUNNING for >5 minutes are automatically reset to PENDING by the scheduler (line 117-121 in Scheduler.ts).

## How to Use

### 1. Start the Heartbeat

```bash
npm run start
# or
node dist/cli/index.js start
```

This starts the continuous loop that polls for tasks.

### 2. Add Tasks

```bash
# Add a simple task
nezha task-add "Review code" "Review src/core for issues" 5

# Add the continuous improvement task
# (This reads HEARTBEAT.md and executes tasks from it)
```

### 3. Check Status

```bash
nezha status    # Shows pending task count
nezha health    # Shows detailed health info
nezha tasks     # Lists recent tasks
```

## Environment Variables

| Variable                 | Default   | Description             |
| ------------------------ | --------- | ----------------------- |
| NEZHA_DB_HOST            | localhost | PostgreSQL host         |
| NEZHA_DB_PORT            | 5432      | PostgreSQL port         |
| NEZHA_DB_NAME            | nezha     | Database name           |
| NEZHA_DB_USER            | postgres  | Database user           |
| NEZHA_DB_PASSWORD        | -         | Database password       |
| NEZHA_HEARTBEAT_INTERVAL | 30000     | Heartbeat interval (ms) |
| NEZHA_TASK_TIMEOUT       | 300000    | Task timeout (ms)       |

## Key Files

| File                               | Purpose                             |
| ---------------------------------- | ----------------------------------- |
| `src/cli/index.ts`                 | CLI entry point                     |
| `src/core/Scheduler.ts`            | Task scheduling and heartbeat logic |
| `src/core/Agent.ts`                | OpenCode API communication          |
| `src/services/HeartbeatService.ts` | Main orchestration                  |
| `src/db/DatabaseClient.ts`         | PostgreSQL client                   |
| `src/config/constants.ts`          | Configuration constants             |

## Database Schema

```sql
-- Tasks table (simplified)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'PENDING',
  priority INTEGER DEFAULT 0,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Memory table (for learning)
CREATE TABLE memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Common Issues and Debugging

### Task Stuck in RUNNING

**Cause**: AI session didn't complete or network issue

**Debug**:

1. Check logs for errors
2. Restart: `nezha stop && nezha start`
3. Tasks >5min old are auto-reset to PENDING (by scheduler)

**How it works**:

- Scheduler.ts line 117-121: Auto-resets RUNNING tasks to PENDING after 5 minutes
- HeartbeatService.executeTask() updates status to COMPLETED or FAILED after AI finishes
- Task lifecycle: PENDING → RUNNING → COMPLETED/FAILED

### Connection Refused to OpenCode

**Cause**: OpenCode API not running on port 4098

**Debug**:

1. Ensure OpenCode is running
2. Check `src/config/constants.ts` for API settings

### Database Connection Failed

**Cause**: PostgreSQL not running or credentials wrong

**Debug**:

1. Check environment variables
2. Verify PostgreSQL is running

## HEARTBEAT.md - AI Self-Improvement

Nezha uses `HEARTBEAT.md` as a self-improvement mechanism:

1. AI reads this file on each heartbeat cycle
2. Executes tasks listed in "Current Tasks"
3. Marks completed tasks with timestamp
4. Adds new tasks as needed

This allows the AI to:

- Continuously improve itself
- Track technical debt
- Execute planned improvements

---

For more details, see the source code and other documentation in `docs/`.

## Continuous Work Instances

This section documents 5 real instances of continuous work from the development session on 2026-03-16. All content is extracted from the conversation log file `.tmp/nezha_session_20260316.json`.

### Instance 1: Implementing CLI task-add Command

**Context**: User requested to implement a CLI command for adding tasks to the system.

**User Request**:

```
实现 CLI task-add 命令
```

**Implementation Process**:

1. **Created CLI entry point** (`src/cli/index.ts`):
   - Implemented `Cli` class with task management methods
   - Added `addTask()` method to insert tasks into database
   - Added `listTasks()` method to display recent tasks
   - Created command-line interface with switch-case for different commands

2. **Key Code Implementation**:

```typescript
async addTask(title: string, description: string, priority: number = 0): Promise<void> {
  const db = await this.getDb();
  await db.query(
    `INSERT INTO tasks (title, description, status, priority) VALUES ($1, $2, $3, $4)`,
    [title, description, TASK_STATUS.PENDING, priority]
  );
  console.log(`Task added: ${title}`);
}

async listTasks(): Promise<void> {
  const db = await this.getDb();
  const result = await db.query(
    `SELECT id, title, status, priority FROM tasks ORDER BY priority DESC, created_at DESC LIMIT 10`
  );
  console.log('Recent tasks:');
  for (const row of result.rows) {
    console.log(`  [${row.status}] ${row.title} (priority: ${row.priority})`);
  }
}
```

3. **Command-line Interface**:

```typescript
switch (command) {
  case 'start':
    await cli.start();
    break;
  case 'stop':
    await cli.stop();
    break;
  case 'status':
    await cli.status();
    break;
  case 'task-add':
    const title = args[1];
    const description = args[2] ?? '';
    const priority = parseInt(args[3] ?? '0', 10);
    if (title) {
      await cli.addTask(title, description, priority);
    } else {
      console.error('Usage: nezha task-add <title> [description] [priority]');
    }
    break;
  case 'tasks':
    await cli.listTasks();
    break;
  default:
    console.log('Commands: start, stop, status, task-add, tasks');
}
```

4. **Testing Process**:

```bash
# Step 1: Test CLI help
$ node dist/cli/index.js help
Commands: start, stop, status, task-add, tasks

# Step 2: Test adding a task
$ node dist/cli/index.js task-add "Test task" "This is a test task" 1
Task added: Test task

# Step 3: Verify task was added
$ node dist/cli/index.js tasks
Recent tasks:
  [PENDING] Test task (priority: 1)
  [completed] Test task: review src code (priority: 1)
```

**Outcome**: Successfully implemented and tested the CLI task-add command, allowing users to add tasks to the system via command line.

**Key Learnings**:

- CLI commands should validate input parameters
- Database operations should use parameterized queries to prevent SQL injection
- User feedback should be clear and immediate
- Testing should cover both success and error cases

---

**Key Learnings**:

- CLI commands should validate input parameters
- Database operations should use parameterized queries to prevent SQL injection
- User feedback should be clear and immediate
- Testing should cover both success and error cases

---

### Instance 2: Continuous Improvement with Detailed task-add Commands

**Context**: After implementing CLI task-add command, the system was used to drive continuous improvement through detailed, well-structured tasks.

**Key Insight**: The task-add command becomes more powerful when used with detailed, multi-step descriptions that guide the AI through complex workflows.

**Example task-add Commands** (from longest to shortest):

1. **Continuous Improvement Cycle Task**:

```bash
node dist/cli/index.js task-add "Review and improve codebase" "This is a continuous improvement cycle. Steps:
1. Read src/core/ files and identify issues or improvements
2. Fix at least one bug or improve one component
3. If any changes made, run 'npm run build' and fix any errors
4. Update relevant documentation if needed
5. Run 'git status' and 'git diff' to see changes
6. Commit with 'git add -A && git commit -m \"fix/improve: [description]\"'
7. Push with 'git push'
8. Report what was done" 10
```

2. **HEARTBEAT.md Execution Task**:

```bash
node dist/cli/index.js task-add "Execute HEARTBEAT.md tasks" "Read HEARTBEAT.md in the current directory. Execute the tasks listed there following the continuous improvement cycle: Review -> Identify -> Fix -> Build -> Test -> Document -> Commit -> Push -> Update HEARTBEAT.md" 10
```

3. **System Improvement Task**:

```bash
node dist/cli/index.js task-add "Improve nezha codebase" "Analyze the src/ directory and identify issues or improvements needed. Fix at least one bug or improve one component. Read the code first to understand the architecture." 10
```

4. **Real Code Improvement Task**:

```bash
node dist/cli/index.js task-add "Real code improvement" "Do actual work:
1. Delete src/tests/ directory (not needed)
2. Read src/core/Scheduler.ts and add a simple but useful feature (like adding a 'lastRun' timestamp tracking)
3. Run npm run build to verify
4. Commit and push" 10
```

5. **Documentation Task**:

```bash
node dist/cli/index.js task-add "Document improvements" "Create a CHANGELOG.md documenting all the improvements made today: task counter, getStats, getHealth, health CLI command, error handling" 10
```

6. **Code Cleanup Task**:

```bash
node dist/cli/index.js task-add "Code cleanup" "Clean up code: remove duplicate code, fix imports, add comments. Build, commit, push." 10
```

7. **Bug Fix Task**:

```bash
node dist/cli/index.js task-add "Fix bugs" "Fix bugs in IMPROVEMENTS.md: #2 (duplicate logic). Build, commit, push." 10
```

8. **Feature Addition Task**:

```bash
node dist/cli/index.js task-add "Add feature" "Read src/core/Scheduler.ts. Add a simple but useful feature: track and log how many tasks have been executed in total. Add a counter." 10
```

9. **Health Check Task**:

```bash
node dist/cli/index.js task-add "Add health check" "Add a health check to HeartbeatService. Add a method that returns { isRunning, stats, lastError }" 10
```

10. **CLI Enhancement Task**:

```bash
node dist/cli/index.js task-add "Add CLI health command" "Add a 'health' command to CLI that calls the getHealth() method and prints the status" 10
```

11. **Stats Enhancement Task**:

```bash
node dist/cli/index.js task-add "Improve more" "Read src/core/Scheduler.ts and add another useful feature: add a getStats() method that returns { totalTasks, lastHeartbeat, isPaused, pauseUntil }" 10
```

12. **Logging Improvement Task**:

```bash
node dist/cli/index.js task-add "Add better logging" "Improve console logging in src/core/Scheduler.ts. Add timestamps and more descriptive messages." 5
```

13. **Error Handling Task**:

```bash
node dist/cli/index.js task-add "Add error logging" "Improve error handling in src/core/Agent.ts. Add proper logging for failed requests." 5
```

14. **Code Review Task**:

```bash
node dist/cli/index.js task-add "Review nezha src code" "Review the src/core directory and identify any issues" 10
```

15. **Simple Test Task**:

```bash
node dist/cli/index.js task-add "Test task" "This is a test task" 1
```

**Outcome**: Successfully demonstrated that detailed task-add commands with step-by-step instructions enable the AI to perform complex multi-step workflows autonomously.

**Key Learnings**:

- Longer task descriptions with numbered steps are more effective
- Include build, test, and commit steps in task descriptions
- Priority parameter (1-10) helps control task execution order
- Tasks should be self-contained with clear success criteria
- Multi-step tasks should include verification steps

---

### Instance 3: AI-Driven Continuous Work Loop

**Context**: The system demonstrated autonomous continuous work by repeatedly executing tasks from the queue, making improvements, and generating new tasks.

**Workflow**:

1. **Initial Setup**:

```bash
# Start heartbeat service
node dist/cli/index.js start

# Add initial task
node dist/cli/index.js task-add "Review nezha src code" "Review the src/core directory and identify any issues" 10
```

2. **AI Execution**:
   - Heartbeat service detects pending task
   - AI executes the task, reviewing code
   - AI identifies issues (e.g., duplicate methods, missing features)
   - AI fixes the issues
   - AI runs `npm run build` to verify
   - AI commits changes with descriptive messages
   - AI pushes to remote repository

3. **Continuous Loop**:
   - After completing a task, AI adds new tasks to the queue
   - Each new task builds on previous improvements
   - The system maintains momentum without human intervention

**Example AI-Generated Tasks**:

```bash
# Task 1: Add task counter
node dist/cli/index.js task-add "Add feature" "Read src/core/Scheduler.ts. Add a simple but useful feature: track and log how many tasks have been executed in total. Add a counter." 10

# Task 2: Add stats method
node dist/cli/index.js task-add "Improve more" "Read src/core/Scheduler.ts and add another useful feature: add a getStats() method that returns { totalTasks, lastHeartbeat, isPaused, pauseUntil }" 10

# Task 3: Add health check
node dist/cli/index.js task-add "Add health check" "Add a health check to HeartbeatService. Add a method that returns { isRunning, stats, lastError }" 10

# Task 4: Add CLI health command
node dist/cli/index.js task-add "Add CLI health command" "Add a 'health' command to CLI that calls the getHealth() method and prints the status" 10

# Task 5: Document improvements
node dist/cli/index.js task-add "Document improvements" "Create a CHANGELOG.md documenting all the improvements made today: task counter, getStats, getHealth, health CLI command, error handling" 10
```

**Outcome**: The system successfully executed a continuous improvement loop, making 5+ improvements autonomously without human intervention.

**Key Learnings**:

- AI can generate and execute tasks autonomously
- Each task should build on previous work
- Include verification steps (build, test) in task descriptions
- The system maintains momentum through self-generated tasks
- Task priority controls execution order

---

### Instance 4: Error Handling and Retry Mechanism

**Context**: During continuous work, the system encountered API timeouts and needed robust error handling.

**Problem**: OpenCode API calls were timing out, causing tasks to fail.

**Solution**: Implemented a retry mechanism in HeartbeatService:

```typescript
async executeTask(taskId: string, title: string, description?: string): Promise<void> {
  const maxRetries = 3;
  const retryDelayMs = 30000; // 30 seconds

  this.stats.tasksExecuted++;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Heartbeat] Executing task: ${title} (attempt ${attempt}/${maxRetries})`);

    const result = await this.agent.executeTask(description || title);

    if (result.success) {
      console.log(`[Heartbeat] Task completed successfully`);

      // Mark task as completed
      await this.db.query(
        `UPDATE ${tableName} SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
        [TASK_STATUS.COMPLETED, JSON.stringify({ message: result.message }), taskId]
      );

      // Save to memory
      await this.memory.save({
        id: crypto.randomUUID(),
        projectId: undefined,
        content: `Task: ${title}\nResult: ${result.message}`,
        metadata: { type: 'task_result', success: true },
      });

      this.stats.tasksSucceeded++;
      return; // Success, exit
    } else {
      console.error(`[Heartbeat] Task failed (attempt ${attempt}/${maxRetries}):`, result.message);
      this.lastError = result.message || 'Unknown error';

      if (attempt < maxRetries) {
        console.log(`[Heartbeat] Waiting ${retryDelayMs / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  // All retries failed
  console.error(`[Heartbeat] Task failed after ${maxRetries} attempts`);
  await this.db.query(
    `UPDATE ${tableName} SET status = $1, error = $2 WHERE id = $3`,
    [TASK_STATUS.FAILED, 'Max retries exceeded', taskId]
  );

  this.stats.tasksFailed++;
}
```

**Task to Test Retry Mechanism**:

```bash
node dist/cli/index.js task-add "Test retry mechanism" "Test the error handling and retry mechanism by executing a task that might fail. Verify that it retries up to 3 times with 30-second delays between attempts." 5
```

**Outcome**: Successfully implemented robust error handling with configurable retry logic, making the system more resilient to transient failures.

**Key Learnings**:

- Implement retry mechanisms for external API calls
- Use exponential backoff or fixed delays between retries
- Track retry attempts and provide clear logging
- Mark tasks as FAILED after max retries
- Save successful results to memory for future reference

---

### Instance 5: Database Connection and Concurrency Control

**Context**: As the system scaled, it needed to handle concurrent task execution and prevent race conditions.

**Problem**: Multiple instances could pick the same task simultaneously, causing duplicate work.

**Solution**: Implemented PostgreSQL CTE + FOR UPDATE SKIP LOCKED for atomic task locking:

```typescript
private async heartbeat(): Promise<void> {
  // Check for stuck RUNNING tasks (older than 5 minutes) - reset to PENDING for retry
  await this.db.query(
    `UPDATE ${tableName} SET status = $1, updated_at = NOW()
     WHERE status = 'RUNNING' AND updated_at < NOW() - INTERVAL '5 minutes'`,
    [TASK_STATUS.PENDING]
  );

  // Find pending task with atomic locking using CTE and SKIP LOCKED
  const result = await this.db.query<{ id: string; title: string; description: string }>(
    `WITH selected_task AS (
       SELECT id, title, description
       FROM ${tableName}
       WHERE status = $1
       ORDER BY priority DESC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE ${tableName}
     SET status = 'RUNNING', updated_at = NOW()
     FROM selected_task
     WHERE ${tableName}.id = selected_task.id
     RETURNING selected_task.id, selected_task.title, selected_task.description`,
    [TASK_STATUS.PENDING]
  );

  if (result.rows.length > 0) {
    const task = result.rows[0];
    log.info(`Scheduler heartbeat: Found pending task "${task.title}" (id: ${task.id}), scheduling for execution`);

    // Execute task and wait for completion
    try {
      await this.onTaskReady?.(task.id, task.title, task.description);
      log.info(`Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) completed successfully`);
      this.consecutiveFailures = 0; // Reset failure count on success
    } catch (err) {
      log.error(`Scheduler heartbeat: Task "${task.title}" (id: ${task.id}) failed with error:`, err);
      this.consecutiveFailures++;

      // Check if we need to pause
      if (this.consecutiveFailures >= 5) {
        this.isPaused = true;
        this.pauseUntil = new Date(Date.now() + 60 * 1000); // Pause for 1 minute
        log.warn(`Scheduler heartbeat: Too many failures (${this.consecutiveFailures}), pausing for 1 minute`);
      }

      // Reset to PENDING for retry (with delay handled by failure count)
      await this.db.query(
        `UPDATE ${tableName} SET status = $1, error = $2 WHERE id = $3`,
        [TASK_STATUS.PENDING, String(err), task.id]
      );
    }
  } else {
    log.info('Scheduler heartbeat: No pending tasks found');
  }
}
```

**Task to Test Concurrency**:

```bash
node dist/cli/index.js task-add "Test concurrency control" "Test the PostgreSQL CTE + FOR UPDATE SKIP LOCKED mechanism by running multiple instances of the heartbeat service simultaneously. Verify that no two instances pick the same task. Add logging to track which instance picks which task." 10
```

**Outcome**: Successfully implemented atomic task locking, preventing race conditions and enabling safe concurrent execution.

**Key Learnings**:

- Use database-level locking for distributed systems
- PostgreSQL CTE + FOR UPDATE SKIP LOCKED is ideal for task queues
- Reset stuck tasks to PENDING for automatic recovery
- Implement backoff mechanisms (pause after consecutive failures)
- Track failure counts and provide clear logging

---

## Summary of Continuous Work

The 5 instances demonstrate:

1. **Instance 1**: Basic CLI implementation for task management
2. **Instance 2**: Detailed task-add commands with multi-step workflows
3. **Instance 3**: Autonomous continuous improvement loop
4. **Instance 4**: Robust error handling and retry mechanisms
5. **Instance 5**: Database-level concurrency control

**Key Principles**:

- Use detailed, step-by-step task descriptions
- Include verification steps (build, test, commit)
- Implement robust error handling and retry logic
- Use database-level locking for concurrency control
- Enable autonomous task generation and execution

**Best Practices**:

- Task descriptions should be as long and detailed as possible
- Include success criteria in task descriptions
- Use priority to control execution order
- Track statistics (tasks executed, succeeded, failed)
- Save results to memory for future reference

---

## AI Inter-Review System

The inter-review system enables AI peer reviews between agents, implementing the self-driven improvement philosophy.

### Core Philosophy

**Reviews are NOT just feedback - they are LEARNING OPPORTUNITIES**

The key output of every review is "learnings" - specific reminders/prompts that get saved to memory to help future AI work better.

```
Review Output
├── Summary (what changed)
├── Learnings (AI-generated reminders for future)  ← Most Valuable
├── Issues (problems found)
├── Suggestions (improvements)
└── Scores (0-100)
```

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│    Task     │────▶│ InterReview  │────▶│  AI     │
│  Completed  │     │   Service    │     │ Reviewer│
└─────────────┘     └──────────────┘     └─────────┘
                            │
                     PostgreSQL
                     ├── inter_reviews (findings)
                     └── memory (learnings)  ← AI builds its own knowledge
```

### How Learnings Work

When AI reviews code, it extracts actionable reminders like:

```json
{
  "learnings": [
    {
      "topic": "TypeScript patterns",
      "reminder": "Always use non-null assertion after rows.length check"
    },
    { "topic": "Database patterns", "reminder": "Use record_spawned_process() when tracking PIDs" },
    {
      "topic": "CLI patterns",
      "reminder": "Config.getInstance() returns singleton, no need to store"
    }
  ]
}
```

These get saved to memory and become part of AI's knowledge base for future work.

### CLI Commands

```bash
# Request AI review of current changes
npm run review:request [commit-hash]

# Show review details or pending reviews
npm run review:show [review-id]

# Show review statistics
npm run review:stats

# Respond to a review
npm run review:respond <review-id> <response>
```

### Programmatic Usage

```typescript
import { InterReviewService } from './services/InterReviewService.js';

// Request review - AI will extract learnings
const reviewId = await reviewService.requestReview({
  taskId: 'task-123',
  commitHash: 'abc123',
  reviewerId: 'nezha-peer-1',
  context: { taskDescription: 'Add inter-review system' },
});

const result = await reviewService.performReview(reviewId, systemPrompt);

// Learnings are automatically saved to memory
console.log(`Extracted ${result.learnings.length} learnings`);

// Later, AI can search memories for relevant patterns
const patterns = await reviewService.extractPatternsFromReviews();
```
