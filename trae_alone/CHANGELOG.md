# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-21

### Added
- Initial release
- `TraeReflect` class for parsing and saving reflection markers
- Support for three marker types:
  - `[LEARN]` - Save learnings to memory
  - `[PROMPT_UPDATE]` - Suggest prompt changes
  - `[ISSUE]` - Create issues
- CLI tool for command-line usage
- `checkPendingWork()` method to check for pending tasks, DLQ items, and issues
- `getRecentLearnings()` method to retrieve recent learnings
- Full TypeScript support with type definitions
- Comprehensive test suite with 14 unit tests

### Features
- Knowledge persistence across AI sessions
- Session continuity for editor-based AIs
- Prevents "Completed" curse by checking for pending work
- PostgreSQL database integration
- External database client support for transactions

## [0.1.0] - 2026-03-20

### Added
- Initial development version
- Basic reflection parsing
- Database integration
