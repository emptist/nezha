---
name: local-model-integration
description: Use nezha CLI + local models together with structured context pattern
trigger: local, model, ollama, offline
---

# Local Model Integration

Use nezha CLI to get structured context, then route to local models for reasoning. Works offline.

## Concept

1. **Get context from nezha** - tasks, issues, learnings as JSON
2. **Route to appropriate model** - based on task type
3. **Inject JSON context** - weak AI succeeds with structured data
4. **Parse JSON output** - extract results

## Available Local Models

| Model | Size | Best For |
|-------|------|----------|
| llama3.2:3b | 2GB | Fast reasoning, quick questions |
| qwen2.5-coder:7b | 4.7GB | Code generation, technical tasks |
| mistral:7b | 4.4GB | Balanced performance |

## Workflow

### 1. Get Context from Nezha

```bash
# Full context (tasks, issues, learnings)
nezha context --json > /tmp/nezha_context.json

# Just tasks
nezha tasks next --json > /tmp/nezha_tasks.json

# Skills suggestions
nezha skill suggest --json > /tmp/nezha_skills.json
```

### 2. Route to Appropriate Model

- **Code tasks** → qwen2.5-coder:7b
- **General reasoning** → llama3.2:3b
- **Creative/complex** → mistral:7b

### 3. Invoke with Context

```bash
# Bad - weak AI fails
ollama run llama3.2:3b "Run nezha context --json and tell me what to do"

# Good - weak AI succeeds
ollama run llama3.2:3b "Based on this context: $(cat /tmp/nezha_context.json) - what should I do next?"
```

### 4. Structured Output (JSON Mode)

```bash
# Force JSON output for parsing
ollama run qwen2.5-coder:7b "Output only valid JSON: {\"task\": \"review\", \"priority\": 5}"
```

## End-to-End Example

```bash
# Step 1: Get nezha context
nezha context --json > /tmp/ctx.json

# Step 2: Route to llama3.2:3b for quick reasoning
RESPONSE=$(ollama run llama3.2:3b "Context: $(cat /tmp/ctx.json). What is the highest priority task?")

# Step 3: Parse response
echo "$RESPONSE"
```

## Integration

When AI needs to:
- Check nezha tasks → use `nezha tasks next --json`
- Get skill suggestions → use `nezha skill suggest --json`
- Reason about data → inject JSON into local model
- Work offline → all tools are local (nezha + local model)

## Notes

- Network down? No problem — nezha and local models are fully local
- Weak models can't run commands reliably — give them JSON data instead
- Strong models can run commands and inject results into weak models

## Tags

#nezha #local-model #ollama #structured-context #offline-first
