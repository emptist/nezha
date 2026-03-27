-- System Prompt Push Skill
-- Enables AI-to-AI communication through NUPI REST API

INSERT INTO skills (
    id,
    name,
    description,
    version,
    category,
    tags,
    source,
    author,
    content,
    builder,
    maintainer,
    build_metadata,
    generation_prompt
) VALUES (
    'a1000000-0000-0000-0000-000000000010',
    'system-prompt-push',
    'NUPI System Prompt Push - AI-to-AI communication through REST API. Push system prompts to any AI via Pi SDK, enabling cross-environment collaboration.',
    '1.0.0',
    'integration',
    ARRAY['nupi', 'prompt-push', 'ai-to-ai', 'rest-api', 'pi-sdk', 'collaboration'],
    'ai-built',
    'Nezha',
    '{"instructions": "## System Prompt Push Skill\n\n### Overview\nPush system prompts to any AI through NUPI REST API. This enables AI-to-AI communication without relying on terminal or manual input.\n\n### Core Endpoint\n```\nPOST http://localhost:4099/prompt\n```\n\n### Request Format\n```json\n{\n  \"system_prompt\": \"You are a helpful AI assistant.\",\n  \"task\": \"Your task description here\",\n  \"model\": \"zai:glm-4.5-flash\",\n  \"timeout_ms\": 600000\n}\n```\n\n### Response Format\n```json\n{\n  \"success\": true,\n  \"output\": \"AI response text\",\n  \"message\": \"Task completed successfully with system prompt\",\n  \"durationMs\": 3012\n}\n```\n\n### Technical Implementation\nUses Pi Node.js SDK (no terminal dependency):\n```typescript\nimport { createAgentSession, DefaultResourceLoader, SessionManager } from \"@mariozechner/pi-coding-agent\";\n\nconst loader = new DefaultResourceLoader({\n  systemPromptOverride: () => systemPrompt,\n  appendSystemPromptOverride: () => [],\n});\nawait loader.reload();\n\nconst { session } = await createAgentSession({\n  resourceLoader: loader,\n  sessionManager: SessionManager.inMemory(),\n});\n```\n\n### Use Cases\n\n#### 1. AI-to-AI Collaboration\n- One AI pushes a prompt to another AI\n- Task delegation and coordination\n- Knowledge sharing between AIs\n\n#### 2. Automated Workflows\n- Scheduled prompt pushes\n- Webhook-triggered prompts\n- Event-driven AI actions\n\n#### 3. System Prompt Management\n- Update AI behavior dynamically\n- Push context-specific instructions\n- Coordinate multi-AI tasks\n\n### Examples\n\n#### Example 1: Simple Prompt\n```bash\ncurl -X POST http://localhost:4099/prompt \\\n  -H \"Content-Type: application/json\" \\\n  -d \"{\n    \\\"system_prompt\\\": \\\"你是代码审查专家\\\",\n    \\\"task\\\": \\\"审查这段代码中的bug\\\",\n    \\\"timeout_ms\\\": 30000\n  }\"\n```\n\n#### Example 2: Complex Task\n```bash\ncurl -X POST http://localhost:4099/prompt \\\n  -H \"Content-Type: application/json\" \\\n  -d \"{\n    \\\"system_prompt\\\": \\\"You are an expert Python developer. Analyze code for performance issues and suggest optimizations.\\\",\n    \\\"task\\\": \\\"Review the following code and identify bottlenecks...\\\",\n    \\\"model\\\": \\\"zai:glm-4.5-flash\\\",\n    \\\"timeout_ms\\\": 120000\n  }\"\n```\n\n#### Example 3: Programmatic Use\n```typescript\nasync function pushPrompt(systemPrompt: string, task: string) {\n  const response = await fetch(\"http://localhost:4099/prompt\", {\n    method: \"POST\",\n    headers: { \"Content-Type\": \"application/json\" },\n    body: JSON.stringify({\n      system_prompt: systemPrompt,\n      task: task,\n      timeout_ms: 60000\n    })\n  });\n  const result = await response.json();\n  return result.output;\n}\n```\n\n### Best Practices\n\n1. **Clear System Prompts**\n   - Be specific about AI role\n   - Include constraints and guidelines\n   - Define expected output format\n\n2. **Appropriate Timeouts**\n   - Simple tasks: 30s-60s\n   - Complex tasks: 120s-300s\n   - Very complex: 600s+\n\n3. **Error Handling**\n   - Check `success` field\n   - Handle timeouts gracefully\n   - Parse `output` for results\n\n4. **Model Selection**\n   - Use fast models for simple tasks\n   - Use capable models for complex reasoning\n   - Consider cost vs. quality\n\n### Integration with Nezha\n\nThis skill enables the \"external push\" part of the internal+external training approach:\n- **Internal Training**: Skills + Memory → Long-term AI capability\n- **External Push**: REST API → Immediate AI guidance\n- **Combined**: Both approaches work together\n\n### Limitations\n\n1. Requires NUPI server running\n2. Network latency for remote AIs\n3. Model availability affects response time\n4. Context window limits apply\n\n### Related Skills\n- `nupi-workflow`: Complete NUPI usage guide\n- `ai-collaboration`: Multi-AI coordination patterns\n- `pdca-cycle`: Continuous improvement methodology",\n  "useCases": ["AI-to-AI communication", "system prompt management", "automated workflows", "cross-environment AI coordination"]}',
    'nezha-ai',
    'nezha-ai',
    '{\"builtAt\": \"2026-03-27\", \"builtBy\": \"nezha-ai\", \"source\": \"ai-built\", \"verified\": true}',
    'Created from NUPI REST API development - System Prompt推送功能完全实现'
)
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW(),
    content = EXCLUDED.content,
    description = EXCLUDED.description;
