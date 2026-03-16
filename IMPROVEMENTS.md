# Code Improvements

## Critical Issues

### 1. API Endpoint Mismatch in Agent.ts
- **Location**: `src/core/Agent.ts:229, 257`
- **Issue**: Agent uses `/session` and `/session/${sessionId}/message` but `constants.ts` defines `OPENCODE_API.ENDPOINTS.SESSION` as `/api/session`
- **Impact**: API calls may fail or route to wrong endpoints

### 2. Duplicate Task Completion Logic
- **Location**: `src/services/HeartbeatService.ts:77-80` and `src/core/Scheduler.ts:123-126`
- **Issue**: Both HeartbeatService.executeTask() and Scheduler.heartbeat() mark tasks as COMPLETED
- **Impact**: Redundant database operations, potential race conditions

### 3. Unused Import in db/index.ts
- **Location**: `src/db/index.ts:2`
- **Issue**: Config is imported but never used
- **Impact**: Wasted import, potential confusion

## Type Safety Issues

### 4. Implicit Any Type in CLI
- **Location**: `src/cli/index.ts:100`
- **Issue**: `row` variable has implicit any type from database query
- **Impact**: TypeScript type safety compromised

### 5. Duplicate DatabaseClient Interface
- **Location**: `src/config/types.ts:93-96` and `src/db/DatabaseClient.ts`
- **Issue**: DatabaseClient interface defined in both files
- **Impact**: Potential inconsistencies, code duplication

### 6. Optional projectId Not Handled in Memory
- **Location**: `src/core/Memory.ts:27-30`
- **Issue**: Insert uses `projectId` which can be undefined, but column may not allow null
- **Impact**: Database constraint violations

## Logic Issues

### 7. Blocking Task Execution in Scheduler
- **Location**: `src/core/Scheduler.ts:117`
- **Issue**: `await this.onTaskReady?.()` blocks the heartbeat cycle until task completes
- **Impact**: Heartbeat cannot check for new tasks while executing long-running tasks

### 8. Missing Database Connection Initialization
- **Location**: `src/NezhaCore.ts:27`
- **Issue**: DatabaseClient is instantiated but no explicit connection/ping to verify connectivity
- **Impact**: Connection errors may not surface until first query

### 9. Task Status Reset Without Error Details
- **Location**: `src/core/Scheduler.ts:141-144`
- **Issue**: When task fails, status reset to PENDING but previous error may persist in database
- **Impact**: Error messages from failed attempts may be lost

## Minor Issues

### 10. No Password Validation in Config
- **Location**: `src/config/Config.ts`
- **Issue**: Empty passwords are allowed without warning
- **Impact**: Security risk, silent failures

### 11. No Request Abort Capability in Agent
- **Location**: `src/core/Agent.ts`
- **Issue**: HTTP requests have timeout but no way to abort mid-flight
- **Impact**: Resources may be wasted on cancelled operations

### 12. Return Type Mismatch in getTableNames
- **Location**: `src/db/DatabaseClient.ts:50-52`
- **Issue**: Returns internal constant type instead of proper abstraction
- **Impact**: Leaks internal implementation details
