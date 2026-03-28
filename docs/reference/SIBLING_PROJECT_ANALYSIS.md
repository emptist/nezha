# Nezha vs Sibling Projects Analysis

> Analysis of Nezha compared to sibling projects: pi-mono, openclaw, and opencode
> Last updated: 2026-03-26

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Comparison](#architecture-comparison)
3. [Hook Systems](#hook-systems)
4. [Git Integration](#git-integration)
5. [Extension/Plugin Systems](#extensionplugin-systems)
6. [Quality Control](#quality-control)
7. [Key Learnings](#key-learnings)

---

## Project Overview

| Project | Description | Language | Key Focus | Architecture |
|---------|-------------|----------|-----------|--------------|
| **Nezha** | AI collaboration & task orchestration | TypeScript | Multi-agent coordination, PDCA cycles, Knowledge | Orchestrator |
| **pi-mono** | Core agent loop & SDK | TypeScript | Agent runtime, tool execution, dynamic tools | Execution Engine |
| **openclaw** | Consumer messaging platform | TypeScript | Multi-channel (iMessage, Discord, etc.) | Consumer App |
| **opencode** | Coding agent | TypeScript | Developer productivity, Claude Code-like | Coding Agent |

### 关键发现：OpenCode 与 Nezha 不应耦合

**另一个 AI 的分析结论**：OpenCode 对 Nezha 是多余的。

| OpenCode 能力 | OpenCode 实现 | Nezha 等价 | 结论 |
|--------------|--------------|------------|------|
| LLM 调用 | REST API | `AIProvider` (OpenAI/Anthropic) | ✅ 已有 |
| 会话管理 | Session/Context | 不需要（任务独立） | ❌ 不需要 |
| Tools | 文件/命令执行 | `fs`/`child_process` | ✅ 已有 |

**OpenCode** = 给人类用的 CLI 工具（有 UI、有会话）
**Nezha** = 任务调度器（任务独立，通过 DB 共享）

这验证了我们的判断：**Nezha 和 OpenCode 是互补关系，不是耦合关系**。

---

## Architecture Comparison

### pi-mono (Agent Loop)

```
runAgentLoop() → runLoop() → streamAssistantResponse()
     ↓
AgentEvent: agent_start | turn_start | message_start | message_end
```

**Key Design**:
- `AgentMessage[]` only converted to `Message[]` at LLM boundary
- Supports `beforeToolCall` / `afterToolCall` hooks
- Tool execution modes: `sequential` | `parallel`

### Nezha (Current)

```
Scheduler → AgentExecutor → Database → EventBus → Plugins
```

**Key Components**:
- Task/Issue/InterReview tracking
- PDCA cycle enforcement
- Multi-agent collaboration

---

## Hook Systems

### OpenClaw Hook System (Most Sophisticated)

**Internal Hooks** (Event-driven):
```typescript
// Uses globalThis singleton for cross-chunk sharing
const handlers = globalThis.__openclaw_internal_hook_handlers__ ??= new Map();

// Event types: command | session | agent | gateway | message
registerInternalHook('command:new', async (event) => { ... });
```

**Plugin Hooks** (Lifecycle):
- Full type definitions with priority ordering
- Async support with error handling
- Context objects for each hook type

**Pre-commit Hook** (Security-focused):
```bash
# NUL-delimited file list (safe for spaces/newlines)
while IFS= read -r -d '' file; do
    files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMR -z)
```

### Nezha Hook System

**Current**: Simple prepare-commit-msg hook
- Validates commit message contains task/issue/inter-review ID
- Blocks invalid commits
- Uses eval() for command execution

**Gap**: No internal event-driven hook system like OpenClaw

---

## Git Integration

### pi-mono Extensions

| Extension | Function |
|-----------|----------|
| `dirty-repo-guard.ts` | Blocks session switch if uncommitted changes |
| `auto-commit-on-exit.ts` | Auto-commits using last assistant message |
| `git-checkpoint.ts` | Creates stash checkpoint each turn |

### OpenClaw Pre-commit

```bash
# Key features:
# 1. NUL delimiter for filename safety
# 2. Separate lint and format files
# 3. Auto-fix and re-add
```

### Nezha Quality Control Hook

```bash
# Validates:
# - [task: <uuid>] - Task ID
# - [issue: <uuid>] - Issue ID
# - [inter-review: <uuid>] - Inter-review ID
```

**Current Implementation**:
- ✅ Database validation
- ✅ Clear error messages
- ❌ No NUL delimiter handling
- ❌ No auto-fix/re-add

---

## Extension/Plugin Systems

### pi-mono Extension API

```typescript
pi.on("session_before_switch", async (event, ctx) => {
    return { cancel: true }; // Block action
});

pi.on("session_shutdown", async (_event, ctx) => {
    // Auto commit on exit
});
```

**Lifecycle Hooks**:
- `session_before_switch`
- `session_before_fork`
- `session_shutdown`
- `input` (for input transformation)

### Nezha Plugin System

**Currently**:
- `GitAutoCommitPlugin` - Reminds about uncommitted changes
- `HookPlugin` - Task lifecycle events

**Gap**: No session lifecycle hooks

---

## Quality Control

### OpenCode Style Guide

```typescript
// Prefer single word names
const foo = 1
function journal(dir: string) {}

// Avoid try/catch where possible
// Avoid any type
// Use Bun APIs when possible
```

### Nezha Quality Control

**Implemented**:
- ✅ Commit message validation (task/issue/inter-review ID)
- ✅ Database verification
- ✅ Clear error messages
- ⚠️ Build broken by other AI's refactoring

### pi-mono Validation

```typescript
// Uses TypeBox for runtime validation
validate?: (value: unknown) => PluginConfigValidation;
```

---

## Subagent Chain Pattern (pi-mono)

pi-mono implements a **scout → planner → worker** chain:

```
scout → Gather context about the task
  ↓
planner → Create implementation plan
  ↓
worker → Execute the plan
```

**Prompts**: Stored as markdown files with frontmatter
```yaml
---
description: Full implementation workflow
---
1. Use "scout" agent to find relevant code
2. Use "planner" agent to create plan
3. Use "worker" agent to implement
```

**Apply to Nezha**: Could implement similar pattern for complex tasks

---

## Key Learnings

### From pi-mono

1. **Dirty Repo Guard Pattern**
   - Blocks session switch if uncommitted changes
   - User choice: proceed anyway or commit first
   - **Apply to Nezha**: Could prevent task switching with uncommitted work

2. **Auto-commit Using Assistant Message**
   - Extracts last assistant message as commit message
   - More intelligent than current "Task completed" messages
   - **Apply to Nezha**: Use task description or AI reflection as commit msg

3. **Tool Execution Modes**
   - Sequential vs Parallel tool execution
   - **Apply to Nezha**: Consider for task execution optimization

4. **Subagent Chain Pattern**
   - scout → planner → worker workflow
   - Context passed via `{previous}` placeholder
   - **Apply to Nezha**: Complex tasks could use specialized subagents

5. **Permission Gate Pattern**
   - `tool_call` hook intercepts dangerous commands
   - Dangerous patterns: `rm -rf`, `sudo`, `chmod 777`
   - **Apply to Nezha**: Prevent dangerous git/file operations

6. **Protected Paths Pattern**
   - Blocks write/edit to `.env`, `.git/`, `node_modules/`
   - **Apply to Nezha**: Prevent accidental modifications to sensitive files

### From OpenClaw

1. **NUL-Delimited File Handling**
   - Safe for filenames with spaces/newlines
   - **Apply to Nezha**: Improve hook file handling

2. **Global Hook Registry**
   - Singleton pattern for cross-module hook sharing
   - **Apply to Nezha**: Better plugin/hook architecture

3. **Plugin Lifecycle Types**
   - Full type definitions for hook contexts
   - Priority ordering
   - **Apply to Nezha**: Stronger typing for plugin system

### From OpenCode

1. **Single-Word Variable Names**
   - `pid`, `cfg`, `err`, `opts`
   - More concise code

2. **Avoid Try/Catch**
   - Prefer early returns
   - Cleaner error flow

---

## Memory Systems

### OpenClaw Memory Architecture

```typescript
interface MemorySearchManager {
  search(query: string, opts?: { maxResults?: number; minScore?: number }): Promise<MemorySearchResult[]>;
  status(): MemoryProviderStatus;
  sync?(params?: { force?: boolean }): Promise<void>;
  probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult>;
}
```

**Features**:
- Vector embeddings for semantic search
- Built-in SQLite storage
- Session-based memory sources
- FTS (Full-Text Search) fallback

### Nezha Memory

**Current**: File-based memory in `.tmp/nezha-memory/`
- Daily markdown files
- No vector search

**Gap**: No semantic search capability

---

## Tool Execution Patterns

### pi-mono Tool Execution Modes

```typescript
type ToolExecutionMode = "sequential" | "parallel";
```

**Sequential Mode**:
```typescript
// Each tool call: prepare → execute → finalize → next
for (const toolCall of toolCalls) {
    const preparation = await prepareToolCall(...);
    const executed = await executeTool(preparation);
    await finalizeToolCall(executed, ...);
    results.push(executed);
}
```

**Parallel Mode**:
```typescript
// 1. Prepare all sequentially (for validation/order)
for (const toolCall of toolCalls) {
    const preparation = await prepareToolCall(...);
    runnableCalls.push(preparation);
}
// 2. Execute all allowed tools concurrently
const executed = await Promise.all(
    runnableCalls.map(call => executeTool(call))
);
// 3. Finalize in source order
for (const result of executed) {
    await finalizeToolCall(result, ...);
}
```

**Key Insight**: Results always emitted in assistant source order, regardless of execution order.

---

## Dynamic Tool Registration (pi-mono 的核心能力)

pi-mono 能够在**运行时动态注册工具**，这是它能"任务执行到底"的关键。

### ToolDefinition 接口

```typescript
interface ToolDefinition<TParams extends TSchema, TDetails, TState> {
    name: string;           // 工具名
    label: string;          // UI 显示名
    description: string;    // LLM 描述
    parameters: TParams;   // TypeBox 参数模式

    execute(
        toolCallId: string,
        params: Static<TParams>,
        signal: AbortSignal,
        onUpdate: AgentToolUpdateCallback<TDetails>,
        ctx: ExtensionContext,
    ): Promise<AgentToolResult<TDetails>>;

    // 自定义渲染（可选）
    renderCall?: (args, theme, context) => Component;
    renderResult?: (result, options, theme, context) => Component;
}
```

### 动态注册示例

```typescript
pi.registerTool({
    name: "fetch_web_content",
    label: "Fetch Web",
    description: "Fetch content from a URL",
    parameters: Type.Object({
        url: Type.String(),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
        const content = await fetchUrl(params.url);
        return {
            content: [{ type: "text", text: content }],
            details: { url: params.url, length: content.length }
        };
    }
});
```

### Extension 生命周期 Hooks

```typescript
// 工具注册和命令处理
pi.registerTool({ ... });           // 注册工具
pi.registerCommand("name", {       // 注册命令
    description: "...",
    handler: async (args, ctx) => { ... }
});

// 事件订阅
pi.on("session_start", (_event, ctx) => {
    // Session 启动时注册工具
    pi.registerTool({ ... });
});

pi.on("session_shutdown", async (_event, ctx) => {
    // Session 关闭时清理或自动 commit
});

pi.on("tool_call", async (event, ctx) => {
    // 拦截工具调用 - 可用于权限检查、危险命令拦截
    if (event.toolName === "bash") {
        if (isDangerous(event.input.command)) {
            return { block: true, reason: "Dangerous command" };
        }
    }
});
```

### 任务执行到底的关键机制

1. **Tool Call Interception** (`tool_call` hook)
   - 拦截任何工具调用
   - 可选择阻止 (`block: true`) 或修改行为

2. **Runtime Tool Registration**
   - 可以在任何时候注册新工具
   - `pi.registerTool()` 立即生效

3. **Dynamic Command Registration**
   - 可以注册新的 slash commands
   - 用户可以通过命令触发复杂工作流

4. **Context Preservation**
   - `ExtensionContext` 保持 session 状态
   - 工具可以访问和修改 session 状态

---

## Nezha vs pi-mono: Task Execution Capability

| 能力 | pi-mono | Nezha |
|------|---------|-------|
| 动态工具注册 | ✅ `registerTool()` | ❌ 静态工具 |
| 工具调用拦截 | ✅ `tool_call` hook | ❌ 无 |
| 运行时创建程序 | ✅ 可通过 Bash 执行 | ⚠️ 依赖外部 |
| 任务完成保证 | ✅ AI 自主搜寻资源 | ❌ 遇到困难可能放弃 |
| Session 生命周期 | ✅ 完整 hooks | ⚠️ 部分 |
| 工具执行模式 | ✅ sequential/parallel | ❌ 无 |

### Nezha 缺少的关键能力

1. **Dynamic Tool Registration**
   - 无法在运行时注册新工具
   - 工具集是固定的

2. **Tool Call Interception**
   - 无法拦截和修改工具调用
   - 无法实现 permission-gate

3. **AI Self-Reliance**
   - 遇到困难不会主动创建工具
   - 依赖预设的工具集

---

## 深入分析：pi-mono 如何实现"任务执行到底"

### 核心洞察：工具的"自我进化"

pi-mono 的关键能力不是"有一个工具能解决所有问题"，而是**能够根据需要动态创建新工具**。

```
遇到困难问题
    ↓
AI 分析需要什么工具
    ↓
AI 写代码创建工具
    ↓
注册新工具到 session
    ↓
使用新工具继续解决问题
```

### 实现机制分解

#### 1. 动态工具注册 (Dynamic Tool Registration)

```typescript
// 任何时候都可以调用
pi.registerTool({
    name: "solve_problem_X",
    label: "Solve Problem X",
    description: "专门解决 X 问题的工具",
    parameters: Type.Object({ input: Type.String() }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
        // AI 生成的解决逻辑
        const solution = await generateSolution(params.input);
        return { content: [{ type: "text", text: solution }] };
    }
});
```

**关键**：`registerTool()` 可以在任何时候调用，包括：
- `session_start` - 初始化时注册基础工具
- `tool_call` hook - 遇到困难时即时创建
- `registerCommand` handler - 用户触发时注册

#### 2. 工具调用拦截 (Tool Call Interception)

```typescript
// 拦截任何工具调用
pi.on("tool_call", async (event, ctx) => {
    // event 包含:
    // - event.toolName: 工具名
    // - event.input: 工具参数
    // - event.toolCallId: 调用 ID

    // 检查是否是困难问题
    if (isDifficultProblem(event.input)) {
        // AI 可以选择:
        // 1. 阻止执行
        // 2. 修改输入
        // 3. 先执行另一个工具获取信息
        // 4. 创建新工具来处理

        // 创建专用工具
        const toolCode = generateToolCode(event.input);
        const tool = compileTool(toolCode);

        pi.registerTool(tool);
        return { block: true }; // 阻止当前调用
        // AI 下次会调用新注册的工具
    }
});
```

#### 3. Extension 生命周期 Hooks

```typescript
pi.on("session_start", async (_event, ctx) => {
    // Session 启动 - 注册基础工具集
});

pi.on("session_shutdown", async (_event, ctx) => {
    // Session 关闭 - 可以自动 commit
    // 清理临时工具
});

pi.on("tool_call", async (event, ctx) => {
    // 每个工具调用都会触发
    // 可以拦截、修改、阻止
});

pi.on("turn_end", async (_event, ctx) => {
    // 每个 turn 结束 - 检查是否需要创建新工具
});
```

#### 4. System Prompt 的动态构建

```typescript
function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
    // 工具列表从这里来
    const tools = selectedTools || ["read", "bash", "edit", "write"];

    // 动态注册的工具会被包含在：
    // 1. toolsList - 可用工具列表
    // 2. toolSnippets - 工具描述
    // 3. promptGuidelines - 使用指南

    // AI 会根据这些信息决定调用什么工具
}
```

### AI "自我进化" 的工作流

```
┌─────────────────────────────────────────────────────────────┐
│                        User Task                            │
│                    "实现 Feature X"                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      AI tries tools                          │
│         read, edit, write, bash...                          │
│                    遇到困难                                  │
│         "需要一个专门处理 Y 的工具"                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   AI 写代码创建工具                          │
│                                                             │
│   pi.registerTool({                                        │
│       name: "handle_y",                                     │
│       description: "处理 Y 问题",                           │
│       execute: async (...) => {                             │
│           // AI 生成的解决逻辑                               │
│           return solveY(params);                           │
│       }                                                     │
│   });                                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    工具已注册                                │
│              AI 继续使用新工具完成任务                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Task Complete                          │
│           新工具被保留供后续使用                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 潜在合作方向: Nezha + pi

### Option 1: Nezha 作为 pi 的任务协调层

```
Nezha (Task Orchestration)
    ↓ 创建任务、分配任务
pi (Execution Engine)
    ↓ 执行到底、动态创建工具
Nezha (Review & Learn)
    ↓ 评审结果、更新知识
```

**分工**：
- **Nezha 负责任务**：
  - 任务创建、分解、分配
  - PDCA 循环执行
  - 跨任务协调
  - 知识沉淀

- **pi 负责任务**：
  - 单个任务的执行
  - 遇到困难时自主创建工具
  - 确保任务完成

### Option 2: 借用 pi 的 Extension 系统

将 pi 的 extension 机制引入 Nezha：

```typescript
// 目标：在 Nezha 中实现
nezha.registerTool({
    name: "fetch_web",
    execute: async (toolCallId, params) => {
        return await fetchUrl(params.url);
    }
});

nezha.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && isDangerous(event.input.command)) {
        return { block: true, reason: "Dangerous!" };
    }
});
```

### Option 3: 直接调用 pi 执行特定任务

```typescript
// Nezha TaskExecutor 调用 pi
class PiExecutionEngine implements IExecutionEngine {
    async executeTask(task: Task): Promise<TaskResult> {
        const session = await this.pi.createSession({
            task: task.description,
            context: task.context,
        });

        // pi 自己处理困难，会动态创建工具
        const result = await session.runUntilComplete();

        return {
            success: result.success,
            output: result.messages,
            toolsCreated: result.tools,
        };
    }
}
```

### Option 4: Nezha + pi 混合架构

```
┌────────────────────────────────────────────────────────────┐
│                      User Interface                         │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│                      Nezha (Orchestrator)                  │
│  - Task Management (tasks, issues, inter_reviews)          │
│  - PDCA Cycles                                             │
│  - Multi-agent Coordination                                 │
│  - Memory & Knowledge                                      │
│  - Quality Control (commit validation)                      │
└────────────────────────────────────────────────────────────┘
              ↓                                    ↓
┌──────────────────────┐              ┌──────────────────────┐
│   pi Session 1      │              │   pi Session N       │
│   (Task Execution)  │              │   (Task Execution)  │
│   - Dynamic Tools   │              │   - Dynamic Tools   │
│   - Self-reliant    │              │   - Self-reliant    │
└──────────────────────┘              └──────────────────────┘
```

---

## 具体实现建议

### Phase 1: 分析 pi-mono 的 SDK 接口

```typescript
// 查看 pi 的 SDK
interface PiSDK {
    createSession(options: SessionOptions): Session;
    registerTool(tool: ToolDefinition): void;
    on(event: string, handler: EventHandler): void;
}

interface Session {
    run(task: string): Promise<SessionResult>;
    runUntilComplete(): Promise<SessionResult>;
    shutdown(): Promise<void>;
}
```

### Phase 2: 设计 Nezha-Pi 桥接层

```typescript
// src/execution/PiExecutionBridge.ts

interface PiExecutionBridgeConfig {
    piPath: string;           // pi-mono 路径
    maxConcurrent: number;     // 最大并发 session 数
    defaultTimeout: number;   // 默认超时
}

class PiExecutionBridge {
    private sessions: Map<string, Session> = new Map();

    async executeTask(task: Task): Promise<TaskResult> {
        // 1. 创建或复用 pi session
        const session = await this.getOrCreateSession(task.agentId);

        // 2. 转换 task 为 pi 格式
        const piTask = this.transformTask(task);

        // 3. 执行
        const result = await session.run(piTask);

        // 4. 转换结果
        return this.transformResult(result);
    }

    private async getOrCreateSession(agentId: string): Promise<Session> {
        // 实现 session 复用逻辑
    }
}
```

### Phase 3: 实现任务委派

```typescript
// src/services/TaskExecutionService.ts

class TaskExecutionService {
    private bridge: PiExecutionBridge;

    async executeTask(task: Task): Promise<void> {
        try {
            // 更新状态
            await this.updateTaskStatus(task.id, 'RUNNING');

            // 委派给 pi 执行
            const result = await this.bridge.executeTask(task);

            if (result.success) {
                await this.updateTaskStatus(task.id, 'COMPLETED');
                await this.saveCommitInfo(task.id, result.commit);
            } else {
                await this.handleTaskFailure(task.id, result.error);
            }
        } catch (error) {
            await this.handleTaskError(task.id, error);
        }
    }
}
```

---

## 关键差异对比

| 方面 | pi-mono | Nezha | 差异说明 |
|------|---------|-------|----------|
| **任务来源** | 用户直接输入 | Task/Issue 系统 | Nezha 有结构化任务管理 |
| **执行模式** | Session 内循环 | 单次调用 | pi 持续运行直到完成 |
| **工具创建** | 运行时动态注册 | 静态预设 | pi 可自我进化 |
| **生命周期** | Session-based | 请求-based | pi 有更长的上下文 |
| **协调能力** | 无 | PDCA + 多Agent | Nezha 更适合复杂协作 |
| **知识沉淀** | 无 | Memory 系统 | Nezha 有持久化知识 |

### 互补性分析

**pi 强项** → **Nezha 弱项**：
- 动态工具创建
- 任务自主完成
- 运行时自我修复

**Nezha 强项** → **pi 弱项**：
- 结构化任务管理
- PDCA 循环
- 跨任务协调
- 知识持久化
- 多 Agent 协作

---

## Ollama 集成：打破模型限制

### pi-mono 原生支持 Ollama

```json
// ~/.pi/agent/models.json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" },
        { "id": "codellama:13b" }
      ]
    }
  }
}
```

**关键配置**：
- `baseUrl`: Ollama 的 OpenAI-compatible API
- `api`: `openai-completions`
- `apiKey`: 任意值（Ollama 忽略）
- `compat`: Ollama 不支持 `developer` role 和 `reasoning_effort`

### Ollama 模型选择

| 模型 | 体积 | 适用场景 | 内存需求 |
|------|------|----------|----------|
| `qwen2.5:3b` | ~2GB | 轻量任务（推荐起步） | ~3GB |
| `llama3.2:3b` | ~2GB | 通用任务 | ~3GB |
| `qwen2.5-coder:7b` | ~6GB | 代码生成 | ~6GB |
| `llama3.1:8b` | ~8GB | 通用任务 | ~8GB |
| `codellama:13b` | ~13GB | 复杂代码 | ~13GB |
| `llama3.1:70b` | ~70GB | 高级推理 | ~70GB |

---

## 所有合作/融合模式

### 模式总览

| 模式 | 编排层 | 执行层 | 模型 | 成本 | 复杂度 |
|------|--------|--------|------|------|--------|
| **1. Nezha + pi (Ollama)** | Nezha | pi | Ollama 本地 | 免费 | 低 |
| **2. Nezha + pi (Groq)** | Nezha | pi | Groq 免费 | 免费 | 低 |
| **3. Nezha + pi (Together)** | Nezha | pi | Together AI | 免费试用 | 低 |
| **4. Nezha 调用 pi (Trae)** | Nezha | pi | Trae Claude | 已有的 | 最低 |
| **5. Nezha 移植 pi 机制** | Nezha | Nezha | 任意 | 取决于模型 | 高 |
| **6. 完全融合** | Nezha+pi 混合 | - | 任意 | 取决于模型 | 最高 |

---

### 模式 1：Nezha + pi (Ollama 本地) ⭐推荐

```
┌─────────────────────────────────────┐
│  Nezha (Trae 编排)                  │
│  - 任务管理、PDCA、知识沉淀          │
└─────────────────────────────────────┘
              ↓ 委派任务
