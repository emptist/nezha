# Nezha System Improvement Plan

**Author**: AI Assistant  
**Date**: 2026-03-18  
**Version**: 1.0

---

## Overview

This plan outlines the steps to fix the issues identified in the system review. The plan is prioritized based on severity and effort, following the AGENTS.md directive to "first research, then implement" by referencing OpenClaw's implementations.

---

## Priority Matrix

| Priority | Phase | Focus Area | Estimated Effort |
|----------|-------|------------|------------------|
| P0 | 1 | Security Fixes | Low |
| P0 | 2 | Core Architecture | High |
| P1 | 3 | Heartbeat System | High |
| P1 | 4 | Memory/Learning | High |
| P2 | 5 | Polish & Cleanup | Low |

---

## Phase 1: Security Fixes (P0 - Week 1)

### 1.1 Fix SQL Injection Vulnerabilities

**Task**: Fix parameterized queries in Memory.ts

**Files to Modify**:
- `src/core/Memory.ts`

**Changes**:
- Replace string interpolation with parameterized queries in:
  - `vectorSearch()` method
  - `keywordSearch()` method  
  - `hybridSearch()` method

**Implementation**:
```typescript
// Before (vulnerable):
`SELECT ... '${embeddingStr}'::vector ...`

// After (secure):
`SELECT ... $1::vector ...`
// Pass embeddingStr as parameter
```

**Verification**: Run existing tests and verify no regressions.

---

### 1.2 Fix Improper Error Handling in Agent

**Task**: Validate response content before returning success

**Files to Modify**:
- `src/core/Agent.ts`

**Changes**:
- Validate that response contains meaningful content
- Return success: false for empty/malformed responses

---

## Phase 2: Core Architecture (P0 - Weeks 2-4)

### 2.1 Implement Direct LLM Integration

**Task**: Replace HTTP wrapper with direct LLM calls

**Reference**: OpenClaw uses direct model integration via `src/auto-reply/` and `src/gateway/`

**Files to Create**:
- `src/llm/` directory with:
  - `LLMProvider.ts` - Base interface
  - `OpenAIProvider.ts` - OpenAI implementation
  - `AnthropicProvider.ts` - Anthropic implementation
  - `config.ts` - LLM configuration

**Implementation Approach**:
1. Create provider interface
2. Implement at least one provider (OpenAI recommended)
3. Modify Agent.ts to use LLMProvider instead of HTTP calls
4. Add configuration for model selection

**Configuration**:
```typescript
interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}
```

### 2.2 Create Tool System

**Task**: Implement callable tools for AI agent

**Reference**: OpenClaw tools defined in `src/tools/` and `src/plugin-sdk/`

**Files to Create**:
- `src/tools/` directory with:
  - `Tool.ts` - Base tool interface
  - `ToolRegistry.ts` - Tool registration and discovery
  - Built-in tools:
    - `ReadFileTool.ts`
    - `WriteFileTool.ts`
    - `ExecuteCommandTool.ts`
    - `SearchCodeTool.ts`
    - `MemorySaveTool.ts`
    - `MemorySearchTool.ts`

**Implementation**:
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}
```

---

## Phase 3: Heartbeat System (P1 - Weeks 5-8)

### 3.1 Implement HEARTBEAT.md Execution

**Task**: Read and execute HEARTBEAT.md file during heartbeat cycles

**Reference**: OpenClaw `src/infra/heartbeat-runner.ts` and `src/auto-reply/heartbeat.ts`

**Files to Create/Modify**:
- `src/services/HeartbeatService.ts` - Major rewrite
- `src/core/HeartbeatRunner.ts` - New file
- `src/config/heartbeat.ts` - Configuration

**Implementation**:
1. Read HEARTBEAT.md from workspace
2. Send content to AI for execution
3. Handle HEARTBEAT_OK response
4. Detect empty content and skip runs

**Configuration**:
```typescript
interface HeartbeatConfig {
  enabled: boolean;
  intervalMs: number;
  workspaceDir: string;
  prompt: string;  // Default: "Read HEARTBEAT.md..."
  activeHours?: {
    start: string;  // "09:00"
    end: string;    // "18:00"
    timezone?: string;
  };
  wakeMode: 'cron' | 'immediate';
}
```

### 3.2 Implement Active Hours

**Task**: Only run heartbeat during configured hours

**Reference**: OpenClaw `src/infra/heartbeat-active-hours.ts`

**Implementation**:
- Check current time against configured active hours
- Skip heartbeat if outside active hours
- Log skipped heartbeats

### 3.3 Implement Wake Modes

**Task**: Support cron-style and immediate wake modes

**Reference**: OpenClaw cron system in `src/automation/`

**Implementation**:
- `cron` mode: Run at scheduled intervals
- `immediate` mode: Run as soon as previous completes
- Configurable per task

---

## Phase 4: Memory and Learning System (P1 - Weeks 9-12)

### 4.1 Complete Memory Tool Implementation

**Task**: Make memory tools callable by AI

**Files to Create/Modify**:
- `src/tools/MemorySaveTool.ts` - New
- `src/tools/MemorySearchTool.ts` - New
- `src/tools/MemoryLinkTool.ts` - New
- `src/core/Memory.ts` - Add tool-friendly interface

**Implementation**:
```typescript
// Example: MemorySaveTool
class MemorySaveTool implements Tool {
  name = 'memory_save';
  description = 'Save important knowledge to permanent memory';
  
