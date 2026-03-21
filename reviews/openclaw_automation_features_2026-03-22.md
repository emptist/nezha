# OpenClaw Automation Features Research

**Date:** 2026-03-22
**Source:** `/Users/jk/gits/hub/opencode`

## Executive Summary

OpenClaw has **3 main automation systems**: Plugin-based Hooks, Bus/Event system, and Session-based workflows. No dedicated "mail" or "convoy" systems exist - these are achieved through other mechanisms.

---

## 1. Hooks System

### Architecture

Plugin-based event-driven automation defined in `@opencode-ai/plugin`.

**Key Files:**

- `packages/plugin/src/index.ts` - Core Hooks interface
- `packages/opencode/src/plugin/index.ts` - Hook trigger engine

### Interface Definition

```typescript
export interface Hooks {
  event?: (input: { event: Event }) => Promise<void>;
  config?: (input: Config) => Promise<void>;
  tool?: { [key: string]: ToolDefinition };
  auth?: AuthHook;
  'chat.message'?: (input, output) => Promise<void>;
  'chat.params'?: (input, output) => Promise<void>;
  'chat.headers'?: (input, output) => Promise<void>;
  'permission.ask'?: (input, output) => Promise<void>;
  'command.execute.before'?: (input, output) => Promise<void>;
  'tool.execute.before'?: (input, output) => Promise<void>;
  'tool.execute.after'?: (input, output) => Promise<void>;
  'experimental.chat.messages.transform'?: (input, output) => Promise<void>;
  'experimental.chat.system.transform'?: (input, output) => Promise<void>;
  'experimental.session.compacting'?: (input, output) => Promise<void>;
  'experimental.text.complete'?: (input, output) => Promise<void>;
  'tool.definition'?: (input, output) => Promise<void>;
}
```

### Trigger Mechanism

```typescript
export async function trigger<
  Name extends Exclude<keyof Required<Hooks>, 'auth' | 'event' | 'tool'>,
>(name: Name, input: Input, output: Output): Promise<Output> {
  for (const hook of await state().then(x => x.hooks)) {
    const fn = hook[name];
    if (!fn) continue;
    await fn(input, output);
  }
  return output;
}
```

### Built-in Examples

- **Auth Hooks:** Codex, Copilot, GitLab auth integration
- **TUI Events:** Prompt append, command execution, toast notifications

---

## 2. Mail System (Inter-Agent Communication)

### OpenClaw has NO dedicated mail system. Instead, it uses:

### A. Session-Based Communication (Task Tool)

**File:** `packages/opencode/src/tool/task.ts`

```typescript
const TaskTool = Tool.define("task", async (ctx) => {
  const session = await Session.create({
    parentID: ctx.sessionID,
    title: params.description + ` (@${agent.name} subagent)`,
  })
  const result = await SessionPrompt.prompt({
    sessionID: session.id,
    model: {...},
    agent: agent.name,
    parts: promptParts,
  })
})
```

### B. Bus/Broadcast System

**File:** `packages/opencode/src/bus/index.ts`

```typescript
export const GlobalBus = new EventEmitter<{
  event: [{ directory?: string; payload: any }];
}>();

export namespace Bus {
  export async function publish(def, properties) {
    for (const sub of [...(state().subscriptions.get(key) ?? [])]) {
      pending.push(sub(payload));
    }
    GlobalBus.emit('event', { directory, payload });
  }

  export function subscribe(def, callback) {
    return raw(def.type, callback);
  }
}
```

### C. ACP (Agent Communication Protocol)

**File:** `packages/opencode/src/acp/agent.ts`

Handles external agent connections with event types:

- `permission.asked`
- `message.part.updated`
- `message.part.delta`

### D. Question System

**File:** `packages/opencode/src/question/service.ts`

```typescript
export const Question = {
  Event: {
    Asked: BusEvent.define("question.asked", Request),
    Replied: BusEvent.define("question.replied", {...}),
  }
}
```

---

## 3. Convoys (Workflow Chains)

### OpenClaw has NO dedicated convoy system. Instead, workflows use:

### A. Session-Based Task Chains

**File:** `packages/opencode/src/session/`

```typescript
const session = await Session.create({
  parentID: ctx.sessionID, // Links to parent session
  title: params.description,
});
```

### B. Plan Workflow

**File:** `packages/opencode/src/session/prompt.ts`

```typescript
export const PlanWorkflow = {
  // 1. Explore phase
  // 2. Plan phase
  // 3. Implement phase
};
```

### C. Skills System

**File:** `packages/opencode/src/skill/service.ts`

```typescript
export namespace Skill {
  export const Info = z.object({
    name: z.string(),
    description: z.string(),
    location: z.string(),
    content: z.string(), // Markdown workflow instructions
  });
}
```

### D. AsyncQueue for Parallel Processing

**File:** `packages/opencode/src/util/queue.ts`

```typescript
export async function work<T>(concurrency: number, items: T[], fn: (item: T) => Promise<void>) {
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const item = pending.pop();
        if (item === undefined) return;
        await fn(item);
      }
    })
  );
}
```

---

## Feature Comparison

| Feature        | OpenClaw Implementation             | Nezha Status          |
| -------------- | ----------------------------------- | --------------------- |
| **Hooks**      | Plugin system with 15+ event types  | Not implemented       |
| **Bus/Events** | Global event bus for cross-instance | Not implemented       |
| **Mail**       | Session + ACP protocol              | Task-based (database) |
| **Convoys**    | Session chains + Skills             | Not implemented       |

---

## Recommendations for Nezha

### High Priority

1. **Bus/Event System** - Essential for inter-agent coordination
   - Implement `GlobalBus` similar to OpenClaw
   - Support pub/sub for task events
   - Allow MCP subscriptions

2. **Hook System** - For extensibility
   - Define hook interface for task lifecycle events
   - Support `before/after` hooks for task execution
   - Allow custom tool registration

### Medium Priority

3. **Skill System** - Workflow templates
   - SKILL.md format with YAML frontmatter
   - Skill discovery from configured paths
   - Load and execute skill workflows

4. **ACP Protocol** - External agent communication
   - Connect to external OpenCode instances
   - Handle inter-agent permission requests
   - Forward prompts and responses

### Low Priority

5. **Parallel Execution** - AsyncQueue for batch tasks
   - Process multiple independent tasks concurrently
   - Configurable concurrency limits

---

## Key Insights

1. **Simplicity:** OpenClaw achieves complex automation through simple primitives (Sessions, Bus, Plugins)
2. **Extensibility:** Plugin system allows adding hooks and tools without core changes
3. **No Magic:** "Convoys" are just nested sessions with skill templates
4. **Event-Driven:** Bus system enables loose coupling between components

---

## Files Reference

| Feature   | Main File             | Supporting Files                       |
| --------- | --------------------- | -------------------------------------- |
| Hooks     | `plugin/index.ts`     | `plugin/codex.ts`, `plugin/copilot.ts` |
| Bus       | `bus/index.ts`        | `cli/cmd/tui/event.ts`                 |
| Tasks     | `tool/task.ts`        | `session/index.ts`                     |
| Skills    | `skill/service.ts`    | `skill/loader.ts`                      |
| ACP       | `acp/agent.ts`        | `acp/sdk.ts`                           |
| Questions | `question/service.ts` | -                                      |