┌─────────────────────────────────────┐
│  pi (Ollama 执行)                   │
│  - 动态工具、会话持续到完成          │
│  - 模型: qwen2.5:3b (~2GB)          │
└─────────────────────────────────────┘
```

**配置**：
```bash
# 1. 安装 Ollama 并拉取小模型
ollama pull qwen2.5:3b

# 2. 配置 pi 使用 Ollama
cat > ~/.pi/agent/models.json << 'EOF'
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        { "id": "qwen2.5:3b" }
      ]
    }
  }
}
EOF
```

**优点**：零成本、隐私完全本地、实现简单
**缺点**：小模型能力有限

---

### 模式 2：Nezha + pi (Groq 免费层)

```
┌─────────────────────────────────────┐
│  Nezha (Trae 编排)                  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  pi (Groq 执行)                     │
│  - 模型: llama-3.1-8b-instant       │
│  - 免费: 30 req/min                 │
└─────────────────────────────────────┘
```

**配置**：
```bash
# 获取 Groq API Key: https://console.groq.com/keys

cat > ~/.pi/agent/models.json << 'EOF'
{
  "providers": {
    "groq": {
      "apiKey": "gsk_xxxx",
      "models": [
        { "id": "llama-3.1-8b-instant" }
      ]
    }
  }
}
EOF
```

**优点**：免费、速度快（GPU 服务器）、模型能力强
**缺点**：有速率限制、需要 API key

---

### 模式 3：Nezha + pi (Together AI 免费试用)

```
┌─────────────────────────────────────┐
│  Nezha (Trae 编排)                  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  pi (Together AI 执行)              │
│  - 模型: meta-llama-3.1-8B          │
│  - 免费: $5 试用额度                │
└─────────────────────────────────────┘
```

**配置**：
```bash
# 获取 Together AI Key: https://api.together.xyz/

