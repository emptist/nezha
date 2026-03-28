# AI Collaboration Tutorial - Step by Step

> **Goal**: Learn how to spawn multiple AI agents and coordinate their work.

---

## Lesson 1: Hello World - Single Agent

```typescript
import { task } from 'your-agent-tool';

async function lesson1() {
  console.log('Starting single agent...');

  const result = await task({
    description: 'First agent',
    prompt: "Print 'Hello from AI Agent!' and return",
    subagent_type: 'general',
  });

  console.log('Result:', result);
  // Expected: "Hello from AI Agent!"
}
```

**Try it:**

```bash
node examples/lesson1.js
```

---

## Lesson 2: Parallel Agents

```typescript
import { task } from 'your-agent-tool';

async function lesson2() {
  console.log('Starting 3 agents in parallel...');

  const [agent1, agent2, agent3] = await Promise.all([
    task({
      description: 'Agent 1',
      prompt: "Return 'Result from Agent 1'",
      subagent_type: 'general',
    }),
    task({
      description: 'Agent 2',
      prompt: "Return 'Result from Agent 2'",
      subagent_type: 'general',
    }),
    task({
      description: 'Agent 3',
      prompt: "Return 'Result from Agent 3'",
      subagent_type: 'general',
    }),
  ]);

  console.log(agent1, agent2, agent3);
  // Expected: "Result from Agent 1" "Result from Agent 2" "Result from Agent 3"
}
```

**Try it:**

```bash
node examples/lesson2.js
```

---

## Lesson 3: Sequential Handoff

```typescript
import { task } from 'your-agent-tool';

async function lesson3() {
  // Agent 1: Research
  const research = await task({
    description: 'Research',
    prompt: 'Research the best JavaScript testing framework in 2024. Return name and reason.',
    subagent_type: 'general',
  });
  console.log('Research:', research);

  // Agent 2: Implement based on research
  const implementation = await task({
    description: 'Implement',
    prompt: `Create a test file using the framework: ${research}
Write 3 example tests.`,
    subagent_type: 'general',
  });
  console.log('Implementation:', implementation);

  return { research, implementation };
}
```

---

## Lesson 4: Review Loop

```typescript
import { task } from 'your-agent-tool';

async function lesson4() {
  // Step 1: Implement
  const code = await task({
    description: 'Implement',
    prompt: 'Write a function that calculates fibonacci. Save to /tmp/fib.js',
    subagent_type: 'general',
  });

  // Step 2: Review
  const review = await task({
    description: 'Review',
    prompt: 'Review /tmp/fib.js for bugs. Return list of issues found.',
    subagent_type: 'general',
  });
  console.log('Review:', review);

  // Step 3: Fix if needed
  if (review.includes('bug')) {
    const fix = await task({
      description: 'Fix',
      prompt: `Fix these bugs in /tmp/fib.js: ${review}`,
      subagent_type: 'general',
    });
    console.log('Fix applied');
  }
}
```

---

## Lesson 5: Divide and Conquer

```typescript
import { task } from 'your-agent-tool';

async function lesson5() {
  // Step 1: Plan
  const plan = await task({
    description: 'Plan',
    prompt: `Create a todo list for building a calculator app.
Return as JSON array: [{"task": "name", "description": "what to do"}]
Include these tasks:
- UI component
- Calculator logic
- State management
- Tests
- Documentation`,
    subagent_type: 'explore',
  });

  const tasks = JSON.parse(plan);

  // Step 2: Execute in parallel
  const results = await Promise.all(
    tasks.map(t =>
      task({
        description: t.task,
        prompt: t.description,
        subagent_type: 'general',
      })
    )
  );

  // Step 3: Integrate
  const integration = await task({
    description: 'Integrate',
    prompt: `Combine these parts into a working calculator:
${results.join('\n\n')}`,
    subagent_type: 'general',
  });

  return integration;
}
```

---

## Lesson 6: Continuous Improvement

```typescript
import { task } from 'your-agent-tool';
import { readdir, writeFile } from 'fs/promises';

async function lesson6() {
  const maxIterations = 5;

  for (let i = 0; i < maxIterations; i++) {
    console.log(`\n=== Iteration ${i + 1} ===`);

    // Find improvement
    const improvement = await task({
      description: 'Find improvement',
      prompt: `Analyze this codebase and find ONE small improvement.
Focus on:
- Bug fixes
- Performance gains
- Code clarity
Return: What to change and why.

