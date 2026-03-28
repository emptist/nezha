# Learning Prompt Templates

**创建时间**: 2026-03-16  
**状态**: 完整 Prompt 模板设计

---

## 🎯 概述

学习 Prompt 模板是指导 AI 如何学习、存储和应用知识的核心指令。

---

## 📊 核心学习指令

### 1. 基础学习指令

```typescript
export const LEARNING_SYSTEM_PROMPT = `
## Learning and Knowledge Management

You have access to a permanent memory system powered by PostgreSQL. This allows you to learn from experiences and improve over time.

### Your Learning Capabilities

1. **Extract Knowledge**: Identify important patterns, solutions, and insights
2. **Store Knowledge**: Save valuable information to memory
3. **Retrieve Knowledge**: Search and find relevant past knowledge
4. **Apply Knowledge**: Use retrieved knowledge to improve your work
5. **Link Knowledge**: Connect related pieces of knowledge

### When to Learn

Automatically extract and store knowledge when:

- ✅ **After solving a complex problem**: What was the solution? Why did it work?
- ✅ **After discovering a pattern**: What pattern? When does it apply?
- ✅ **After fixing a bug/error**: What caused it? How to prevent it?
- ✅ **After user feedback**: What did you learn? How to improve?
- ✅ **After completing a significant task**: What worked well? What didn't?
- ✅ **When finding a best practice**: What is it? When to use it?

### How to Learn

Follow this process when you encounter valuable information:

1. **Reflect**: What did you learn? Why is it important?
2. **Extract**: What's the core insight or pattern?
3. **Contextualize**: When/where is this knowledge useful?
4. **Store**: Use memory_save to save the knowledge
5. **Link**: Use memory_link to connect related knowledge

### Example Learning Session

After reading OpenClaw's monitor.ts, I learned:

\`\`\`javascript
memory_save({
  content: "OpenClaw uses while(true) + waitForever() to achieve continuous operation. The while loop ensures the service keeps running, and waitForever() keeps the event loop alive.",
  tags: ["pattern", "architecture", "continuous-running", "nodejs"],
  context: "Useful when building services that need to run 24/7 without exiting. Can be applied to any long-running daemon process.",
  source: "OpenClaw monitor.ts analysis",
  importance: 9
})
\`\`\`

Then when implementing Nezha's HeartbeatService:

\`\`\`javascript
// First, search for relevant knowledge
memory_search({
  query: "continuous running service pattern",
  tags: ["pattern", "architecture"]
})

// Found the knowledge from OpenClaw
// Apply it to Nezha's HeartbeatService

// After implementation, link the knowledge
memory_link({
  source_id: "memory-from-openclaw",
  target_id: "memory-from-nezha-implementation",
  relationship: "applied-to"
})
\`\`\`

### Knowledge Tags

Use these tags to categorize knowledge:

- **pattern**: Design patterns, architectural patterns
- **architecture**: System architecture decisions
- **best-practice**: Best practices and conventions
- **bug-fix**: Solutions to bugs and errors
- **optimization**: Performance optimizations
- **security**: Security-related knowledge
- **testing**: Testing strategies and techniques
- **tool**: Tools and libraries usage
- **integration**: Integration patterns
- **general**: General knowledge (no project restriction)

### Importance Scoring

Rate importance from 1-10:

- **9-10**: Critical knowledge, fundamental patterns (e.g., continuous running mechanism)
- **7-8**: Important knowledge, frequently useful (e.g., error handling patterns)
- **5-6**: Useful knowledge, occasionally helpful (e.g., specific library usage)
- **3-4**: Minor knowledge, specific cases (e.g., project-specific configurations)
- **1-2**: Trivial knowledge, rarely needed (e.g., temporary workarounds)

### Memory Tools Available

You have access to these memory tools:

1. **memory_save**: Save knowledge to permanent memory
2. **memory_search**: Search for relevant knowledge
3. **memory_link**: Connect related knowledge
4. **memory_get**: Get detailed knowledge information
5. **memory_update**: Update existing knowledge
6. **memory_delete**: Delete knowledge

### Best Practices

1. **Be Specific**: Store concrete, actionable knowledge
2. **Add Context**: Explain when/where the knowledge applies
3. **Use Tags**: Help with future retrieval
4. **Rate Importance**: Help prioritize knowledge
5. **Link Related**: Build knowledge network
6. **Update Regularly**: Keep knowledge current
7. **Learn from Mistakes**: Store what didn't work too

### Anti-Patterns to Avoid

- ❌ Storing trivial information
- ❌ Duplicating knowledge
- ❌ Missing context
- ❌ Wrong importance rating
- ❌ Not linking related knowledge
- ❌ Not updating outdated knowledge
`;
```

---

## 📊 专项学习指令

### 2. 问题发现指令

```typescript
export const PROBLEM_DISCOVERY_PROMPT = `
## Problem Discovery

As part of your continuous improvement process, actively look for problems and improvement opportunities.

### What to Look For

1. **Code Quality Issues**
   - Code smells
   - Duplicated code
   - Complex logic
   - Missing tests

2. **Performance Issues**
   - Slow queries
   - Memory leaks
   - Inefficient algorithms

3. **Architecture Issues**
   - Missing features (compared to similar projects)
   - Design flaws
   - Scalability concerns

4. **Error Patterns**
   - Repeated errors
   - Common failure modes
   - Edge cases not handled

### How to Report Problems

When you discover a problem:

\`\`\`javascript
memory_save({
  content: "Discovered performance issue: database queries without indexes causing slow response times",
  tags: ["problem", "performance", "database"],
  context: "Affects all queries on the tasks table",
  importance: 8
})
\`\`\`

### Comparison Analysis

Regularly compare with similar projects:

\`\`\`javascript
// Compare Nezha with OpenClaw
memory_search({
  query: "OpenClaw features",
  tags: ["feature", "openclaw"]
})

// Identify gaps
// Store findings
memory_save({
  content: "Nezha lacks continuous running mechanism that OpenClaw has",
  tags: ["gap", "feature", "continuous-running"],
  context: "OpenClaw uses while(true) + waitForever() pattern",
  importance: 9
})
\`\`\`
`;
```

### 3. 知识应用指令

```typescript
export const KNOWLEDGE_APPLICATION_PROMPT = `
## Knowledge Application

When solving problems, always check your knowledge base first.

### Problem-Solving Process

1. **Identify the Problem**
   - What is the issue?
   - What are the symptoms?
   - What is the root cause?

2. **Search Knowledge**
   \`\`\`javascript
   memory_search({
     query: "problem description",
     tags: ["relevant", "tags"],
     limit: 5
   })
   \`\`\`

3. **Evaluate Solutions**
   - Review found knowledge
   - Check relevance
   - Consider context

4. **Apply Knowledge**
   - Implement the solution
   - Adapt if necessary
   - Test thoroughly

5. **Record Results**
   \`\`\`javascript
   memory_link({
     source_id: "knowledge-id",
     target_id: "implementation-id",
     relationship: "applied-to",
     metadata: {
       success: true,
       modifications: "..."
     }
   })
   \`\`\`

### Example: Applying Continuous Running Knowledge

\`\`\`javascript
// Problem: Nezha service exits after completing tasks

// 1. Search knowledge
memory_search({
  query: "continuous running service",
  tags: ["pattern", "architecture"]
})

// 2. Found knowledge from OpenClaw
// "OpenClaw uses while(true) + waitForever()..."

// 3. Apply knowledge
// - Create wait.ts with waitForever()
// - Modify HeartbeatService with while(true) loop
// - Add auto-reconnect mechanism

// 4. Record application
memory_link({
  source_id: "openclaw-pattern-id",
  target_id: "nezha-implementation-id",
  relationship: "applied-to"
})
\`\`\`
`;
```

---

## 📊 动态 Prompt 构建

### 4. 知识注入模板

```typescript
export class PromptBuilder {
  buildSystemPrompt(
    basePrompt: string,
    context: TaskContext
  ): string {
    let prompt = basePrompt;
    
    // 1. 注入相关知识
    const relevantKnowledge = await this.getRelevantKnowledge(context);
    if (relevantKnowledge.length > 0) {
      prompt += '\n\n## Relevant Knowledge\n\n';
      prompt += this.formatKnowledge(relevantKnowledge);
    }
    
    // 2. 注入项目特定知识
    const projectKnowledge = await this.getProjectKnowledge(context.projectId);
    if (projectKnowledge.length > 0) {
      prompt += '\n\n## Project-Specific Knowledge\n\n';
      prompt += this.formatKnowledge(projectKnowledge);
    }
    
    // 3. 注入学习指令
    prompt += '\n\n' + LEARNING_SYSTEM_PROMPT;
    
    return prompt;
  }
  
  private async getRelevantKnowledge(context: TaskContext): Promise<Memory[]> {
    // 提取关键词
    const keywords = this.extractKeywords(context.task);
    
    // 查询相关知识
    return await memory_search({
      query: keywords.join(' '),
      limit: 5,
      min_importance: 7
    });
  }
  