cat > ~/.pi/agent/models.json << 'EOF'
{
  "providers": {
    "together": {
      "baseUrl": "https://api.together.xyz/v1",
      "apiKey": "your-key",
      "models": [
        { "id": "meta-llama/Llama-3.1-8B-Instruct-Turbo" }
      ]
    }
  }
}
EOF
```

**优点**：模型选择多、有免费额度
**缺点**：试用额度有限

---

### 模式 4：Nezha 调用 pi (最简集成) ⭐⭐⭐⭐⭐

**核心思路**：pi 只是 Nezha 的一个执行工具，不改变现有架构

```
┌─────────────────────────────────────┐
│  Nezha                              │
│  - 任务管理 (Trae 模型)             │
│  - PDCA 循环                        │
│  - 知识沉淀                          │
│  - commit 质量控制                   │
└─────────────────────────────────────┘
              ↓ exec()
┌─────────────────────────────────────┐
│  pi execute "task description"      │
│  - 用 Trae API 执行                 │
│  - 动态工具、会话持续               │
└─────────────────────────────────────┘
```

**实现**：
```typescript
// src/execution/PiExecutor.ts
class PiExecutor {
  async execute(task: Task): Promise<TaskResult> {
    // pi 用 Trae API 执行任务
    const result = await execAsync(
      `pi execute --model trae --prompt "${task.description}"`,
      { cwd: '/path/to/pi-mono' }
    );
    return this.parseResult(result.stdout);
  }
}
```

**优点**：不改变现有架构、实现最简单
**缺点**：增加了依赖

---

### 模式 5：Nezha 移植 pi 机制（不依赖 pi）

**核心思路**：把 pi 的 `registerTool()`、`tool_call` hook 机制移植到 Nezha

```
┌─────────────────────────────────────┐
│  Nezha (增强版)                     │
│  ┌────────────────────────────────┐ │
│  │ + registerTool()              │ │
│  │ + tool_call hook              │ │
│  │ + Dynamic Tool Registration   │ │
│  │ + Session Lifecycle           │ │
│  └────────────────────────────────┘ │
│  - 使用 Trae / Ollama / Groq       │
└─────────────────────────────────────┘
```

**实现工作量**：
- 移植 pi 的 extension 系统 (~2000 行)
- 实现动态工具注册 (~500 行)
- 实现 tool_call hook 机制 (~300 行)

**优点**：独立运行、不依赖 pi
**缺点**：工程量大

---

### 模式 6：Nezha + pi 完全融合

**核心思路**：重写 Nezha 执行层，全面采用 pi 架构

```
┌─────────────────────────────────────────────┐
│           Unified System                      │
│  ┌───────────────────────────────────────┐  │
│  │  Nezha Core                           │  │
│  │  - Task/Issue/InterReview             │  │
│  │  - PDCA Cycles                        │  │
│  │  - Memory & Knowledge                 │  │
│  └───────────────────────────────────────┘  │
│                      +                       │
│  ┌───────────────────────────────────────┐  │
│  │  pi Execution Engine                 │  │
│  │  - Agent Loop                        │  │
│  │  - Dynamic Tools                     │  │
│  │  - Extension System                  │  │
│  └───────────────────────────────────────┘  │
│  - 共享模型层 (Trae/Ollama/Groq)            │
└─────────────────────────────────────────────┘
```

**优点**：最强系统、灵活扩展
**缺点**：架构调整大、长期项目

---

## 推荐路径

### 短期（立即可做）
1. **模式 4**：最简集成，Nezha 调用 pi，pi 用 Trae 执行
2. **模式 2**：配置 Groq 免费层，体验更强模型

### 中期（1-2周）
3. **模式 1**：下载 Ollama 小模型，完全本地化
4. **模式 1+2**：同时支持 Ollama 和 Groq，按需切换

### 长期（可选）
5. **模式 5**：移植 pi 机制，摆脱外部依赖
6. **模式 6**：完全融合，构建超级系统

---

## 测试计划：验证 pi 持续执行能力

### 测试目标

验证 pi 是否能：
1. **持续执行**：不放弃，直到任务完成
2. **动态工具**：遇到困难时，自己创建/注册工具来解决
3. **自主修复**：遇到错误时，主动分析并修复

### 测试用例

#### Test 1：多步骤任务

```bash
pi execute --model trae --prompt "
1. 在 /tmp/test-pi 目录创建一个简单的计算器
2. 实现加、减、乘、除四个函数
3. 编写单元测试
4. 确保所有测试通过
"
```

**预期结果**：
- pi 应该持续执行直到所有步骤完成
- 不应该在中途放弃

#### Test 2：自主修复能力

```bash
# 1. 先创建一个有错误的文件
echo 'function add(a: number, b: number): number { return a + b }' > /tmp/buggy.ts

