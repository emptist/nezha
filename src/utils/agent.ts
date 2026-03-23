import { Config } from '../config/Config.js';

export function getCurrentAgentId(): string {
  return Config.getInstance().getAgentId();
}

export function appendAgentId(text: string, includeSignature: boolean = true): string {
  const agentId = getCurrentAgentId();

  if (text.includes(`[${agentId}]`) || text.includes(agentId)) {
    return text;
  }

  const suffix = includeSignature ? `\n\n-- \nAgent: ${agentId}` : `\n\n[Agent: ${agentId}]`;

  return text + suffix;
}

export function prependAgentId(text: string): string {
  const agentId = getCurrentAgentId();

  if (text.startsWith(`[${agentId}]`) || text.startsWith(agentId)) {
    return text;
  }

  return `[${agentId}] ${text}`;
}

export function formatWithAgentId(text: string, position: 'prefix' | 'suffix' = 'suffix'): string {
  return position === 'prefix' ? prependAgentId(text) : appendAgentId(text);
}
