# Code Improvements

## Critical Issues

### 1. API Endpoint Mismatch in Agent.ts (FIXED)
- **Location**: `src/core/Agent.ts:223, 251`
- **Issue**: Agent uses `/session` and `/session/${sessionId}/message` but `constants.ts` defines `OPENCODE_API.ENDPOINTS.SESSION` as `/api/session`
- **Impact**: API calls may fail or route to wrong endpoints
- **Fix**: Updated Agent.ts to use `/api/session` and `/api/session/${sessionId}/message`

### 2. Duplicate Task Completion Logic (FIXED)
- **Location**: `src/services/HeartbeatService.ts:77-80` and `src/core/Scheduler.ts:123-126`
- **Issue**: Both HeartbeatService.executeTask() and Scheduler.heartbeat() mark tasks as COMPLETED
- **Impact**: Redundant database operations, potential race conditions

### 3. Unused Import in db/index.ts (FIXED)
- **Location**: `src/db/index.ts:2`
- **Issue**: Config is imported but never used
- **Impact**: Wasted import, potential confusion

### 4. Missing null checks before service start (FIXED)
- **Location**: `src/NezhaCore.ts:35-39`
- **Issue**: The `start()` method doesn't verify that `initialize()` was called first. If `start()` is called without `initialize()`, `this.heartbeatService` will be null, causing a runtime error.
- **Impact**: Potential null reference errors
- **Fix**: Added validation in start() to check db, heartbeatService, and scheduler are initialized

### 5. Async function in setInterval without proper error handling (FIXED)
- **Location**: `src/core/Scheduler.ts:180-192`
- **Issue**: The setInterval callback is an async function that returns a Promise. If an error occurs, it will be an unhandled promise rejection.
- **Impact**: Unhandled promise rejections, potential memory leaks
- **Fix**: Added try-catch in setInterval callback and in scheduleRecurringTask

## Type Safety Issues

### 6. Implicit Any Type in CLI
- **Location**: `src/cli/index.ts:100`
- **Issue**: `row` variable has implicit any type from database query
- **Impact**: TypeScript type safety compromised

### 7. Duplicate DatabaseClient Interface
- **Location**: `src/config/types.ts:93-96` and `src/db/DatabaseClient.ts`
- **Issue**: DatabaseClient interface defined in both files
- **Impact**: Potential inconsistencies, code duplication

### 8. Optional projectId Not Handled in Memory
- **Location**: `src/core/Memory.ts:27-30`
- **Issue**: Insert uses `projectId` which can be undefined, but column may not allow null
- **Impact**: Database constraint violations

### 9. Type mismatch in AgentSession
- **Location**: `src/core/Agent.ts:239-248`
- **Issue**: The response type expects `projectID` but returns `projectId`. Works but could cause confusion.
- **Impact**: Inconsistent naming, potential bugs

### 10. Unused interface in CLI
- **Location**: `src/cli/index.ts:6-9`
- **Issue**: `CliArgs` interface is defined but never used.
- **Impact**: Dead code

## Logic Issues

### 11. Blocking Task Execution in Scheduler
- **Location**: `src/core/Scheduler.ts:117`
- **Issue**: `await this.onTaskReady?.()` blocks the heartbeat cycle until task completes
- **Impact**: Heartbeat cannot check for new tasks while executing long-running tasks

### 12. Missing Database Connection Initialization
- **Location**: `src/NezhaCore.ts:27`
- **Issue**: DatabaseClient is instantiated but no explicit connection/ping to verify connectivity
- **Impact**: Connection errors may not surface until first query

### 13. Task Status Reset Without Error Details
- **Location**: `src/core/Scheduler.ts:141-144`
- **Issue**: When task fails, status reset to PENDING but previous error may persist in database
- **Impact**: Error messages from failed attempts may be lost

### 14. Retry logic off-by-one in Agent
- **Location**: `src/core/Agent.ts:115, 125, 148`
- **Issue**: The loop runs `maxRetries + 1` times, but the retry condition is `attempt > this.maxRetries`. Effectively, only `maxRetries` attempts are made, not `maxRetries + 1`
- **Impact**: Unexpected retry behavior

### 15. HeartbeatService creates duplicate Scheduler
- **Location**: `src/services/HeartbeatService.ts:38`
- **Issue**: In NezhaCore.initialize(), a Scheduler is already created with the db. Then HeartbeatService constructor creates its own Scheduler instance with the same db.
- **Impact**: Two independent schedulers, wasted resources

### 16. Error object to string conversion
- **Location**: `src/core/Scheduler.ts:149`
- **Issue**: Using `String(err)` to convert error to string is unreliable.
- **Impact**: Poor error logging

### 17. Missing validation for database password
- **Location**: `src/config/Config.ts:121-138`
- **Issue**: The `validate()` method doesn't check if the database password is empty
- **Impact**: Silent connection failures

## Minor Issues

### 18. No Password Validation in Config
- **Location**: `src/config/Config.ts`
- **Issue**: Empty passwords are allowed without warning
- **Impact**: Security risk, silent failures

### 19. No Request Abort Capability in Agent
- **Location**: `src/core/Agent.ts`
- **Issue**: HTTP requests have timeout but no way to abort mid-flight
- **Impact**: Resources may be wasted on cancelled operations

### 20. Return Type Mismatch in getTableNames
- **Location**: `src/db/DatabaseClient.ts:50-52`
- **Issue**: Returns internal constant type instead of proper abstraction
- **Impact**: Leaks internal implementation details

### 21. Duplicate MemoryService import path
- **Location**: `src/services/MemoryService.ts:1-4`
- **Issue**: This file re-exports MemoryService from core. It's a pass-through file that adds an extra layer of indirection without value.
- **Impact**: Unnecessary complexity

### 22. AgentSystem is completely unimplemented
- **Location**: `src/core/AgentSystem.ts:1-29`
- **Issue**: The entire class is stubbed with TODO comments.
- **Impact**: Dead code, potential confusion

### 23. Inconsistent error message formatting
- **Location**: `src/core/Agent.ts:235, 263`
- **Issue**: Error messages use `[Agent]` prefix but helper methods use it too, causing double prefixes like `[Agent] [Agent] Failed to create session`.
- **Impact**: Confusing log messages

### 24. Inconsistent use of optional properties
- **Location**: `src/services/HeartbeatService.ts:85`
- **Issue**: `projectId: undefined` is explicitly set instead of simply omitting the property
- **Impact**: Code clarity

### 25. Empty test file
- **Location**: `src/tests/NezhaCore.test.ts:1-7`
- **Issue**: The test file only has a placeholder test that passes. No actual functionality is tested.
- **Impact**: No test coverage

---

## Total Issues: 25