# 2. 故意引入一个编译错误
echo 'function add(a: number, b: number): number { return a + c }' > /tmp/buggy.ts

# 3. 让 pi 去修复
pi execute --model trae --prompt "
修复 /tmp/buggy.ts 中的编译错误
"
```

**预期结果**：
- pi 应该能发现 `c` 未定义
- pi 应该修复为 `b`
- 验证修复后的代码可以编译

#### Test 3：动态工具创建（高级测试）

```bash
pi execute --model trae --prompt "
需要处理一个 JSON 配置文件，但没有现成的 JSON 解析工具。
请创建一个专门的 parseJsonConfig 工具来处理这个任务。
"
```

**预期结果**：
- pi 应该分析出需要什么工具
- pi 应该创建/注册新工具
- pi 应该使用新工具完成任务

### 测试记录模板

```markdown
## Test Run: YYYY-MM-DD

### 环境
- pi 版本: x.x.x
- 模型: trae / ollama:xxx / groq:xxx
- OS: macOS / Linux

### Test 1: [名称]
- **任务**: ...
- **预期**: ...
- **实际**: ...
- **结果**: ✅ 通过 / ❌ 失败
- **观察**: ...

### Test 2: [名称]
...

### 关键发现
1. ...
2. ...
3. ...
```

---

## 已知限制与风险

### Ollama 小模型限制

| 限制 | 说明 | 影响 |
|------|------|------|
| 上下文窗口 | 通常 4K-32K | 长任务可能截断 |
| 推理能力 | 不如 GPT-4/Claude | 复杂问题可能出错 |
| 代码能力 | 取决于训练数据 | 部分语言/框架不熟 |

### Groq 免费层限制

| 限制 | 说明 | 影响 |
|------|------|------|
| 速率限制 | 30 req/min | 并发任务受限 |
| 可用模型 | 有限 | 某些模型不可用 |

---

## Document Version History

| Date | Update |
|------|--------|
| 2026-03-26 | Initial draft - basic structure |
| 2026-03-26 | Added subagent chain, permission gate, protected paths patterns |
| 2026-03-26 | Added tool execution modes (sequential/parallel) and agent event system |
| 2026-03-26 | Added Dynamic Tool Registration section and Nezha vs pi-mono comparison |
| 2026-03-26 | Deep analysis: How pi-mono achieves "execute until completion" |
| 2026-03-26 | Added integration options and implementation roadmap |
| 2026-03-26 | Added Ollama integration - breaking the model cost barrier |
| 2026-03-26 | Added all 6 integration patterns with model options (Ollama/Groq/Together/Trae) |
| 2026-03-26 | Added test plan for verifying pi's persistent execution capability |

### Phase 1: 轻量级集成（推荐起步）

直接通过命令行调用 pi 执行任务：

```typescript
// src/execution/PiExecutor.ts

