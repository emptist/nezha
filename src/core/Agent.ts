import { OPENCODE_API } from '../config/constants.js';
import { type AgentResponse, type AgentSession } from '../config/types.js';

export interface AgentConfig {
  host?: string;
  port?: number;
  timeout?: number;
}

export class Agent {
  private readonly host: string;
  private readonly port: number;
  private readonly timeout: number;

  constructor(config?: AgentConfig) {
    this.host = config?.host ?? OPENCODE_API.DEFAULT_HOST;
    this.port = config?.port ?? OPENCODE_API.DEFAULT_PORT;
    this.timeout = config?.timeout ?? 60000;
  }

  private getBaseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  async createSession(): Promise<AgentSession> {
    const response = await fetch(`${this.getBaseUrl()}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    const data = await response.json() as {
      id: string;
      projectID: string;
      time: { created: number };
    };
    return {
      id: data.id,
      projectId: data.projectID,
      createdAt: new Date(data.time.created),
    };
  }

  async sendMessage(sessionId: string, message: string): Promise<AgentResponse> {
    const response = await fetch(`${this.getBaseUrl()}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }],
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Failed to send message: ${response.statusText}`,
      };
    }

    return {
      success: true,
      sessionId,
    };
  }

  async executeTask(message: string): Promise<AgentResponse> {
    try {
      const session = await this.createSession();
      return await this.sendMessage(session.id, message);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