If no improvements needed, return "DONE"`,
      subagent_type: 'explore',
    });

    if (improvement === 'DONE') {
      console.log('No more improvements found!');
      break;
    }

    console.log('Improvement found:', improvement);

    // Implement
    const implementation = await task({
      description: 'Implement',
      prompt: `Implement this improvement: ${improvement}
After implementing, run: npm test`,
      subagent_type: 'general',
    });

    // Verify
    if (implementation.includes('FAIL')) {
      console.log('Implementation failed, trying again...');
      await task({
        description: 'Fix',
        prompt: `The previous implementation failed tests. Fix it: ${implementation}`,
        subagent_type: 'general',
      });
    } else {
      console.log('Improvement successful!');
    }
  }
}
```

---

## Lesson 7: Error Handling

```typescript
import { task } from 'your-agent-tool';

async function withRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}`);
      const result = await task({
        description: 'Task',
        prompt,
        subagent_type: 'general',
      });
      return result;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`Failed, retrying in 1 second...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Usage
try {
  const result = await withRetry('Do something risky');
  console.log('Success:', result);
} catch (error) {
  console.log('All retries failed:', error);
}
```

---

## Lesson 8: Multiple Reviewers

```typescript
import { task } from 'your-agent-tool';

async function comprehensiveReview(code) {
  // Run multiple reviews in parallel
  const [styleReview, securityReview, perfReview] = await Promise.all([
    task({
      description: 'Style review',
      prompt: `Review for code style and readability: ${code}`,
      subagent_type: 'general',
    }),
    task({
      description: 'Security review',
      prompt: `Review for security issues: ${code}`,
      subagent_type: 'general',
    }),
    task({
      description: 'Performance review',
      prompt: `Review for performance issues: ${code}`,
      subagent_type: 'general',
    }),
  ]);

  // Aggregate findings
  const issues = [
    ...parseIssues(styleReview),
    ...parseIssues(securityReview),
    ...parseIssues(perfReview),
  ];

  if (issues.length === 0) {
    return { status: 'APPROVED', issues: [] };
  }

  // Fix all issues
  await task({
    description: 'Fix issues',
    prompt: `Fix these issues:\n${issues.join('\n')}`,
    subagent_type: 'general',
  });

  return { status: 'FIXED', issues };
}

function parseIssues(review) {
  // Extract issue lines starting with "- "
  return review
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.trim().substring(2));
}
```

---

## Practice Exercises

### Exercise 1: Bug Fix Pipeline

Create a pipeline that:

1. Finds bugs in code
2. Reproduces them
3. Fixes them
4. Verifies the fix

```typescript
// Your implementation here
async function bugFixPipeline(buggyCode) {
  // Step 1: Find bugs
  // Step 2: Reproduce
  // Step 3: Fix
  // Step 4: Verify
}
```

### Exercise 2: Feature Development

Create a pipeline that:

1. Designs a feature
2. Implements it
3. Tests it
4. Documents it
5. Reviews it

```typescript
// Your implementation here
async function featurePipeline(featureRequest) {
  // Your pipeline here
}
```

### Exercise 3: Code Review System

Create a system that:

1. Runs multiple reviewers in parallel
2. Aggregates findings
3. Tracks issues over time
4. Reports statistics

```typescript
// Your implementation here
class CodeReviewSystem {
  async review(code) {
    /* ... */
  }
  getStats() {
    /* ... */
  }
}
```

---

## Solutions

### Exercise 1 Solution

```typescript
async function bugFixPipeline(buggyCode) {
  // Step 1: Find bugs
  const bugs = await task({
    description: 'Find bugs',
    prompt: `Analyze this code and list bugs: ${buggyCode}`,
    subagent_type: 'general',
  });

  // Step 2: Reproduce
  const reproduction = await task({
    description: 'Reproduce',
    prompt: `Write a test that reproduces these bugs: ${bugs}`,
    subagent_type: 'general',
  });

  // Step 3: Fix
  const fixed = await task({
    description: 'Fix',
    prompt: `Fix the bugs in this code: ${buggyCode}
Bug list: ${bugs}`,
    subagent_type: 'general',
  });

  // Step 4: Verify
  const verified = await task({
    description: 'Verify',
    prompt: `Run tests on fixed code and verify: ${fixed}`,
    subagent_type: 'general',
  });

  return verified.includes('PASS') ? fixed : null;
}
```

---

## Next Steps

1. Read [AI_COLLABORATION_GUIDE.md](./AI_COLLABORATION_GUIDE.md) for advanced patterns
2. Explore `/examples/` directory for runnable code
3. Try implementing your own collaboration pipeline
4. Join the discussion: create an issue with your patterns

---

**Questions?** Create an issue at https://github.com/anomalyco/nezha/issues
