# AI Collaboration Guide - Nezha Multi-Agent System

> **Purpose**: Teach AI agents how to collaborate autonomously to improve the codebase without human intervention.

---

## Overview

This document describes how multiple AI agents can work together in parallel to:

- Implement features
- Review code
- Fix bugs
- Improve performance
- Write documentation

The key insight: **AI agents can spawn other AI agents** to work in parallel, creating a continuous improvement loop.

---

## Quick Start

### Basic Pattern - Spawning Agents

```typescript
// Import the task tool
import { task } from 'your-task-tool';

async function collaborate() {
  // Spawn multiple agents in parallel
  const results = await Promise.all([
    task({
      description: 'Fix bug in authentication',
      prompt: 'Find and fix the authentication bug in src/auth/',
      subagent_type: 'general',
    }),
    task({
      description: 'Add tests for auth',
      prompt: 'Add unit tests for src/auth/*.ts',
      subagent_type: 'general',
    }),
    task({
      description: 'Update auth docs',
      prompt: 'Update README.md with auth usage',
      subagent_type: 'general',
    }),
  ]);

  console.log('All agents completed!');
}
```

---

## Agent Types

### 1. `explore` - Fast Research Agent

Use for:

- Finding files
- Searching code
- Quick lookups

```typescript
task({
  description: 'Find auth files',
  prompt: 'Find all files in src/auth/ directory. Return file paths.',
  subagent_type: 'explore',
});
```

### 2. `general` - Full Implementation Agent

Use for:

- Writing code
- Implementing features
- Complex tasks

```typescript
task({
  description: 'Implement auth system',
  prompt: `Implement a complete authentication system:
1. Create src/auth/TokenService.ts
2. Implement JWT generation and validation
3. Add error handling
4. Write tests in src/tests/auth.test.ts

Follow existing code patterns in the codebase.`,
  subagent_type: 'general',
});
```

---

## Collaboration Patterns

### Pattern 1: Parallel Work with Aggregation

```typescript
// Spawn 4 agents to work on different parts simultaneously
const [frontend, backend, tests, docs] = await Promise.all([
  task({ description: 'Frontend', prompt: 'Implement UI in src/ui/', subagent_type: 'general' }),
  task({ description: 'Backend', prompt: 'Implement API in src/api/', subagent_type: 'general' }),
  task({ description: 'Tests', prompt: 'Write tests for src/api/', subagent_type: 'general' }),
  task({ description: 'Docs', prompt: 'Document src/api/', subagent_type: 'general' }),
]);

// Aggregate results
console.log(`Frontend: ${frontend}`);
console.log(`Backend: ${backend}`);
```

### Pattern 2: Pipeline - Sequential Handoff

```typescript
// First agent does research
const research = await task({
  description: 'Research auth options',
  prompt: 'Research authentication patterns. Return 3 recommended approaches with pros/cons.',
  subagent_type: 'explore',
});

// Pass research to implementation agent
const implementation = await task({
  description: 'Implement based on research',
  prompt: `Based on this research: ${research}

Implement the best approach from the research.`,
  subagent_type: 'general',
});

// Pass to review agent
const review = await task({
  description: 'Review implementation',
  prompt: `Review this implementation: ${implementation}
Check for bugs, security issues, and improvements.`,
  subagent_type: 'general',
});
```

### Pattern 3: Review Loop

```typescript
// Agent implements
const implementation = await task({
  description: 'Implement feature',
  prompt: 'Implement feature X in src/features/x.ts',
  subagent_type: 'general',
});

// Agent 1 reviews
const review1 = await task({
  description: 'First review',
  prompt: 'Review src/features/x.ts for bugs',
  subagent_type: 'general',
});

// Agent 2 reviews from different angle
const review2 = await task({
  description: 'Second review',
  prompt: 'Review src/features/x.ts for security issues',
  subagent_type: 'general',
});

// Agent fixes based on reviews
const fixes = await task({
  description: 'Fix issues',
  prompt: `Fix these issues in src/features/x.ts:
1. ${review1}
2. ${review2}`,
  subagent_type: 'general',
});
```

### Pattern 4: Divide and Conquer

```typescript
// One agent breaks down the work
const workPlan = await task({
  description: 'Plan work',
  prompt: 'Analyze this feature request and break it into 5 independent tasks',
  subagent_type: 'explore',
});

// Spawn agents for each task
const tasks = JSON.parse(workPlan); // Array of task descriptions
const results = await Promise.all(
  tasks.map(t =>
    task({
      description: t.name,
      prompt: t.description,
      subagent_type: 'general',
    })
  )
);

// Final integration agent
const integration = await task({
  description: 'Integrate parts',
  prompt: `Combine these implementations into a working feature:
${results.join('\n\n')}`,
  subagent_type: 'general',
});
```

### Pattern 5: Continuous Improvement Loop

```typescript
async function continuousImprovement() {
  while (true) {
    // Find next improvement
    const improvement = await task({
      description: 'Find improvement',
      prompt: 'Find one thing to improve in this codebase. Focus on high-impact, low-risk changes.',
      subagent_type: 'explore',
    });

    if (!improvement) break; // No more improvements found

    // Implement
    const implementation = await task({
      description: 'Implement improvement',
      prompt: `Implement this improvement: ${improvement}
Run tests after implementation.`,
      subagent_type: 'general',
    });

    // Verify
    const verified = await task({
      description: 'Verify improvement',
      prompt: `Verify this improvement works correctly: ${implementation}
Run: npm test`,
      subagent_type: 'general',
    });

    // Commit if good
    if (verified.includes('PASS')) {
      await git.commit(`improvement: ${improvement}`);
    }
  }
}
```

---

## Agent Communication

### Via Return Values

Agents communicate through return values:

```typescript
const agent1 = await task({
  prompt: 'Calculate X, return the result as JSON',
});

const agent2 = await task({
  prompt: `Use this data: ${agent1}
Do Y with it.`,
});
```

### Via Shared State

Agents can work on shared files:

```typescript
// Agent 1 writes plan
await task({
  prompt: 'Write implementation plan to IMPLEMENTATION_PLAN.md',
});

// Agent 2 reads and executes
await task({
  prompt: 'Read IMPLEMENTATION_PLAN.md and implement each item',
});
```

### Via Task Queue (Recommended)

Use database-backed task queue:

```typescript
// Add tasks to queue
await addTask({ title: 'Task 1', priority: 1 });
await addTask({ title: 'Task 2', priority: 2 });

// Multiple agents pick up tasks
const task1 = await task({
  prompt: 'Get next pending task from database and execute it',
  subagent_type: 'general',
});
```

---

## Best Practices

### DO ✅

1. **Give Clear, Specific Prompts**

   ```typescript
   // Bad
   prompt: "Fix the bug"

   // Good
   prompt: "Fix the race condition in src/database/ConnectionPool.ts line 42-45.
   The issue is that concurrent requests can get the same connection.
   Expected: Each request gets a unique connection."
   ```

2. **Specify File Paths Explicitly**

   ```typescript
   prompt: 'In file src/services/AuthService.ts, add method validateToken()';
   ```

3. **Define Success Criteria**

   ```typescript
   prompt: "Add tests that:
   - Cover all public methods
   - Mock external dependencies
   - Achieve 80% code coverage
   Run: npm test && npm run coverage"
   ```

4. **Chain Verification**

   ```typescript
   prompt: "After implementing, run:
   1. npm run build
   2. npm test
   3. npm run lint
   Report only failures."
   ```

5. **Use Parallel for Independent Tasks**

   ```typescript
   // Good - parallel
   await Promise.all([agent1, agent2, agent3]);

   // Bad - sequential when could be parallel
   await agent1;
   await agent2;
   await agent3;
   ```

### DON'T ❌

1. **Don't Be Vague**

   ```typescript
   // Bad
   prompt: 'Make it better';

   // Good
   prompt: 'Reduce memory usage by implementing object pooling';
   ```

2. **Don't Overload Single Agent**

   ```typescript
   // Bad - too much for one agent
   prompt: 'Rewrite the entire backend, add tests, deploy to production';

   // Good - break into parts
   const parts = ['Rewrite backend', 'Add tests', 'Prepare deployment'];
   ```

3. **Don't Skip Verification**

   ```typescript
   // Bad
   prompt: 'Implement feature X';

   // Good
   prompt: 'Implement feature X, then run: npm test && npm run build';
   ```

4. **Don't Ignore Failures**
   ```typescript
   // Always check results
   const result = await task({ prompt: 'Do X' });
   if (!result.success) {
     // Handle failure
     await task({ prompt: `Fix this error: ${result.error}` });
   }
   ```

---

## Error Handling

### Retry Pattern

```typescript
async function agentWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await task({ prompt });
      if (result.success) return result;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
    }
  }
}
```

### Fallback Pattern

```typescript
async function agentWithFallback(primary, fallback) {
  try {
    return await task({ prompt: primary });
  } catch {
    console.log('Primary agent failed, trying fallback...');
    return await task({ prompt: fallback });
  }
}
```

### Circuit Breaker Pattern

```typescript
class AgentCircuitBreaker {
  private failures = 0;
  private readonly threshold = 5;

  async execute(prompt) {
    if (this.failures >= this.threshold) {
      throw new Error('Circuit breaker open');
    }

    try {
      const result = await task({ prompt });
      this.failures = 0;
      return result;
    } catch (e) {
      this.failures++;
      throw e;
    }
  }
}
```