  async execute(params: {
    content: string;
    tags?: string[];
    context?: string;
    source?: 'task' | 'error' | 'conversation' | 'heartbeat';
    importance?: number;
  }): Promise<ToolResult> {
    // Implementation
  }
}
```

### 4.2 Integrate Memory with Task Execution

**Task**: Inject relevant memories into task context

**Files to Modify**:
- `src/services/HeartbeatService.ts`
- `src/core/Agent.ts`

**Implementation**:
1. Before executing task, search memory for relevant info
2. Inject memories into prompt/context
3. After task, save result to memory
4. Link related memories

### 4.3 Implement Bootstrap File System

**Task**: Create workspace bootstrap files

**Reference**: OpenClaw `src/agents/bootstrap-files.ts`

**Files to Create**:
- `src/core/BootstrapLoader.ts`
- Default workspace files:
  - `AGENTS.md` - Agent instructions
  - `HEARTBEAT.md` - Checklist
  - `MEMORY.md` - Memory system instructions

**Directory Structure**:
```
workspace/
├── AGENTS.md
├── HEARTBEAT.md
├── MEMORY.md
├── memory/
│   └── YYYY-MM-DD.md
└── .openclaw/
    └── config.json
```

### 4.4 Add Memory Search Enhancement

**Task**: Implement semantic search with embeddings

**Reference**: OpenClaw `src/memory/` (60+ files)

**Enhancements**:
- Better vector search with proper indexing
- Query expansion
- MMR (Maximum Marginal Relevance) for diversity
- Temporal decay for recency

---

## Phase 5: Polish and Cleanup (P2 - Week 13+)

### 5.1 Remove Duplicate Code

**Task**: Clean up duplicate re-exports

**Files to Remove**:
- `src/core/MemoryService.ts` (duplicate re-export)
- `src/services/MemoryService.ts` (duplicate re-export)

### 5.2 Add Comprehensive Tests

**Task**: Improve test coverage

**Target Coverage**:
- Core services: 80%+
- Memory operations: 90%+
- Heartbeat: 80%+

### 5.3 Documentation

**Task**: Update documentation

**Files to Update**:
- `docs/` - Update all design docs
- `README.md` - Update with new features
- Code comments - Add missing documentation

### 5.4 Error Handling Improvements

**Task**: Add proper error recovery

**Implementation**:
- Exponential backoff for retries
- Circuit breaker for external services
- Graceful degradation
- Detailed error logging

---

## Implementation Checklist

### Phase 1: Security (Week 1)
- [ ] Fix SQL injection in Memory.ts
- [ ] Fix error handling in Agent.ts
- [ ] Run security audit

### Phase 2: Core Architecture (Weeks 2-4)
- [ ] Create LLM provider interface
- [ ] Implement OpenAI provider
- [ ] Modify Agent to use LLM
- [ ] Create tool system
- [ ] Register built-in tools

### Phase 3: Heartbeat (Weeks 5-8)
- [ ] Implement HEARTBEAT.md reading
- [ ] Add empty content detection
- [ ] Implement active hours
- [ ] Add wake modes
- [ ] Implement task tracking

### Phase 4: Memory/Learning (Weeks 9-12)
- [ ] Create memory tools
- [ ] Integrate memory with tasks
- [ ] Implement bootstrap files
- [ ] Enhance search capabilities

### Phase 5: Polish (Week 13+)
- [ ] Remove duplicates
- [ ] Add tests
- [ ] Update docs
- [ ] Error handling

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM API costs | High | Medium | Set budget limits, use cheaper models |
| Breaking changes | Medium | High | Comprehensive tests, gradual rollout |
| Security vulnerabilities | Low | High | Code review, security audit |
| Scope creep | High | Medium | Strict priority enforcement |

---

## Success Metrics

1. **Security**: No SQL injection vulnerabilities
2. **Autonomy**: Agent can execute tasks without opencode CLI
3. **Learning**: Agent can save and retrieve knowledge
4. **Reliability**: 95%+ uptime during active hours
5. **Performance**: <5s average task execution time

---

## Dependencies

- OpenAI/Anthropic API key
- PostgreSQL database
- Vector search extension (pgvector)
- Node.js 20+

---

## Open Questions

1. **Which LLM provider to prioritize?**
   - Option A: OpenAI (most mature)
   - Option B: Anthropic (better reasoning)
   - Option C: Ollama (local, free)

2. **Memory storage strategy?**
   - Option A: PostgreSQL + pgvector (current)
   - Option B: SQLite + LanceDB (OpenClaw approach)
   - Option C: Hybrid (local + cloud)

3. **Task queue vs event-driven?**
   - Current: Database polling
   - Alternative: Message queue (RabbitMQ, Redis)

---

**End of Plan**
