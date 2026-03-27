import { DatabaseClient } from '../src/db/DatabaseClient.js';
import { Config } from '../src/config/Config.js';

const skillContent = {
  instructions: `## System Prompt Push Skill

### Overview
Push system prompts to any AI through NUPI REST API. This enables AI-to-AI communication without relying on terminal or manual input.

### Core Endpoint
POST http://localhost:4099/prompt

### Request Format
{
  "system_prompt": "You are a helpful AI assistant.",
  "task": "Your task description here",
  "model": "zai:glm-4.5-flash",
  "timeout_ms": 600000
}

### Response Format
{
  "success": true,
  "output": "AI response text",
  "message": "Task completed successfully with system prompt",
  "durationMs": 3012
}

### Technical Implementation
Uses Pi Node.js SDK (no terminal dependency):
- createAgentSession from @mariozechner/pi-coding-agent
- DefaultResourceLoader with systemPromptOverride
- SessionManager.inMemory()

### Use Cases

1. AI-to-AI Collaboration
   - One AI pushes a prompt to another AI
   - Task delegation and coordination
   - Knowledge sharing between AIs

2. Automated Workflows
   - Scheduled prompt pushes
   - Webhook-triggered prompts
   - Event-driven AI actions

3. System Prompt Management
   - Update AI behavior dynamically
   - Push context-specific instructions
   - Coordinate multi-AI tasks

### Examples

Example 1: Simple Prompt
curl -X POST http://localhost:4099/prompt -H "Content-Type: application/json" -d '{"system_prompt": "你是代码审查专家", "task": "审查代码", "timeout_ms": 30000}'

Example 2: Programmatic Use
async function pushPrompt(systemPrompt, task) {
  const response = await fetch("http://localhost:4099/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_prompt: systemPrompt, task: task })
  });
  return response.json();
}

### Best Practices

1. Clear System Prompts
   - Be specific about AI role
   - Include constraints and guidelines

2. Appropriate Timeouts
   - Simple tasks: 30s-60s
   - Complex tasks: 120s-300s

3. Error Handling
   - Check success field
   - Handle timeouts gracefully

### Integration with Nezha

This skill enables the "external push" part of the internal+external training approach:
- Internal Training: Skills + Memory → Long-term AI capability
- External Push: REST API → Immediate AI guidance
- Combined: Both approaches work together`,
  useCases: ["AI-to-AI communication", "system prompt management", "automated workflows"]
};

async function createSkill() {
  const config = Config.getInstance();
  const db = new DatabaseClient(config);

  const id = 'a1000000-0000-0000-0000-000000000010';

  await db.query(
    `INSERT INTO skills (
      id, name, description, version, category, tags, source, author,
      content, builder, maintainer, build_metadata, generation_prompt,
      safety_score, scan_status, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO UPDATE SET
      updated_at = NOW(),
      content = EXCLUDED.content,
      description = EXCLUDED.description`,
    [
      id,
      'system-prompt-push',
      'NUPI System Prompt Push - AI-to-AI communication through REST API.',
      '1.0.0',
      'integration',
      ['nupi', 'prompt-push', 'ai-to-ai', 'rest-api'],
      'ai-built',
      'Nezha',
      JSON.stringify(skillContent),
      'nezha-ai',
      'nezha-ai',
      JSON.stringify({ builtAt: new Date().toISOString(), builtBy: 'nezha-ai' }),
      'Created from NUPI REST API development',
      100,
      'reviewed',
      'approved'
    ]
  );

  console.log('✅ Skill created successfully:', id);
}

createSkill().catch(console.error);
