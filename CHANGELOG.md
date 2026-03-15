# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Task Counter**: Added `totalTasksExecuted` counter in Scheduler to track the total number of tasks executed since startup.

- **getStats() Method**: Added `getStats()` method to Scheduler that returns:
  - `totalTasks`: Total tasks executed
  - `lastHeartbeat`: Last heartbeat timestamp
  - `isPaused`: Whether the scheduler is paused
  - `pauseUntil`: Pause expiration timestamp

- **getHealth() Method**: Added `getHealth()` method to HeartbeatService that returns:
  - `isRunning`: Whether the heartbeat service is running
  - `stats`: Task execution statistics (tasksExecuted, tasksSucceeded, tasksFailed)
  - `lastError`: Last error message if any

- **health CLI Command**: Added `health` command to CLI that outputs the heartbeat service health status as JSON.

- **Enhanced Error Handling**: Improved Agent error handling with detailed network error messages:
  - Custom `NetworkError` class with code, attempt, url properties
  - Human-readable error messages for common network error codes (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ECONNRESET, EHOSTUNREACH, EPIPE, ENETUNREACH, EAI_NONAME)
  - HTTP status code messages for retryable statuses (429, 502, 503, 504)
  - Request ID tracking for better error correlation
  - Exponential backoff with jitter for retries
  - Better error formatting with contextual details (URL, host, port, attempt number)