class PiExecutor {
  constructor(private ollamaModel: string = "qwen2.5-coder:7b") {}

  async execute(task: Task): Promise<TaskResult> {
    // 生成临时 prompt 文件
    const promptFile = `/tmp/nezha-task-${task.id}.txt`;
    await writeFile(promptFile, task.description);

    // 调用 pi CLI
    const result = await execAsync(
      `pi --model ${this.ollamaModel} --prompt-file ${promptFile}`,
      { cwd: '/path/to/pi-mono' }
    );

    // 解析结果
    return this.parseResult(result.stdout);
  }
}
```

### Phase 2: 深度集成

实现 Nezha-Pi 桥接层，支持：
- 实时状态同步
- 动态工具共享
- 多任务并发

```typescript
// src/bridge/NezhaPiBridge.ts

interface NezhaPiBridge {
  // 任务委派
  delegateTask(task: Task): Promise<TaskHandle>;

  // 状态订阅
  onTaskProgress(handle: TaskHandle, callback: (progress: Progress) => void): void;

  // 结果获取
  awaitTaskCompletion(handle: TaskHandle): Promise<TaskResult>;

  // 工具共享
  registerTool(tool: ToolDefinition): void;
  onToolCall(callback: (event: ToolCallEvent) => void): void;
}
```

### Phase 3: 完整融合

将 pi 的 extension 机制移植到 Nezha：
- 实现 `nezha.registerTool()`
- 实现 `nezha.on("tool_call", ...)`
- 实现动态工具创建

---

## 关键差异对比

| 方面 | pi-mono + Ollama | Nezha | 差异说明 |
|------|------------------|-------|----------|
| **模型成本** | 免费（本地） | API 费用 | Ollama 完全免费 |
| **隐私** | 完全本地 | 数据外传 | Ollama 无隐私问题 |
| **工具创建** | 运行时动态注册 | 静态预设 | pi 可自我进化 |
| **任务完成** | 会话持续直到完成 | 单次调用 | pi 更可靠 |
| **协调能力** | 无 | PDCA + 多Agent | Nezha 更适合协作 |
| **知识沉淀** | 无 | Memory 系统 | Nezha 有持久化 |

### Ollama 优势

1. **零成本**：无需 API 费用
2. **隐私保护**：数据不离开本地
3. **自定义模型**：可微调专属模型
4. **离线可用**：无需网络

### Ollama 限制

1. **性能**：不如 GPT-4 等顶级模型
2. **硬件需求**：需要足够显存
3. **上下文窗口**：通常较小（32K-128K）

---

## Action Items

- [ ] Implement dirty-repo-guard pattern in Nezha
- [ ] Improve commit message auto-generation
- [ ] Add NUL delimiter handling to hook
- [ ] Consider global hook registry pattern
- [ ] Add session lifecycle hooks
- [ ] Add protected-paths protection
- [ ] Add permission-gate for dangerous commands
- [ ] Consider vector memory search
- [x] Analyze pi-mono dynamic tool creation mechanism
- [x] Verify Ollama support in pi-mono
- [ ] Design Nezha-Pi bridge layer
- [ ] Implement Phase 1: Lightweight pi integration with Ollama
- [ ] Implement Phase 2: Deep bridge integration
- [ ] Implement Phase 3: Full extension system移植

---

## Document Version History

| Date | Update |
|------|--------|
| 2026-03-26 | Initial draft - basic structure |
| 2026-03-26 | Added subagent chain, permission gate, protected paths patterns |
| 2026-03-26 | Added tool execution modes (sequential/parallel) and agent event system |
| 2026-03-26 | Added Dynamic Tool Registration section and Nezha vs pi-mono comparison |
| 2026-03-26 | Deep analysis: How pi-mono achieves "execute until completion" |
| 2026-03-26 | Added integration options and implementation roadmap |
| 2026-03-26 | Added Ollama integration - breaking the model cost barrier |
| 2026-03-26 | Added all 6 integration patterns with model options (Ollama/Groq/Together/Trae) |
| 2026-03-26 | Added test plan for verifying pi's persistent execution capability |
