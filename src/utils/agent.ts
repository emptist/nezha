import { AgentIdentityService } from '../services/AgentIdentityService.js';

export async function getCurrentAgentId(): Promise<string> {
  const identity = await AgentIdentityService.getResolvedIdentity();
  return identity.id;
}

export async function appendAgentId(
  text: string,
  includeSignature: boolean = true
): Promise<string> {
  const agentId = await getCurrentAgentId();

  if (text.includes(`[${agentId}]`) || text.includes(agentId)) {
    return text;
  }

  const suffix = includeSignature ? `\n\n-- \nAgent: ${agentId}` : `\n\n[Agent: ${agentId}]`;

  return text + suffix;
}

export async function prependAgentId(text: string): Promise<string> {
  const agentId = await getCurrentAgentId();

  if (text.startsWith(`[${agentId}]`) || text.startsWith(agentId)) {
    return text;
  }

  return `[${agentId}] ${text}`;
}

export async function formatWithAgentId(
  text: string,
  position: 'prefix' | 'suffix' = 'suffix'
): Promise<string> {
  return position === 'prefix' ? prependAgentId(text) : appendAgentId(text);
}