---

## Example: Complete Feature Implementation

```typescript
async function implementFeature(featureRequest) {
  // Phase 1: Research
  const research = await task({
    description: 'Research feature',
    prompt: `Research how to implement: ${featureRequest}
Consider existing patterns in codebase.
Return: 1) Design approach 2) Files to create/modify 3) Dependencies`,
    subagent_type: 'explore',
  });

  // Phase 2: Implement in parallel
  const [implementation, tests] = await Promise.all([
    task({
      description: 'Implement feature',
      prompt: `Implement feature based on this design: ${research}
Files: Create src/features/${featureRequest}/ and implement all components.
Run npm test after.`,
      subagent_type: 'general',
    }),
    task({
      description: 'Write tests',
      prompt: `Write tests for the new feature in src/features/${featureRequest}/
Coverage target: 80%
Run: npm test && npm run coverage`,
      subagent_type: 'general',
    }),
  ]);

  // Phase 3: Review
  const [codeReview, securityReview] = await Promise.all([
    task({
      description: 'Code review',
      prompt: `Review implementation for:
- Code quality
- Error handling
- Performance
- Edge cases
Files: src/features/${featureRequest}/*`,
      subagent_type: 'general',
    }),
    task({
      description: 'Security review',
      prompt: `Review for security issues:
- Input validation
- Authentication/Authorization
- Data sanitization
Files: src/features/${featureRequest}/*`,
      subagent_type: 'general',
    }),
  ]);

  // Phase 4: Fix issues
  if (codeReview || securityReview) {
    await task({
      description: 'Fix review issues',
      prompt: `Fix these issues:
Code: ${codeReview}
Security: ${securityReview}`,
      subagent_type: 'general',
    });
  }

  // Phase 5: Documentation
  await task({
    description: 'Write docs',
    prompt: `Document the new feature:
1. Usage examples
2. API reference
3. Configuration options
Save to docs/FEATURE_NAME.md`,
    subagent_type: 'general',
  });

  // Phase 6: Commit
  await git.commit(`feat: ${featureRequest}
- Implementation: src/features/${featureRequest}/
- Tests: src/tests/features/${featureRequest}/
- Docs: docs/FEATURE_NAME.md`);
}
```

---

## Task Definition Template

```typescript
task({
  description: "Short description",      // 3-5 words
  prompt: `
    ## Context
    ${background information}

    ## Goal
    ${what to achieve}

    ## Files
    - Modify: ${file paths}
    - Create: ${new files}
    - Tests: ${test files}

    ## Requirements
    1. ${requirement}
    2. ${requirement}

    ## Success Criteria
    - ${criterion}
    - ${criterion}

    ## Verification
    After completing, run: ${verification command}
  `,
  subagent_type: "general"  // or "explore"
})
```

---

## Anti-Patterns to Avoid

### 1. Agent Loop

```typescript
// BAD - Agents arguing forever
agent1: 'Fix what agent2 did';
agent2: 'Fix what agent1 said';
agent1: 'No, fix this...';
// Infinity loop!
```

**Solution**: Set max iterations, commit after each fix.

### 2. Task Overlap

```typescript
// BAD - Two agents modifying same file
agent1: 'Add feature X to utils.ts';
agent2: 'Refactor utils.ts';
```

**Solution**: Use work allocation agent first.

### 3. Lost in Scope

```typescript
// BAD - Agent keeps adding features
"Add feature X" → "While you're at it, add Y" → "Also do Z"
```

**Solution**: Clear scope, separate tasks for additions.

### 4. No Verification

```typescript
// BAD - Trust but don't verify
agent1: "I fixed it"
(No check if it actually works)
```

**Solution**: Always run tests/build after changes.

---

## Debugging Multi-Agent Issues

### Check Agent Logs

```bash
tail -100 .nezha.log
```

### Restart Agents

```bash
pkill -f "task agent"
# Then re-spawn
```

### Reset State

```bash
# Clear agent state
rm -rf .tmp/agent-state.json
# Restart services
```

### Single Agent Debug

```typescript
// Disable parallel, run single agent
const result = await task({
  description: 'Debug this',
  prompt: 'Debug step by step. Report each finding.',
  subagent_type: 'general',
});
```

---

## Summary

Key principles for AI collaboration:

1. **Parallelize** independent work
2. **Chain** dependent work
3. **Verify** after each step
4. **Commit** working code
5. **Communicate** via return values or shared files
6. **Handle errors** with retries and fallbacks
7. **Set clear** success criteria
8. **Stay focused** on scope

---

**Template Repository**: https://github.com/anomalyco/nezha
**Questions**: Create an issue