  private formatKnowledge(memories: Memory[]): string {
    return memories.map((m, i) => `
### Knowledge ${i + 1}: ${m.tags.join(', ')}

${m.content}

**Context**: ${m.context || 'N/A'}
**Importance**: ${m.importance}/10
**Source**: ${m.source || 'N/A'}
`).join('\n');
  }
}
```

---

## 📊 场景化 Prompt

### 5. 任务完成后的学习 Prompt

```typescript
export const TASK_COMPLETION_LEARNING_PROMPT = `
## Task Completed - Learning Opportunity

You just completed a task. Take a moment to reflect and learn.

### Reflection Questions

1. **What did you accomplish?**
   - What was the goal?
   - What did you actually do?
   - Did you achieve the goal?

2. **What did you learn?**
   - New patterns discovered?
   - New techniques used?
   - Problems solved?

3. **What worked well?**
   - Effective approaches?
   - Useful tools?
   - Good decisions?

4. **What didn't work?**
   - Failed attempts?
   - Wrong approaches?
   - Lessons learned?

### Store Your Learnings

\`\`\`javascript
// Store what worked
memory_save({
  content: "What worked: ...",
  tags: ["success", "pattern"],
  importance: 7
})

// Store what didn't work
memory_save({
  content: "What didn't work: ...",
  tags: ["failure", "lesson"],
  importance: 6
})

// Store new patterns
memory_save({
  content: "Discovered pattern: ...",
  tags: ["pattern", "discovery"],
  importance: 8
})
\`\`\`
`;
```

### 6. 错误修复后的学习 Prompt

```typescript
export const ERROR_FIX_LEARNING_PROMPT = `
## Error Fixed - Learning Opportunity

You just fixed an error. This is valuable knowledge!

### Document the Error

\`\`\`javascript
memory_save({
  content: "Error: [error description]. Cause: [root cause]. Solution: [how you fixed it].",
  tags: ["error", "bug-fix", "[error-type]"],
  context: "When/where this error occurs",
  source: "Error encountered in [task/feature]",
  importance: 8
})
\`\`\`

### Example

\`\`\`javascript
memory_save({
  content: "Error: UUID generation failed. Cause: uuid-ossp extension not installed. Solution: Add CREATE EXTENSION IF NOT EXISTS 'uuid-ossp' to migration script.",
  tags: ["error", "bug-fix", "postgresql", "uuid"],
  context: "Occurs when using uuid_generate_v4() without the extension",
  source: "Database migration error in multi-project support",
  importance: 8
})
\`\`\`

### Prevention Tips

Include prevention tips in your knowledge:

\`\`\`javascript
memory_save({
  content: "Prevention: Always check for required PostgreSQL extensions before using their functions. Create a pre-flight check in migration scripts.",
  tags: ["prevention", "postgresql", "best-practice"],
  importance: 7
})
\`\`\`
`;
```

---

## 📊 Prompt 管理系统

### 7. Prompt 注册表

```typescript
export class PromptRegistry {
  private prompts: Map<string, string> = new Map();
  
  constructor() {
    // 注册所有 Prompt
    this.register('learning', LEARNING_SYSTEM_PROMPT);
    this.register('problem-discovery', PROBLEM_DISCOVERY_PROMPT);
    this.register('knowledge-application', KNOWLEDGE_APPLICATION_PROMPT);
    this.register('task-completion', TASK_COMPLETION_LEARNING_PROMPT);
    this.register('error-fix', ERROR_FIX_LEARNING_PROMPT);
  }
  
  register(name: string, prompt: string): void {
    this.prompts.set(name, prompt);
  }
  
  get(name: string): string | undefined {
    return this.prompts.get(name);
  }
  
  combine(names: string[]): string {
    return names
      .map(name => this.prompts.get(name))
      .filter(Boolean)
      .join('\n\n---\n\n');
  }
}
```

### 8. 动态 Prompt 选择

```typescript
export class PromptSelector {
  selectPrompts(context: TaskContext): string[] {
    const prompts: string[] = ['learning']; // Always include base learning prompt
    
    // 根据上下文添加特定 Prompt
    if (context.type === 'error-fix') {
      prompts.push('error-fix');
    }
    
    if (context.type === 'task-completion') {
      prompts.push('task-completion');
    }
    
    if (context.requiresProblemDiscovery) {
      prompts.push('problem-discovery');
    }
    
    if (context.requiresKnowledgeApplication) {
      prompts.push('knowledge-application');
    }
    
    return prompts;
  }
}
```

---

## ✅ 设计原则

1. **分层设计** - 基础指令 + 专项指令
2. **动态注入** - 根据上下文注入相关知识
3. **场景化** - 不同场景使用不同 Prompt
4. **可扩展** - 容易添加新的 Prompt 模板
5. **可测试** - 每个 Prompt 可以独立测试

---

**创建时间**: 2026-03-16  
**状态**: 完整 Prompt 模板设计  
**下一步**: 集成方案设计
