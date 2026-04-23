# Structured Context Pattern

## Problem

Weak AI models (e.g., llama3.2:3b) fail when asked to run commands like `nezha context --json`:
- They make up files that don't exist
- They misinterpret command output
- They cannot reliably execute complex CLI commands

## Solution

Pre-generate structured JSON data and inject it directly into the AI's prompt. The AI reasons about provided data instead of running commands.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   nezha     │────>│   JSON       │────>│   Pi/Prompt │────>│   Weak AI    │
│   (DB)      │     │   context   │     │   inject    │     │   (reason)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

## Implementation

### 1. nezha generates JSON

```bash
nezha context --json
```

Returns structured data:
```json
{
  "timestamp": "2026-04-23T...",
  "summary": {
    "pendingTasks": 5,
    "highPriorityTasks": 3,
    "openIssues": 5,
    "criticalIssues": 5
  },
  "nextTasks": [...],
  "criticalIssues": [...],
  "recentLearnings": [...]
}
```

### 2. NuPI integrates

**db.ts:**
```typescript
export async function getNezhaContext(): Promise<string | null> {
  try {
    const { execSync } = await import("child_process");
    const output = execSync("nezha context --json", {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
    return output;
  } catch (e) {
    console.error(`[NuPI] Failed to get nezha context:`, e);
    return null;
  }
}
```

**extension.ts - resources_discover:**
```typescript
pi.on("resources_discover", async () => {
  // ... existing skill/doc generation ...
  
  // Add structured context as JSON resource
  const contextJson = await getNezhaContext();
  if (contextJson) {
    const contextPath = "/tmp/nupi-context.json";
    writeFileSync(contextPath, contextJson);
    skillPaths.push(contextPath);
  }
  
  return { skillPaths };
});
```

**extension.ts - before_agent_start:**
```typescript
pi.on("before_agent_start", async (_event: BeforeAgentStartEvent) => {
  let systemPrompt = await buildNezhaPrompt();
  
  // Inject structured nezha context into prompt
  const contextJson = await getNezhaContext();
  if (contextJson) {
    const contextSection = `
## Current Context from Nezha
\`\`\`json
${contextJson}
\`\`\`
`;
    systemPrompt += contextSection;
  }
  
  return { systemPrompt };
});
```

## Test Results

| Approach | Result |
|----------|--------|
| Ask AI to run `nezha context --json` | ❌ Made up files |
| Provide JSON context directly | ✅ **Correct reasoning** |

## Applicable Scenarios

- **Session start**: Inject current tasks, issues, learnings
- **Task assignment**: Provide specific task context
- **Meeting context**: Inject meeting summaries
- **Skill suggestions**: Provide relevant skills as JSON

## Quick Reference

### JSON Commands
```bash
nezha context --json           # Full context with agentId
nezha tasks next --json        # Top 3 tasks
nezha skill suggest --json     # All skills
```

### Node.js for Other Formats
```bash
# JSON
node -e "console.log(JSON.stringify({a:1}, null, 2))"

# CSV
node -e "console.log('name,age\\nAlice,30\\nBob,25')"

# Table
node -e "
const data = [['name','age'],['Alice',30],['Bob',25]];
const w = data[0].map((_,i)=>Math.max(...data.map(r=>r[i].length)));
data.forEach(r=>console.log(r.map((c,i)=>c.padEnd(w[i])).join(' | ')));
"
```

### Shell Quoting Issue
CLI argument parsing breaks with complex text. Use Node.js directly for reliable output.

## Related Commands

- `nezha context --json` - Generate structured context
- `nezha skill suggest --context X --json` - Skill matching as JSON
- `nezha tasks next --json` - Top tasks as JSON
- `nezha meeting summary <id>` - Meeting participants

## Tags

#weak-ai-pattern #structured-context #nupi-integration #autonomous-ai

## Related Issues

- #e457e220: NuPI resources_discover should call nezha context --json
- #4b19e3a0: NuPI should use nezha context --json instead of Baby AI running commands