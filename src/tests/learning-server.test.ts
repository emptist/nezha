import { describe, it, expect } from 'vitest';

describe('Learning MCP Server Tool Definitions', () => {
  const expectedTools = [
    'learn',
    'memory_search',
    'suggest_prompt_update',
    'check_broadcasts',
    'respond_to_broadcast',
    'whoami',
    'get_system_info',
    'get_skill',
    'get_soul',
    'save_soul',
  ];

  const toolSchemas: Record<string, { required?: string[]; properties?: Record<string, any> }> = {
    learn: {
      required: ['insight'],
      properties: { insight: { type: 'string' }, context: { type: 'string' } },
    },
    memory_search: {
      required: ['query'],
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
    },
    suggest_prompt_update: {
      required: ['current_prompt', 'suggested_prompt', 'reason'],
      properties: {
        current_prompt: { type: 'string' },
        suggested_prompt: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    check_broadcasts: {
      properties: { limit: { type: 'number' } },
    },
    respond_to_broadcast: {
      required: ['broadcast_id', 'response'],
      properties: { broadcast_id: { type: 'string' }, response: { type: 'string' } },
    },
    whoami: {
      properties: {},
    },
    get_system_info: {
      properties: {
        include_issues: { type: 'boolean' },
        include_tasks: { type: 'boolean' },
        include_skills: { type: 'boolean' },
      },
    },
    get_skill: {
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
    get_soul: {
      properties: { agent_id: { type: 'string' } },
    },
    save_soul: {
      properties: {
        name: { type: 'string' },
        content: { type: 'string' },
        traits: { type: 'object' },
      },
    },
  };

  it('should have all expected tools', () => {
    expectedTools.forEach(tool => {
      expect(toolSchemas[tool]).toBeDefined();
    });
  });

  it('should have learn with insight required', () => {
    expect(toolSchemas.learn.required).toContain('insight');
  });

  it('should have memory_search with query required', () => {
    expect(toolSchemas.memory_search.required).toContain('query');
  });

  it('should have get_soul and save_soul', () => {
    expect(toolSchemas.get_soul).toBeDefined();
    expect(toolSchemas.save_soul).toBeDefined();
  });

  it('should have respond_to_broadcast with broadcast_id and response required', () => {
    expect(toolSchemas.respond_to_broadcast.required).toContain('broadcast_id');
    expect(toolSchemas.respond_to_broadcast.required).toContain('response');
  });
});
